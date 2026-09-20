import { ABANG } from '@/abang/config'
import { type AdDay, num, syncAdDays, adDays, adTotals, daysAgoISO } from './ads-daily'
import type { Rec } from './records'
import { type AdRow, type AdMetrics, emptyMetrics, upsertAdRows, adRows } from './ads-leaderboard'

// Meta Ads (Facebook + Instagram) → the ONE `records` table, one 'meta_ads' row
// per day. This module only knows how to FETCH days from Meta's Marketing API;
// storage and the read helpers are the shared lib/ads-daily.ts. See
// abang/config.ts → metaAds for the ad account id.
//
// Secrets: META_ADS_TOKEN only (server-only, from Vercel env) — a long-lived
// System User token from Meta Business Settings with ads_read on the account.

export const CATEGORY = 'meta_ads'
export const metaConfigured = !!process.env.META_ADS_TOKEN?.trim()

const GRAPH = 'https://graph.facebook.com/v21.0'
const FIELDS = ['spend', 'impressions', 'clicks', 'reach', 'cpm', 'cpc', 'ctr', 'actions', 'video_play_actions'].join(',')

// Purchases (or any "result") from the actions list — Meta reports each action
// type separately; we take website/omni purchases as the conversion count.
const purchases = (actions: any[] | undefined) =>
  (actions ?? [])
    .filter(a => a.action_type === 'omni_purchase' || a.action_type === 'purchase')
    .reduce((s, a) => s + num(a.value), 0)
const videoViews = (vpa: any[] | undefined) =>
  (vpa ?? []).filter(a => a.action_type === 'video_view').reduce((s, a) => s + num(a.value), 0)

// ---- 1) Ask Meta for one row per day, start..end inclusive. ----
export async function fetchMetaDaily(start: string, end: string): Promise<AdDay[]> {
  const token = process.env.META_ADS_TOKEN?.trim()
  if (!token) throw new Error('META_ADS_TOKEN is not set')
  const account = ABANG.metaAds.adAccountId.startsWith('act_') ? ABANG.metaAds.adAccountId : `act_${ABANG.metaAds.adAccountId}`

  const out: AdDay[] = []
  const params = new URLSearchParams({
    level: 'account',
    time_increment: '1',
    time_range: JSON.stringify({ since: start, until: end }),
    fields: FIELDS,
    limit: '500',
    access_token: token,
  })
  let url: string | null = `${GRAPH}/${account}/insights?${params}`
  for (let guard = 0; url && guard < 20; guard++) {
    const res: Response = await fetch(url, { signal: AbortSignal.timeout(25_000) })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok || body?.error) {
      const msg = body?.error?.message || `HTTP ${res.status}`
      throw new Error(`Meta said no: ${String(msg).slice(0, 200)}`)
    }
    for (const r of body.data ?? []) {
      const date = String(r.date_start ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      out.push({
        date,
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        reach: num(r.reach),
        video_views: videoViews(r.video_play_actions),
        conversions: purchases(r.actions),
        cpm: num(r.cpm),
        cpc: num(r.cpc),
        ctr: num(r.ctr),
      })
    }
    // Never log or store the paging URL: it carries the access token.
    url = body.paging?.next ?? null
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// One Graph API GET (paged), token never logged. Returns all `data` items.
async function metaGetAll(path: string, params: Record<string, string>): Promise<any[]> {
  const token = process.env.META_ADS_TOKEN?.trim()
  if (!token) throw new Error('META_ADS_TOKEN is not set')
  const out: any[] = []
  let url: string | null = `${GRAPH}/${path}?${new URLSearchParams({ ...params, access_token: token })}`
  for (let guard = 0; url && guard < 20; guard++) {
    const res: Response = await fetch(url, { signal: AbortSignal.timeout(25_000) })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok || body?.error) throw new Error(`Meta said no: ${String(body?.error?.message || `HTTP ${res.status}`).slice(0, 200)}`)
    out.push(...(body.data ?? []))
    url = body.paging?.next ?? null
  }
  return out
}
const account = () => (ABANG.metaAds.adAccountId.startsWith('act_') ? ABANG.metaAds.adAccountId : `act_${ABANG.metaAds.adAccountId}`)

// ---- 1b) Per-ad totals for a window (level=ad). ----
async function fetchMetaAdWindow(start: string, end: string): Promise<Map<string, { name: string; campaign: string; adset: string; m: AdMetrics }>> {
  const out = new Map<string, { name: string; campaign: string; adset: string; m: AdMetrics }>()
  const rows = await metaGetAll(`${account()}/insights`, {
    level: 'ad',
    time_range: JSON.stringify({ since: start, until: end }),
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,actions,video_play_actions',
    limit: '500',
  })
  for (const r of rows) {
    out.set(String(r.ad_id), {
      name: String(r.ad_name || ''),
      campaign: String(r.campaign_name || ''),
      adset: String(r.adset_name || ''),
      m: { spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), video_views: videoViews(r.video_play_actions), conversions: purchases(r.actions) },
    })
  }
  return out
}

