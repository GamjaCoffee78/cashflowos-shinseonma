import { supabase, supabaseConfigured } from './supabase'
import { todayISO, type Rec } from './records'
import { num } from './ads-daily'

// Per-AD performance for the ad-platform tabs (the 🏆 Top ads + leaderboard).
//
// Each platform stores ONE `records` row per ad (category 'tiktok_ad' /
// 'meta_ad', keyed on meta.ad_id) and refreshes it every morning with four
// windows: last 7 days, the 7 before that, last 30, the 30 before that. That
// is a dozen rows per platform rather than ads × days, so the tab stays fast
// and the same rows can answer "which ad is winning?" for both periods.

export type AdMetrics = { spend: number; impressions: number; clicks: number; video_views: number; conversions: number }
export type AdRow = {
  ad_id: string
  name: string
  campaign: string
  adset: string
  status: 'active' | 'paused' | 'completed' | 'other'
  starts?: string        // scheduled start (ISO), when the platform has one
  ends?: string          // scheduled end (ISO), when the platform has one
  status_note?: string
  thumbnail?: string
  d7: AdMetrics
  p7: AdMetrics
  d30: AdMetrics
  p30: AdMetrics
}
export type Window = '7' | '30'

export const emptyMetrics = (): AdMetrics => ({ spend: 0, impressions: 0, clicks: 0, video_views: 0, conversions: 0 })
export const ctrOf = (m: AdMetrics) => (m.impressions ? (m.clicks / m.impressions) * 100 : 0)
export const cpcOf = (m: AdMetrics) => (m.clicks ? m.spend / m.clicks : 0)
export const cur = (r: AdRow, w: Window) => (w === '7' ? r.d7 : r.d30)
export const prev = (r: AdRow, w: Window) => (w === '7' ? r.p7 : r.p30)

// ---- Upsert one row per ad (keyed on meta.ad_id). Never deletes. ----
export async function upsertAdRows(category: string, platform: string, rows: AdRow[]) {
  if (!supabaseConfigured) return { inserted: 0, updated: 0 }
  const { data, error } = await supabase.from('records').select('id, meta').eq('category', category).limit(2000)
  if (error) throw new Error(`could not read ${category} rows: ${error.message}`)
  const existing = new Map<string, number>()
  for (const r of data ?? []) if (r.meta?.ad_id) existing.set(String(r.meta.ad_id), r.id)

  let inserted = 0, updated = 0
  const toInsert: any[] = []
  for (const a of rows) {
    const row = {
      title: a.name,
      status: a.status,
      amount: a.d30.spend,
      category,
      due_date: todayISO(),
      notes: `${a.campaign}${a.adset && a.adset !== a.campaign ? ` · ${a.adset}` : ''}`,
      meta: { source: category, platform, ...a, synced_at: new Date().toISOString() },
    }
    const id = existing.get(a.ad_id)
    if (id) {
      const { error } = await supabase.from('records').update(row).eq('id', id)
      if (error) throw new Error(`update ad ${a.ad_id} failed: ${error.message}`)
      updated++
    } else toInsert.push(row)
  }
  if (toInsert.length) {
    const { error } = await supabase.from('records').insert(toInsert)
    if (error) throw new Error(`insert ads failed: ${error.message}`)
    inserted = toInsert.length
  }
  return { inserted, updated }
}

// ---- Read back from records. ----
const m = (v: any): AdMetrics => ({
  spend: num(v?.spend), impressions: num(v?.impressions), clicks: num(v?.clicks), video_views: num(v?.video_views), conversions: num(v?.conversions),
})
export function adRows(rows: Rec[], category: string): AdRow[] {
  return rows
    .filter(r => r.category === category && r.meta?.ad_id)
    .map(r => ({
      ad_id: String(r.meta.ad_id),
      name: r.title,
      campaign: String(r.meta.campaign || ''),
      adset: String(r.meta.adset || ''),
      status: (r.meta.status as AdRow['status']) || 'other',
      status_note: r.meta.status_note ? String(r.meta.status_note) : undefined,
      starts: r.meta.starts ? String(r.meta.starts) : undefined,
      ends: r.meta.ends ? String(r.meta.ends) : undefined,
      thumbnail: r.meta.thumbnail ? String(r.meta.thumbnail) : undefined,
      d7: m(r.meta.d7), p7: m(r.meta.p7), d30: m(r.meta.d30), p30: m(r.meta.p30),
    }))
}

