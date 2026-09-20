import { ABANG } from '@/abang/config'
import { type AdDay, num, addDays, daysAgoISO, syncAdDays, adDays, adTotals, compact, type AdTotals } from './ads-daily'
import type { Rec } from './records'

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

// ---- 2) Upsert into `records` (shared). ----
export function syncTikTokAds(opts: { days?: number; dryRun?: boolean } = {}) {
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
