import { supabase, supabaseConfigured } from './supabase'
import { ABANG } from '@/abang/config'

// One row of the business spine. The whole app reads this single table.
// `meta` is a free-form bag of extra fields each tab can use (a lead's next
// follow-up, a content item's platform/format/views) — so we stay ONE table.
export type Rec = {
  id: number
  title: string
  status: string
  amount: number
  category: string | null
  due_date: string | null
  notes: string | null
  meta: Record<string, any>
  created_at: string
}

// The 7 categories that make up a complete generic business. Each tab owns one
// (or two, for the money tabs) so the numbers never bleed across tabs.
export const CATEGORIES = ['cash_in', 'cash_out', 'lead', 'customer', 'content', 'task', 'doc'] as const
export type Category = (typeof CATEGORIES)[number]

// The lead funnel stages, in order. A lead's `status` moves down this ladder.
// ('new' and 'contacted' are both "top of funnel" and count together as Leads.)
export const LEAD_STAGES = ['new', 'contacted', 'appointment', 'closed', 'nurture'] as const

// Every tab calls this, then filters in its own way.
export async function getRecords(): Promise<Rec[]> {
  // Before Supabase is wired (placeholder env), skip the fetch entirely — a bad
  // or unreachable URL otherwise hangs ~7s per request before failing. The
  // ConnStatus banner tells the user to add their keys. (Found in the live run.)
  if (!supabaseConfigured) return []
  // Supabase caps one request at 1,000 rows. A real shop (e.g. a Shopee import)
  // has more than that, so page through in 1,000-row slices until a short page.
  const PAGE = 1000
  const all: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[CFO] could not read records:', error.message); break }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  // Default meta to {} so a row added before the meta column existed never crashes a tab.
  return all.map(r => ({ ...r, meta: r.meta ?? {} })) as Rec[]
}

// The money-reporting window. One definition, used by the Dashboard, the money
// tabs AND the morning brief, so the app and the 08:15 Telegram message can
// never disagree about what "Cash In" means.
export const MONEY_FROM = (process.env.MONEY_FROM || ABANG.moneyFrom || '').trim()

const MONEY_CATEGORIES = new Set(['cash_in', 'cash_out'])

// Is this row inside the reporting window? Non-money rows always pass, so the
// funnel, leads and content are untouched. A row with no due_date also passes —
// a receipt the robot filed today should never vanish because of a date filter.
export function inMoneyWindow(rec: Rec): boolean {
  if (!MONEY_FROM) return true
  if (!MONEY_CATEGORIES.has(rec.category ?? '')) return true
  if (!rec.due_date) return true
  return rec.due_date >= MONEY_FROM
}

