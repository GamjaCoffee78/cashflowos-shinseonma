import { supabase, supabaseConfigured } from './supabase'
import { todayISO, type Rec } from './records'

// Shared shape + helpers for the ad-platform tabs (TikTok Ads, Meta Ads).
// Each platform stores ONE `records` row per day in its own category
// ('tiktok_ads', 'meta_ads'); amount = that day's spend, the rest in meta.
// The tab, the brief and Abang all read those rows — no live API calls at
// page time. Platform modules (lib/tiktok-ads.ts, lib/meta-ads.ts) only know
// how to FETCH their days; everything else is here.

export type AdDay = {
  date: string        // YYYY-MM-DD (ad account timezone, Asia/Kuala_Lumpur)
  spend: number       // RM
  impressions: number
  clicks: number
  reach: number
  video_views: number
  conversions: number
  cpm: number
  cpc: number
  ctr: number         // percent (0.34 = 0.34%)
}

export const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// ISO date n days before today (business timezone).
export function daysAgoISO(n: number): string {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---- Upsert a platform's days into `records` (one row per day, keyed on due_date). ----
export type SyncResult =
  | { skipped: string }
  | { from: string; to: string; fetched: number; inserted: number; updated: number; rows?: AdDay[] }

export async function syncAdDays(opts: {
  category: string
  label: string                        // "TikTok Ads" — used in the row title
  platform: string                     // "TikTok" · "Meta"
  extraMeta?: Record<string, unknown>  // account ids etc., stored on every row
  configured: boolean
  notConfiguredReason: string
  syncDays: number
  backfillDays: number
  fetch: (start: string, end: string) => Promise<AdDay[]>
  days?: number
  dryRun?: boolean
}): Promise<SyncResult> {
  if (!opts.configured) return { skipped: opts.notConfiguredReason }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured' }

  // What do we already have? Decides backfill-vs-refresh and gives us ids to update.
  const existing = new Map<string, number>()
  if (supabaseConfigured) {
    const { data, error } = await supabase
      .from('records')
      .select('id, due_date')
      .eq('category', opts.category)
      .order('due_date', { ascending: true })
      .limit(2000)
    if (error) throw new Error(`could not read ${opts.category} rows: ${error.message}`)
    for (const r of data ?? []) if (r.due_date) existing.set(r.due_date, r.id)
  }
  const days = opts.days ?? (existing.size ? opts.syncDays : opts.backfillDays)
  const start = daysAgoISO(days)
  const end = daysAgoISO(1) // yesterday — today is still moving

  const fetched = await opts.fetch(start, end)
  if (opts.dryRun) return { from: start, to: end, fetched: fetched.length, inserted: 0, updated: 0, rows: fetched }

  let inserted = 0, updated = 0
  const toInsert: any[] = []
  for (const d of fetched) {
    const row = {
      title: `${opts.label} — ${d.date}`,
      status: 'synced',
      amount: d.spend,
      category: opts.category,
      due_date: d.date,
      notes: `${d.impressions.toLocaleString('en-MY')} impressions · ${d.clicks.toLocaleString('en-MY')} clicks · CTR ${d.ctr}%`,
      meta: { source: opts.category, platform: opts.platform, ...opts.extraMeta, ...d, synced_at: new Date().toISOString() },
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

// ---- Read helpers for the tabs + the brief (pure, from records). ----
export function adDays(rows: Rec[], category: string): AdDay[] {
  return rows
    .filter(r => r.category === category && r.due_date)
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

export type AdTotals = { days: number; spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number }

// Totals for the last n days (ending yesterday). CTR/CPC/CPM are recomputed from
// the sums, not averaged — an average of daily percentages is the wrong number.
export function adTotals(days: AdDay[], n: number): AdTotals {
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

// Compact number for tiles: 1.3M · 38k · 912.
export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