// ---- Show the name the advertiser typed, not Meta's auto-generated one. ----
// Boosting an Instagram post makes Meta name the AD after the post's caption
// ("Instagram post: I miss Tteokbokki so much after…"). The hand-written name
// — "IG Post: Okmaya SG TBK (Miss TBK from Korea) (23 Sep - 6 Oct)" — sits on
// the campaign. Where a campaign holds several ads the campaign name alone
// would make them indistinguishable, so those keep their own name appended.
export function preferCampaignNames(rows: AdRow[]): AdRow[] {
  const perCampaign = new Map<string, number>()
  for (const r of rows) {
    const c = r.campaign || r.adset
    if (c) perCampaign.set(c, (perCampaign.get(c) ?? 0) + 1)
  }
  return rows.map(r => {
    const c = r.campaign || r.adset
    if (!c) return r
    return { ...r, name: perCampaign.get(c)! > 1 && r.name && r.name !== c ? `${c} · ${r.name}` : c }
  })
}

// ---- Ranking: by CTR, among ads that actually ran in the window. ----
export const MIN_IMPRESSIONS = 500
export function ranked(rows: AdRow[], w: Window): AdRow[] {
  return rows
    .filter(r => cur(r, w).impressions >= MIN_IMPRESSIONS && cur(r, w).spend > 0)
    .sort((a, b) => ctrOf(cur(b, w)) - ctrOf(cur(a, w)))
}

// ---- Campaign block order on the tab. ----
// 'spend' is the original: biggest spender on top.
// 'live-first' (Meta Ads) stacks them the way you'd work through them —
// still-running campaigns first, then the newest by ad set end date, then
// best CTR. A block counts as live if any ad in it is still delivering.
export type GroupOrder = 'spend' | 'live-first'

// "Still in flight", which is NOT the same as Meta's ACTIVE flag: Meta keeps an
// ad ACTIVE for as long as its campaign is on, so ads that finished their run
// months ago still come back ACTIVE. An ad counts as live here only if its
// schedule hasn't passed — or, when it has no end date, if it actually spent
// something in the window.
export function adIsLive(r: AdRow, w: Window): boolean {
  if (r.status !== 'active') return false
  if (r.ends) return r.ends.slice(0, 10) >= todayISO()
  return cur(r, w).spend > 0
}
export const groupIsLive = (list: AdRow[], w: Window) => list.some(r => adIsLive(r, w))
export const groupEndsAt = (list: AdRow[]) =>
  list.reduce((latest, r) => (r.ends && r.ends > latest ? r.ends : latest), '')

// ---- Flight period, for grouping the finished ads. ----
// The ad SET's schedule is the source of truth. Ad names usually carry the same
// period in brackets — "(23 Sep - 6 Oct)" — but they are typed by hand and can
// disagree with the real dates, so the name is only a fallback for ads whose
// schedule hasn't been synced yet.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, label: `${d} ${MONTHS[m - 1]}` }
}
// "(9 - 22 Sep)", "(26 Aug – 8 Sep)", "(11th August - 25th August)" → the text.
const namePeriod = (name: string) => {
  const m = name.match(/\(([^()]*\d[^()]*[-–—][^()]*\d[^()]*)\)\s*$/)
  return m ? m[1].replace(/\s+/g, ' ').replace(/[-–—]/g, '–').trim() : ''
}
export function periodOf(r: AdRow): { key: string; label: string } {
  if (r.starts && r.ends) {
    const a = dmy(r.starts), b = dmy(r.ends)
    const year = a.y === b.y ? (b.y === new Date().getUTCFullYear() ? '' : ` ${b.y}`) : ''
    return { key: `${r.starts.slice(0, 10)}_${r.ends.slice(0, 10)}`, label: `${a.label} – ${b.label}${year}` }
  }
  const fromName = namePeriod(r.name) || namePeriod(r.campaign)
  if (fromName) return { key: `name:${fromName.toLowerCase()}`, label: fromName }
  if (r.ends) return { key: `ends:${r.ends.slice(0, 10)}`, label: `ended ${dmy(r.ends).label}` }
  return { key: 'no-period', label: 'No set period' }
}