// "Jan 2026" — for the caption that tells people what period they're looking at.
export function moneyFromLabel(): string | null {
  if (!MONEY_FROM) return null
  const d = new Date(`${MONEY_FROM}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d)
}

// ── Money, month by month ────────────────────────────────────────────────
// One row per calendar month that actually has money in it — no empty months
// invented, no months dropped in the middle. Respects the same reporting
// window as everything else, so the monthly rows always add up to the
// Dashboard's headline totals.
export type MonthMoney = {
  key: string      // 'YYYY-MM', for sorting and React keys
  label: string    // 'Jan 2026'
  cashIn: number
  cashOut: number
  net: number
  // Where most of the month's money came IN from, and how much of the month it
  // was. null when the month has no sales at all — an honest blank, not a zero.
  topSource: { name: string; amount: number; share: number } | null
}

export function getMonthlyMoney(rows: Rec[]): MonthMoney[] {
  const buckets = new Map<string, { cashIn: number; cashOut: number }>()
  // Per month, how much came in from each sales channel.
  const sources = new Map<string, Map<string, number>>()

  for (const r of rows) {
    if (r.category !== 'cash_in' && r.category !== 'cash_out') continue
    if (!inMoneyWindow(r)) continue
    // No due_date = money that moved today (a receipt the robot just filed).
    const key = (r.due_date || todayISO()).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    const amount = Number(r.amount || 0)

    const b = buckets.get(key) ?? { cashIn: 0, cashOut: 0 }
    if (r.category === 'cash_in') b.cashIn += amount
    else b.cashOut += amount
    buckets.set(key, b)

    if (r.category === 'cash_in' && amount > 0) {
      // meta.group is the channel the importer stamps on ("Shopee MY",
      // "Kitchen Service"). Hand-entered rows have no group, so fall back to
      // the row's own title rather than lumping them into a fake bucket.
      const name = String(r.meta?.group || r.title || '').trim() || 'Other'
      const perSource = sources.get(key) ?? new Map<string, number>()
      perSource.set(name, (perSource.get(name) ?? 0) + amount)
      sources.set(key, perSource)
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, b]) => ({
      key,
      label: monthLabel(key),
      cashIn: b.cashIn,
      cashOut: b.cashOut,
      net: b.cashIn - b.cashOut,
      topSource: topSourceOf(sources.get(key), b.cashIn),
    }))
}

// The single biggest money-in channel for a month, with its share of that
// month's sales. Ties break on name so the same month never reorders between
// renders.
function topSourceOf(
  perSource: Map<string, number> | undefined,
  cashIn: number,
): MonthMoney['topSource'] {
  if (!perSource?.size || cashIn <= 0) return null
  const [name, amount] = [...perSource.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]
  return { name, amount, share: amount / cashIn }
}

// 'YYYY-MM' → 'Jan 2026'. Falls back to the raw key if the date is unparseable,
// so a bad row shows something honest instead of "Invalid Date".
function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  // en-US, not en-GB: en-GB abbreviates September as "Sept", the only 4-letter
  // month, which reads as a typo next to the other eleven and doesn't match the
  // source sheet's "Sep-26". en-US gives three letters for all twelve.
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

// Read one field out of a record's meta bag, with a dash fallback for display.
export const m = (r: Rec, k: string) => {
  const v = r.meta?.[k]
  return v === undefined || v === null || v === '' ? '—' : v
}

// Format a number as Malaysian Ringgit for display. ALWAYS two decimals:
// toLocaleString's default drops trailing zeros, which renders RM88,678.40 as
// "RM 88,678.4" — a single decimal place, which no money is ever written in and
// which reads as a truncated number next to its two-decimal neighbours.
export const rm = (n: number) =>
  'RM ' +
  Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The business's own timezone. UTC rolls over at 08:00 in Malaysia, so using
// UTC made "due today" / "overdue" wrong for the first 8 hours of every local
// day (and skewed the 9am brief). Override with BUSINESS_TIMEZONE if you're
// not in Malaysia.
export const BUSINESS_TZ = (process.env.BUSINESS_TIMEZONE || 'Asia/Kuala_Lumpur').trim()

// Today as YYYY-MM-DD in the business's timezone (for due-date comparisons + seeds).
export const todayISO = () => {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10) // bad TZ string — fall back to UTC
  }
}

// Today's weekday name in the business's timezone, e.g. "Saturday".
export const todayWeekday = () => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, weekday: 'long' }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date())
  }
}

// How many proposals are waiting for a YES right now (status 'proposed', unexpired).
// Powers the 🙋 sidebar badge. Returns 0 before Supabase is wired (no hang).
export async function getPendingCount(): Promise<number> {
  if (!supabaseConfigured) return 0
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed')
    .gt('expires_at', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}

// ============================================================
// THE FUNNEL — the whole-business river the Dashboard + morning brief show.
// Views → Leads → Appointments → Closed → Nurture.
//   • views        = sum of every `content` row's meta.views
//   • leads        = leads still at the top (status new OR contacted)
//   • appointments = leads at status 'appointment'
//   • closed       = leads at status 'closed'
//   • nurture      = leads at status 'nurture'
//   • pct[]        = stage-to-stage conversion %, one entry BETWEEN each pair of
//                    the 5 stages (so 4 numbers: views→leads, leads→appts,
//                    appts→closed, closed→nurture). 0 when the upstream stage is 0.
// ============================================================
export type Funnel = {
  views: number
  leads: number
  appointments: number
  closed: number
  nurture: number
  pct: number[]
}

export function getFunnel(rows: Rec[]): Funnel {
  const leadRows = rows.filter(r => r.category === 'lead')
  const countStatus = (...statuses: string[]) =>
    leadRows.filter(r => statuses.includes((r.status || '').toLowerCase())).length

  const views = rows
    .filter(r => r.category === 'content')
    .reduce((sum, r) => sum + Number(r.meta?.views || 0), 0)
  const leads = countStatus('new', 'contacted')
  const appointments = countStatus('appointment')
  const closed = countStatus('closed')
  const nurture = countStatus('nurture')

  const stages = [views, leads, appointments, closed, nurture]
  const pct: number[] = []
  for (let i = 0; i < stages.length - 1; i++) {
    // Conversion from this stage to the next. Guard divide-by-zero → 0%.
    pct.push(stages[i] > 0 ? Math.round((stages[i + 1] / stages[i]) * 100) : 0)
  }
  return { views, leads, appointments, closed, nurture, pct }
}
