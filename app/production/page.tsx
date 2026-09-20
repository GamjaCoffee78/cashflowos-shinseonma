// 👉 Production timeline — one month at a time.
//    Rows come from the ONE `records` table, category='production'. They were
//    imported from the PRODUCTION TIMELINE grids of the shared Google Sheet
//    ("Okmaya Project WIP.xlsx") — see scripts/import-production.mjs.
//    Nothing here touches the money tabs: 'production' is its own category.
//    Top of the page answers "what's next?" across months; below it, one month
//    at a time, the way the sheet lays it out.
import Link from 'next/link'
import { getRecords, todayISO, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import MonthCalendar from '@/app/_components/MonthCalendar'

export const dynamic = 'force-dynamic'

// "2026-09" → "September 2026"
function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d)
}

// "2026-09-19" → "Sat 19"
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(d)
}

// "Sat 19 Sep" — used by the Coming up list, which crosses months.
function fullDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(d)
}

// How far off is it? "today" / "tomorrow" / "in 9 days". Plain days, no clock —
// due_date is a calendar day, not a moment.
function whenLabel(iso: string, today: string): string {
  const a = Date.parse(`${iso}T00:00:00Z`)
  const b = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return ''
  const days = Math.round((a - b) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}

const monthOf = (r: Rec) => (r.due_date ?? '').slice(0, 7)

// How many of the next items to name at the top of the tab.
const UPCOMING = 6

export default async function Production({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const today = todayISO()
  const { m } = await searchParams
  const all = await getRecords()
  const rows = all.filter(r => r.category === 'production' && !!r.due_date)

  // Every month that actually has items, oldest first — that's the month strip.
  const months = [...new Set(rows.map(monthOf))].sort()
  // Default to this month if it has items, else the nearest month that does.
  const thisMonth = today.slice(0, 7)
  const fallback =
    months.find(k => k >= thisMonth) ?? months[months.length - 1] ?? thisMonth
  const current = m && months.includes(m) ? m : fallback

  const mine = rows
    .filter(r => monthOf(r) === current)
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))

  const isDone = (r: Rec) => (r.status || '').toLowerCase() === 'done'

  // What's coming — the next items from today on, ACROSS months, so the answer
  // to "what's next?" doesn't depend on which month you happen to be looking at.
  const upcoming = rows
    .filter(r => !isDone(r) && (r.due_date ?? '') >= today)
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))
  const nextUp = upcoming.slice(0, UPCOMING)

  const done = mine.filter(isDone).length
  const past = mine.filter(r => !isDone(r) && (r.due_date ?? '') < today).length
  const ahead = mine.filter(r => !isDone(r) && (r.due_date ?? '') >= today).length

  const i = months.indexOf(current)
  const prev = i > 0 ? months[i - 1] : null
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null

  // Group the month into days, so it reads like the sheet's calendar.
  const byDay = new Map<string, Rec[]>()
  for (const r of mine) {
    const k = r.due_date as string
    byDay.set(k, [...(byDay.get(k) ?? []), r])
  }

  return (
    <>
      <h1 className="ph">Production Timeline 🏭</h1>
      <p className="cap">
        What production has to happen, month by month — from the Okmaya project sheet.
      </p>

      {nextUp.length > 0 ? (
        <section className="mm" aria-labelledby="pt-next">
          <h2 id="pt-next">Coming up — the next {nextUp.length} on the timeline</h2>
          <table className="mm-table">
            <tbody>
              {nextUp.map(r => (
                <tr key={`next-${r.id}`}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-soft)', fontSize: 13 }}>
                    {fullDayLabel(r.due_date as string)}
                  </td>
                  <td style={{ fontSize: 14 }}>{r.title}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <span className={`pill ${r.due_date === today ? 'overdue' : 'scheduled'}`}>
                      {whenLabel(r.due_date as string, today)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {upcoming.length > nextUp.length ? (
            <p className="cap" style={{ margin: '10px 0 0' }}>
              …and {upcoming.length - nextUp.length} more still ahead.
            </p>
          ) : null}
        </section>
      ) : rows.length > 0 ? (
        <section className="mm" aria-labelledby="pt-next">
          <h2 id="pt-next">Coming up</h2>
          <p className="cap" style={{ margin: 0 }}>
            Nothing dated from today on — every item in the sheet has passed.
          </p>
        </section>
      ) : null}

      {months.length > 0 ? (
        <p className="cap" style={{ marginTop: -14, marginBottom: 18 }}>
          {prev ? <Link href={`/production?m=${prev}`}>← {monthLabel(prev)}</Link> : <span>←</span>}
          <strong style={{ margin: '0 12px', color: 'var(--ink)' }}>{monthLabel(current)}</strong>
          {next ? <Link href={`/production?m=${next}`}>{monthLabel(next)} →</Link> : <span>→</span>}
        </p>
      ) : null}

      <div className="grid">
        <Stat label="This month" value={mine.length} />
        <Stat label="Still ahead" value={ahead} />
        <Stat label="Date passed" value={past} yes={past > 0} />
        <Stat label="Done" value={done} />
      </div>

      {mine.length > 0 ? (
        <MonthCalendar month={current} byDay={byDay} today={today} isDone={isDone} />
      ) : null}

      {rows.length === 0 ? (
        <Empty label="production items" />
      ) : mine.length === 0 ? (
        <Empty label={`production items in ${monthLabel(current)}`} />
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Day</th>
              <th>What happens</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...byDay.entries()].map(([day, items]) =>
              items.map((r, n) => {
                const overdue = !isDone(r) && day < today
                return (
                  <tr key={r.id}>
                    <td data-label="Day" style={day === today ? { color: 'var(--rust)', fontWeight: 700 } : undefined}>
                      {n === 0 ? dayLabel(day) : ''}
                    </td>
                    <td data-label="What happens">{r.title}</td>
                    <td data-label="Status">
                      <span className={`pill ${isDone(r) ? 'done' : overdue ? 'pending' : 'scheduled'}`}>
                        {isDone(r) ? 'done' : overdue ? 'date passed' : 'planned'}
                      </span>
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      )}
    </>
  )
}
