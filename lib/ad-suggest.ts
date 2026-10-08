import type { Rec } from './records'
import { engagementFor } from './insights'

// "Ads suggestion" on the Content tab: which reels are worth paying to push on
// Meta, judged only on how the video itself performed organically. Rule-based
// and read-only — every reason is a number you can check on the card.
//
// Four signals, each compared with your typical (median) reel:
//   hook   views ÷ accounts reached  — people rewatched / it got pushed on
//   kept   (saves + shares) ÷ reach  — "I'll cook this" / sent to a friend
//   react  (likes + comments) ÷ views
//   reach  accounts reached          — proof it can travel
// A reel's score is the average of its percentile on each, so one freak
// number can't carry a weak video to the top.

export type Signal = 'hook' | 'kept' | 'react' | 'reach'
export type Suggestion = {
  row: Rec
  score: number                 // 0–100
  strengths: string[]
  weaknesses: string[]
}

const num = (v: unknown) => Number(v ?? 0) || 0
const isReel = (r: Rec) => /reel|video/i.test(String(r.meta?.format ?? ''))

// A giveaway older than this has ended — paying to push it now would promote a
// prize nobody can win.
const GIVEAWAY_DAYS = 30
const GIVEAWAY = /giveaway|contest|lucky\s*draw|\bwin\b|winners?\b/i
function endedGiveaway(r: Rec, today: string) {
  if (!GIVEAWAY.test(`${r.title ?? ''} ${r.meta?.caption ?? ''}`)) return false
  if (!r.due_date) return true
  const age = (Date.parse(today) - Date.parse(r.due_date)) / 86_400_000
  return age > GIVEAWAY_DAYS
}

function signals(r: Rec): Partial<Record<Signal, number>> {
  const views = num(r.meta?.views)
  const reach = num(r.meta?.reach)
  const eng = engagementFor(r.meta)
  const out: Partial<Record<Signal, number>> = {}
  if (reach > 0) {
    out.reach = reach
    if (views > 0) out.hook = views / reach
    if (eng) out.kept = (eng.saved + eng.shares) / reach
  }
  if (views > 0) out.react = (num(r.meta?.likes) + num(r.meta?.comments)) / views
  return out
}

const median = (ns: number[]) => {
  if (!ns.length) return 0
  const s = [...ns].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
// Share of the other reels this value beats, 0–1.
const percentile = (v: number, all: number[]) =>
  all.length > 1 ? all.filter(x => x < v).length / (all.length - 1) : 0.5

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`
const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(Math.round(n)))
const x = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`

function reason(s: Signal, v: number, med: number): string {
  const r = med ? v / med : 0
  switch (s) {
    case 'hook': return `Strong hook — ${v.toFixed(1)} views per account reached (typical reel ${med.toFixed(1)})`
    case 'kept': return `${pct(v)} of accounts reached saved or shared it — ${x(r)} your typical reel`
    case 'react': return `${pct(v)} liked or commented — ${x(r)} your typical reel`
    case 'reach': return `Reached ${k(v)} accounts — ${x(r)} your typical reel`
  }
}
function weakness(s: Signal, v: number, med: number): string {
  const r = med ? v / med : 0
  switch (s) {
    case 'hook': return `Few rewatches (${v.toFixed(1)} views per account vs ${med.toFixed(1)} typical)`
    case 'kept': return `Few saves/shares — ${x(r)} your typical reel`
    case 'react': return `Few likes/comments — ${x(r)} your typical reel`
    case 'reach': return `Small organic reach (${k(v)} accounts, ${x(r)} typical)`
  }
}

const ORDER: Signal[] = ['hook', 'kept', 'react', 'reach']

export function adSuggestions(rows: Rec[], today: string, limit = 5): Suggestion[] {
  const reels = rows.filter(r => r.category === 'content' && isReel(r) && num(r.meta?.views) > 0 && !endedGiveaway(r, today))
  const sig = new Map(reels.map(r => [r.id, signals(r)]))
  const pool: Record<Signal, number[]> = { hook: [], kept: [], react: [], reach: [] }
  for (const s of sig.values()) for (const key of ORDER) if (s[key] != null) pool[key].push(s[key]!)
  const med = Object.fromEntries(ORDER.map(key => [key, median(pool[key])])) as Record<Signal, number>

  const scored: Suggestion[] = []
  for (const r of reels) {
    const s = sig.get(r.id)!
    const have = ORDER.filter(key => s[key] != null)
    // Without reach the ratios can't be worked out — too little to judge on.
    if (have.length < 3) continue
    const score = Math.round((have.reduce((t, key) => t + percentile(s[key]!, pool[key]), 0) / have.length) * 100)
    const ratio = (key: Signal) => (med[key] ? s[key]! / med[key] : 1)
    // Every signal that beats the typical reel, strongest first, so each pick
    // always says why it made the list.
    const strengths = have.filter(key => ratio(key) >= 1.1).sort((a, b) => ratio(b) - ratio(a)).map(key => reason(key, s[key]!, med[key]))
    const weaknesses = have.filter(key => ratio(key) < 0.7).map(key => weakness(key, s[key]!, med[key]))
    scored.push({ row: r, score, strengths, weaknesses })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
