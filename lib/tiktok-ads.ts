import { ABANG } from '@/abang/config'
import { type AdDay, num, addDays, daysAgoISO, syncAdDays, adDays, adTotals, compact, type AdTotals } from './ads-daily'
import type { Rec } from './records'
import { type AdRow, type AdMetrics, emptyMetrics, upsertAdRows, adRows } from './ads-leaderboard'

// TikTok Ads → the ONE `records` table, one 'tiktok_ads' row per day.
// This module only knows how to FETCH days from TikTok (through Composio's
// proxy, where the ad account is linked); storage and the read helpers are the
// shared lib/ads-daily.ts. See abang/config.ts → tiktokAds for the ids.
//
// Secrets: COMPOSIO_API_KEY only (server-only, from Vercel env) — a Platform
// project key from dashboard.composio.dev; TikTok Ads must be linked in that
// same project.

export type TikTokDay = AdDay
export type TikTokTotals = AdTotals
export { daysAgoISO, compact }

export const CATEGORY = 'tiktok_ads'
export const tiktokConfigured = !!process.env.COMPOSIO_API_KEY?.trim()

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const METRICS = ['spend', 'impressions', 'clicks', 'reach', 'video_play_actions', 'conversion', 'cpm', 'cpc', 'ctr']

// One GET against TikTok's Marketing API through Composio's proxy (the OAuth
// token never leaves Composio). Returns TikTok's `data` payload or throws.
async function tiktokGet(endpoint: string, q: Record<string, string>): Promise<any> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected_account_id: ABANG.tiktokAds.composioAccount,
      method: 'GET',
      endpoint: `https://business-api.tiktok.com/open_api/v1.3${endpoint}`,
      parameters: Object.entries(q).map(([name, value]) => ({ name, value, type: 'query' })),
    }),
    signal: AbortSignal.timeout(25_000),
  })
  const body: any = await res.json().catch(() => ({}))
  const tt = body?.data
  if (!res.ok || body?.error || (tt && tt.code !== 0)) {
    const msg = body?.error?.message || tt?.message || `HTTP ${res.status}`
    throw new Error(`Composio/TikTok said no: ${String(msg).slice(0, 200)}`)
  }
  return tt?.data ?? {}
}

// ---- 1) Ask TikTok (via Composio) for one row per day, start..end inclusive. ----
// TikTok allows at most 30 days per daily report, so longer spans are chunked.
export async function fetchTikTokDaily(start: string, end: string): Promise<TikTokDay[]> {
  const out: TikTokDay[] = []
  for (let from = start; from <= end; from = addDays(from, 30)) {
    const to = addDays(from, 29) < end ? addDays(from, 29) : end
    out.push(...(await fetchWindow(from, to)))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchWindow(start: string, end: string): Promise<TikTokDay[]> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const { advertiserId, composioAccount } = ABANG.tiktokAds

  const out: TikTokDay[] = []
  let page = 1
  for (;;) {
    // TikTok's own reporting endpoint, called through Composio's proxy so the
    // OAuth token never leaves Composio. (Array params are JSON-encoded strings.)
    const q: Record<string, string> = {
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_ADVERTISER',
      dimensions: JSON.stringify(['stat_time_day']),
      metrics: JSON.stringify(METRICS),
      start_date: start,
      end_date: end,
      page: String(page),
      page_size: '200',
    }
    const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected_account_id: composioAccount,
        method: 'GET',
        endpoint: 'https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/',
        parameters: Object.entries(q).map(([name, value]) => ({ name, value, type: 'query' })),
      }),
      signal: AbortSignal.timeout(25_000),
    })
    const body: any = await res.json().catch(() => ({}))
    // Composio wraps TikTok's reply as { data: { code, message, data: { list, page_info } } }.
    const tt = body?.data
    if (!res.ok || body?.error || (tt && tt.code !== 0)) {
      const msg = body?.error?.message || tt?.message || `HTTP ${res.status}`
      throw new Error(`Composio/TikTok said no: ${String(msg).slice(0, 200)}`)
    }
    const data = tt?.data ?? {}
    for (const r of data.list ?? []) {
      const mtr = r.metrics ?? {}
      const date = String(r.dimensions?.stat_time_day ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      out.push({
        date,
        spend: num(mtr.spend),
        impressions: num(mtr.impressions),
        clicks: num(mtr.clicks),
        reach: num(mtr.reach),
        video_views: num(mtr.video_play_actions),
        conversions: num(mtr.conversion),
        cpm: num(mtr.cpm),
        cpc: num(mtr.cpc),
        ctr: num(mtr.ctr),
      })
    }
    const totalPages = Number(data.page_info?.total_page ?? 1)
    if (page >= totalPages || page >= 20) break
    page++
  }
  return out
}

// ---- 1b) Per-ad totals for a window (AUCTION_AD level). ----
const AD_METRICS = ['ad_name', 'campaign_name', 'adgroup_name', 'spend', 'impressions', 'clicks', 'video_play_actions', 'conversion']
async function fetchTikTokAdWindow(start: string, end: string): Promise<Map<string, { name: string; campaign: string; adset: string; m: AdMetrics }>> {
  const out = new Map<string, { name: string; campaign: string; adset: string; m: AdMetrics }>()
  for (let page = 1; page <= 10; page++) {
    const data = await tiktokGet('/report/integrated/get/', {
      advertiser_id: ABANG.tiktokAds.advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: JSON.stringify(['ad_id']),
      metrics: JSON.stringify(AD_METRICS),
      start_date: start,
      end_date: end,
      page: String(page),
      page_size: '200',
    })
    for (const r of data.list ?? []) {
      const mtr = r.metrics ?? {}
      out.set(String(r.dimensions?.ad_id), {
        name: String(mtr.ad_name || ''),
        campaign: String(mtr.campaign_name || ''),
        adset: String(mtr.adgroup_name || ''),
        m: { spend: num(mtr.spend), impressions: num(mtr.impressions), clicks: num(mtr.clicks), video_views: num(mtr.video_play_actions), conversions: num(mtr.conversion) },
      })
    }
    if (page >= Number(data.page_info?.total_page ?? 1)) break
  }
  return out
}