// Every ad with its four windows, delivery status and creative thumbnail.
export async function fetchMetaAdRows(): Promise<AdRow[]> {
  const y = daysAgoISO(1)
  const [d7, p7, d30, p30] = await Promise.all([
    fetchMetaAdWindow(daysAgoISO(7), y),
    fetchMetaAdWindow(daysAgoISO(14), daysAgoISO(8)),
    fetchMetaAdWindow(daysAgoISO(30), y),
    fetchMetaAdWindow(daysAgoISO(60), daysAgoISO(31)),
  ])
  const info = new Map<string, { status: AdRow['status']; note: string; thumbnail?: string; ends?: string }>()
  try {
    const ads = await metaGetAll(`${account()}/ads`, { fields: 'id,effective_status,adset{end_time},creative{thumbnail_url}', limit: '500' })
    const now = Date.now()
    for (const a of ads) {
      const eff = String(a.effective_status || '')
      const ends = a.adset?.end_time ? String(a.adset.end_time) : undefined
      // Meta keeps a finished ad 'ACTIVE' — the ad set's schedule is what ended.
      const finished = !!ends && new Date(ends).getTime() < now
      info.set(String(a.id), {
        status: finished ? 'completed' : eff === 'ACTIVE' ? 'active' : /PAUSED/.test(eff) ? 'paused' : 'other',
        note: finished ? `ended ${ends!.slice(0, 10)}` : eff,
        thumbnail: a.creative?.thumbnail_url || undefined,
        ends,
      })
    }
  } catch (e) {
    console.warn('[CFO] meta ad status lookup failed:', (e as Error).message)
  }
  const ids = new Set([...d7.keys(), ...p7.keys(), ...d30.keys(), ...p30.keys()])
  const rows: AdRow[] = []
  for (const id of ids) {
    const meta = d30.get(id) ?? d7.get(id) ?? p30.get(id) ?? p7.get(id)!
    const st = info.get(id)
    rows.push({
      ad_id: id,
      name: meta.name || `Ad ${id}`,
      campaign: meta.campaign,
      adset: meta.adset,
      status: st?.status ?? 'other',
      status_note: st?.note,
      ends: st?.ends,
      thumbnail: st?.thumbnail,
      d7: d7.get(id)?.m ?? emptyMetrics(),
      p7: p7.get(id)?.m ?? emptyMetrics(),
      d30: d30.get(id)?.m ?? emptyMetrics(),
      p30: p30.get(id)?.m ?? emptyMetrics(),
    })
  }
  return rows
}

export const AD_CATEGORY = 'meta_ad'
export const metaAdRows = (rows: Rec[]) => adRows(rows, AD_CATEGORY)

// ---- 2) Upsert into `records` (shared): the daily rows, then the per-ad rows. ----
export async function syncMetaAds(opts: { days?: number; dryRun?: boolean } = {}) {
  const r: any = await syncMetaDaily(opts)
  if (r.skipped || opts.dryRun) return r
  try {
    const ads = await fetchMetaAdRows()
    const u = await upsertAdRows(AD_CATEGORY, 'Meta', ads)
    return { ...r, ads: ads.length, ads_inserted: u.inserted, ads_updated: u.updated }
  } catch (e) {
    console.error('[CFO] meta ad-level sync failed:', e)
    return { ...r, ads_error: String((e as Error)?.message || e).slice(0, 200) }
  }
}

function syncMetaDaily(opts: { days?: number; dryRun?: boolean }) {
  return syncAdDays({
    category: CATEGORY,
    label: 'Meta Ads',
    platform: 'Meta',
    extraMeta: { ad_account_id: ABANG.metaAds.adAccountId },
    configured: metaConfigured,
    notConfiguredReason: 'META_ADS_TOKEN not set',
    syncDays: ABANG.metaAds.syncDays,
    backfillDays: ABANG.metaAds.backfillDays,
    fetch: fetchMetaDaily,
    ...opts,
  })
}

// ---- 3) Read helpers (shared). ----
export const metaDays = (rows: Rec[]) => adDays(rows, CATEGORY)
export const metaTotals = adTotals
