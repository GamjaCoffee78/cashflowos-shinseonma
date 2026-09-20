// 👉 Production timeline — one month at a time.
//    Rows come from the ONE `records` table, category='production'. They were
//    imported from the PRODUCTION TIMELINE grids of the shared Google Sheet
//    ("Okmaya Project WIP.xlsx") — see scripts/import-production.mjs.
//    Nothing here touches the money tabs: 'production' is its own category.
import Link from 'next/link'
import { getRecords, todayISO, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

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

const monthOf = (r: Rec) => (r.due_date ?? '').slice(0, 7)

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
      <h1 className="ph">Production timeline 🏭</h1>
      <p className="cap">
        What production has to happen, month by month — from the Okmaya project sheet.
      </p>

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
