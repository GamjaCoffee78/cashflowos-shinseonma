import type { Rec } from '@/lib/records'

// A real month grid — Monday-first, six-week frame — so the production
// timeline reads like the wall calendar it came from, not just a list.
//
// It is a companion to the day table below it, not a replacement: the cells
// show what happens and when, the table stays the place to read full titles
// and statuses.
export default function MonthCalendar({
  month,          // 'YYYY-MM'
  byDay,          // ISO date → items on that day
  today,          // ISO date
  isDone,
}: {
  month: string
  byDay: Map<string, Rec[]>
  today: string
  isDone: (r: Rec) => boolean
}) {
  const [y, mo] = month.split('-').map(Number)
  if (!y || !mo) return null

  // All dates are handled in UTC. due_date is a calendar day, not a moment, so
  // a local-time Date would shift the grid by one day for anyone east of UTC.
  const first = new Date(Date.UTC(y, mo - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  // getUTCDay(): 0=Sun. Monday-first, so Sunday becomes the 7th column.
  const lead = (first.getUTCDay() + 6) % 7

  const iso = (d: number) =>
    `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Pad to whole weeks so the frame stays rectangular.
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, n) => n + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="cal" role="table" aria-label={`Production calendar for ${month}`}>
      <div className="cal-head" role="row">
        {DOW.map(d => (
          <div key={d} role="columnheader" className="cal-dow">{d}</div>
        ))}
      </div>
      <div className="cal-grid" role="rowgroup">
        {cells.map((d, n) => {
          if (d === null) return <div key={`p${n}`} className="cal-cell empty" aria-hidden="true" />
          const key = iso(d)
          const items = byDay.get(key) ?? []
          const isToday = key === today
          // "Missed" is only meaningful for a past day that still has open work.
          const missed = key < today && items.some(r => !isDone(r))
          return (
            <div
              key={key}
              role="cell"
              className={`cal-cell${isToday ? ' today' : ''}${missed ? ' missed' : ''}`}
            >
              <span className="cal-num">{d}</span>
              <div className="cal-items">
                {items.map(r => (
                  <span
                    key={r.id}
                    className={`cal-item${isDone(r) ? ' done' : ''}`}
                    title={r.title}
                  >
                    {r.title}
                  </span>
                ))}
              </div>
              {/* Phones get a count instead of unreadable slivers of text. */}
              {items.length > 0 ? (
                <span className="cal-count" aria-hidden="true">{items.length}</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