// Every ad with its four windows + delivery status. Thumbnails: TikTok Spark
// Ads point at TikTok posts, not uploaded videos, so there is no cover to show.
export async function fetchTikTokAdRows(): Promise<AdRow[]> {
  const y = daysAgoISO(1)
  const [d7, p7, d30, p30] = await Promise.all([
    fetchTikTokAdWindow(daysAgoISO(7), y),
    fetchTikTokAdWindow(daysAgoISO(14), daysAgoISO(8)),
    fetchTikTokAdWindow(daysAgoISO(30), y),
    fetchTikTokAdWindow(daysAgoISO(60), daysAgoISO(31)),
  ])
  const status = new Map<string, { status: AdRow['status']; note: string; ends?: string }>()
  try {
    // Ad groups carry the schedule; an ad whose group's end date has passed is
    // 'completed' (TikTok still reports it ENABLE / CAMPAIGN_DISABLE).
    const groups = await tiktokGet('/adgroup/get/', {
      advertiser_id: ABANG.tiktokAds.advertiserId,
      fields: JSON.stringify(['adgroup_id', 'schedule_type', 'schedule_end_time']),
      page_size: '500',
    })
    const endOf = new Map<string, string>()
    for (const g of groups.list ?? []) if (g.schedule_type === 'SCHEDULE_START_END' && g.schedule_end_time) endOf.set(String(g.adgroup_id), String(g.schedule_end_time))
    const data = await tiktokGet('/ad/get/', {
      advertiser_id: ABANG.tiktokAds.advertiserId,
      fields: JSON.stringify(['ad_id', 'adgroup_id', 'operation_status', 'secondary_status']),
      page_size: '500',
    })
    const now = Date.now()
    for (const a of data.list ?? []) {
      const ends = endOf.get(String(a.adgroup_id))
      // TikTok schedules are in the advertiser's timezone (Asia/Kuala_Lumpur, +08:00).
      const finished = !!ends && new Date(ends.replace(' ', 'T') + '+08:00').getTime() < now
      const ok = a.operation_status === 'ENABLE' && /DELIVERY_OK/.test(String(a.secondary_status || ''))
      status.set(String(a.ad_id), {
        status: finished ? 'completed' : ok ? 'active' : a.operation_status === 'DISABLE' || /CAMPAIGN_DISABLE|ADGROUP_DISABLE/.test(String(a.secondary_status || '')) ? 'paused' : 'other',
        note: finished ? `ended ${ends!.slice(0, 10)}` : String(a.secondary_status || ''),
        ends,
      })
    }
  } catch (e) {
    console.warn('[CFO] tiktok ad status lookup failed:', (e as Error).message)
  }
  const ids = new Set([...d7.keys(), ...p7.keys(), ...d30.keys(), ...p30.keys()])
  const rows: AdRow[] = []
  for (const id of ids) {
    const info = d30.get(id) ?? d7.get(id) ?? p30.get(id) ?? p7.get(id)!
    const st = status.get(id)
    rows.push({
      ad_id: id,
      name: info.name || `Ad ${id}`,
      campaign: info.campaign,
      adset: info.adset,
      status: st?.status ?? 'other',
      status_note: st?.note,
      ends: st?.ends,
      d7: d7.get(id)?.m ?? emptyMetrics(),
      p7: p7.get(id)?.m ?? emptyMetrics(),
      d30: d30.get(id)?.m ?? emptyMetrics(),
      p30: p30.get(id)?.m ?? emptyMetrics(),
    })
  }
  return rows
}

export const AD_CATEGORY = 'tiktok_ad'
export const tiktokAdRows = (rows: Rec[]) => adRows(rows, AD_CATEGORY)

// ---- 2) Upsert into `records` (shared): the daily rows, then the per-ad rows. ----
export async function syncTikTokAds(opts: { days?: number; dryRun?: boolean } = {}) {
  const r: any = await syncTikTokDaily(opts)
  if (r.skipped || opts.dryRun) return r
  try {
    const ads = await fetchTikTokAdRows()
    const u = await upsertAdRows(AD_CATEGORY, 'TikTok', ads)
    return { ...r, ads: ads.length, ads_inserted: u.inserted, ads_updated: u.updated }
  } catch (e) {
    console.error('[CFO] tiktok ad-level sync failed:', e)
    return { ...r, ads_error: String((e as Error)?.message || e).slice(0, 200) }
  }
}

function syncTikTokDaily(opts: { days?: number; dryRun?: boolean }) {
  return syncAdDays({
    category: CATEGORY,
    label: 'TikTok Ads',
    platform: 'TikTok',
    extraMeta: { advertiser_id: ABANG.tiktokAds.advertiserId },
    configured: tiktokConfigured,
    notConfiguredReason: 'COMPOSIO_API_KEY not set',
    syncDays: ABANG.tiktokAds.syncDays,
    backfillDays: ABANG.tiktokAds.backfillDays,
    fetch: fetchTikTokDaily,
    ...opts,
  })
}

// ---- 3) Read helpers (shared). ----
export const tiktokDays = (rows: Rec[]) => adDays(rows, CATEGORY)
export const tiktokTotals = adTotals