export function orderGroups(groups: Map<string, AdRow[]>, w: Window, order: GroupOrder): [string, AdRow[]][] {
  const spend = (list: AdRow[]) => list.reduce((t, r) => t + cur(r, w).spend, 0)
  const ctr = (list: AdRow[]) => {
    const t = list.reduce((a, r) => { const c = cur(r, w); a.clicks += c.clicks; a.impressions += c.impressions; return a }, emptyMetrics())
    return ctrOf(t)
  }
  return [...groups.entries()].sort(([, a], [, b]) => {
    if (order === 'live-first') {
      if (groupIsLive(a, w) !== groupIsLive(b, w)) return groupIsLive(a, w) ? -1 : 1
      const ea = groupEndsAt(a), eb = groupEndsAt(b)
      if (ea !== eb) return eb.localeCompare(ea)   // newest first; '' sinks
      const ca = ctr(a), cb = ctr(b)
      if (ca !== cb) return cb - ca
    }
    return spend(b) - spend(a)
  })
}

// ---- Plain-English observations. ----
export function callouts(rows: AdRow[], w: Window): string[] {
  const out: string[] = []
  const ran = ranked(rows, w)
  const days = w === '7' ? '7 days' : '30 days'
  if (!ran.length) return out
  const tot = ran.reduce((s, r) => { const c = cur(r, w); s.spend += c.spend; s.impressions += c.impressions; s.clicks += c.clicks; return s }, emptyMetrics())
  const avgCtr = ctrOf(tot)

  const best = ran[0]
  const bestCtr = ctrOf(cur(best, w))
  if (avgCtr > 0) out.push(`🏆 Best CTR: ${best.name} at ${bestCtr.toFixed(2)}% — ${(bestCtr / avgCtr).toFixed(1)}× the account average (${avgCtr.toFixed(2)}%).`)

  // Costliest clicks among ads with a real share of spend.
  const heavy = ran.filter(r => cur(r, w).spend >= tot.spend * 0.1 && cur(r, w).clicks > 0)
  const costly = [...heavy].sort((a, b) => cpcOf(cur(b, w)) - cpcOf(cur(a, w)))[0]
  if (costly && costly !== best && heavy.length > 1) {
    const c = cur(costly, w)
    out.push(`💸 ${costly.name} has the most expensive clicks (RM ${cpcOf(c).toFixed(2)} each) and takes ${Math.round((c.spend / tot.spend) * 100)}% of spend — worth a look.`)
  }

  // Fatigue: CTR fell a lot vs the previous window, on real volume both times.
  for (const r of ran) {
    const c = cur(r, w), p = prev(r, w)
    if (p.impressions < MIN_IMPRESSIONS) continue
    const now = ctrOf(c), before = ctrOf(p)
    if (before > 0 && now < before * 0.75) {
      out.push(`📉 ${r.name}'s CTR fell ${Math.round((1 - now / before) * 100)}% vs the previous ${days} (${before.toFixed(2)}% → ${now.toFixed(2)}%) — creative fatigue?`)
      if (out.length >= 4) break
    }
  }
  const paused = rows.filter(r => r.status === 'paused' || r.status === 'other').length
  if (paused) out.push(`⏸ ${paused} ad${paused === 1 ? '' : 's'} not delivering (paused or campaign off).`)
  return out.slice(0, 4)
}

// ?w=7|30&s=<column>&d=asc|desc → validated props for the leaderboard.
export function leaderboardParams(sp: Record<string, string | undefined>) {
  const w: Window = sp.w === '7' ? '7' : '30'
  const keys = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'views'] as const
  const s = (keys as readonly string[]).includes(sp.s ?? '') ? (sp.s as (typeof keys)[number]) : 'ctr'
  const d: 'asc' | 'desc' = sp.d === 'asc' ? 'asc' : 'desc'
  return { w, s, d }
}
