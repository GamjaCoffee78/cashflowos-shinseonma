import { supabase, supabaseConfigured } from './supabase'
import { todayISO, type Rec } from './records'
import { ABANG } from '@/abang/config'

// TikTok Ads → the ONE `records` table.
//
// Every day the cron calls syncTikTokAds(): it asks TikTok (through Composio,
// where the ad account is linked) for the last few days of advertiser-level
// numbers and upserts ONE row per day with category 'tiktok_ads'. amount =
// that day's spend (RM); everything else lives in meta. The tab, the brief and
// Gamja then read those rows like any other — no live API calls at page time.
//
// Secrets: COMPOSIO_API_KEY only (server-only, from Vercel env) — a Platform
// project key from dashboard.composio.dev; TikTok Ads must be linked in that
// same project. The advertiser and account ids are plain settings in abang/config.ts.

export type TikTokDay = {
  date: string        // YYYY-MM-DD (advertiser timezone, Asia/Kuala_Lumpur)
  spend: number       // RM
  impressions: number
  clicks: number
  reach: number
  video_views: number
  conversions: number
  cpm: number
  cpc: number
  ctr: number         // percent, as TikTok reports it (0.34 = 0.34%)
}

export const CATEGORY = 'tiktok_ads'
export const tiktokConfigured = !!process.env.COMPOSIO_API_KEY?.trim()

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const METRICS = ['spend', 'impressions', 'clicks', 'reach', 'video_play_actions', 'conversion', 'cpm', 'cpc', 'ctr']

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// ISO date n days before today (business timezone).
export function daysAgoISO(n: number): string {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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

// ---- 2) Upsert those days into `records` (one row per day, keyed on due_date). ----
export async function syncTikTokAds(opts: { days?: number; dryRun?: boolean } = {}) {
  if (!tiktokConfigured) return { skipped: 'COMPOSIO_API_KEY not set' as const }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured' as const }

  // What do we already have? Decides backfill-vs-refresh and gives us ids to update.
  const existing = new Map<string, number>()
  if (supabaseConfigured) {
    const { data, error } = await supabase
      .from('records')
      .select('id, due_date')
      .eq('category', CATEGORY)
      .order('due_date', { ascending: true })
      .limit(2000)
    if (error) throw new Error(`could not read tiktok_ads rows: ${error.message}`)
    for (const r of data ?? []) if (r.due_date) existing.set(r.due_date, r.id)
  }
  const days = opts.days ?? (existing.size ? ABANG.tiktokAds.syncDays : ABANG.tiktokAds.backfillDays)
  const start = daysAgoISO(days)
  const end = daysAgoISO(1) // yesterday — today is still moving

  const fetched = await fetchTikTokDaily(start, end)
  if (opts.dryRun) return { from: start, to: end, fetched: fetched.length, inserted: 0, updated: 0, rows: fetched }

  let inserted = 0, updated = 0
  const toInsert: any[] = []
  for (const d of fetched) {
    const row = {
      title: `TikTok Ads — ${d.date}`,
      status: 'synced',
      amount: d.spend,
      category: CATEGORY,
      due_date: d.date,
      notes: `${d.impressions.toLocaleString('en-MY')} impressions · ${d.clicks.toLocaleString('en-MY')} clicks · CTR ${d.ctr}%`,
      meta: { source: 'tiktok_ads', platform: 'TikTok', advertiser_id: ABANG.tiktokAds.advertiserId, ...d, synced_at: new Date().toISOString() },
    }
    const id = existing.get(d.date)
    if (id) {
      const { error } = await supabase.from('records').update(row).eq('id', id)
      if (error) throw new Error(`update ${d.date} failed: ${error.message}`)
      updated++
    } else toInsert.push(row)
  }
  if (toInsert.length) {
    const { error } = await supabase.from('records').insert(toInsert)
    if (error) throw new Error(`insert failed: ${error.message}`)
    inserted = toInsert.length
  }
  return { from: start, to: end, fetched: fetched.length, inserted, updated }
}

// ---- 3) Read helpers for the tab + the brief (pure, from records). ----
export function tiktokDays(rows: Rec[]): TikTokDay[] {
  return rows
    .filter(r => r.category === CATEGORY && r.due_date)
    .map(r => ({
      date: r.due_date as string,
      spend: num(r.amount),
      impressions: num(r.meta?.impressions),
      clicks: num(r.meta?.clicks),
      reach: num(r.meta?.reach),
      video_views: num(r.meta?.video_views),
      conversions: num(r.meta?.conversions),
      cpm: num(r.meta?.cpm),
      cpc: num(r.meta?.cpc),
      ctr: num(r.meta?.ctr),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type TikTokTotals = { days: number; spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number }

// Totals for the last n days (ending yesterday). CTR/CPC/CPM are recomputed from
// the sums, not averaged — an average of daily percentages is the wrong number.
export function tiktokTotals(days: TikTokDay[], n: number): TikTokTotals {
  const from = daysAgoISO(n)
  const w = days.filter(d => d.date >= from)
  const spend = w.reduce((s, d) => s + d.spend, 0)
  const impressions = w.reduce((s, d) => s + d.impressions, 0)
  const clicks = w.reduce((s, d) => s + d.clicks, 0)
  return {
    days: w.length,
    spend,
    impressions,
    clicks,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
  }
}

// Compact number for tiles: 1.3M · 38.2k · 912.
export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
