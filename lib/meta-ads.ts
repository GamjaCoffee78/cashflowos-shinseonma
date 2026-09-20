import { ABANG } from '@/abang/config'
import { type AdDay, num, syncAdDays, adDays, adTotals } from './ads-daily'
import type { Rec } from './records'

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

// ---- 2) Upsert into `records` (shared). ----
export function syncMetaAds(opts: { days?: number; dryRun?: boolean } = {}) {
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
