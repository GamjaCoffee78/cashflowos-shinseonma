// 👉 Calendar 📅 — your Google Calendar, from the `event` rows the daily cron
// copies in (see lib/calendar.ts). Month grid + agenda. Reads the ONE `records`
// table like every other tab; read-only — nothing here writes to Google.
import Link from 'next/link'
import { getRecords, todayISO } from '@/lib/records'
import { calendarEvents, calendarConfigured, timeLabel, type CalEvent } from '@/lib/calendar'
import { addDays } from '@/lib/ads-daily'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
// Monday-first weekday index (0 = Mon … 6 = Sun) of an ISO date.
const dow = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams
  const today = todayISO()
  const events = calendarEvents(await getRecords())
  const byDate = new Map<string, CalEvent[]>()
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])

  // ---- Stat cards: today · this week (Mon–Sun) · next 7 days ----
  const weekStart = addDays(today, -dow(today))
  const weekEnd = addDays(weekStart, 6)
  const count = (from: string, to: string) => events.filter(e => e.date >= from && e.date <= to).length
  const todayCount = count(today, today)
  const weekCount = count(weekStart, weekEnd)
  const next7 = count(addDays(today, 1), addDays(today, 7))

  // ---- Month grid (?m=YYYY-MM to move around) ----
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? (sp.m as string) : today.slice(0, 7)
  const [Y, M] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate()
  const lead = dow(first)
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  const prev = `${M === 1 ? Y - 1 : Y}-${String(M === 1 ? 12 : M - 1).padStart(2, '0')}`
  const next = `${M === 12 ? Y + 1 : Y}-${String(M === 12 ? 1 : M + 1).padStart(2, '0')}`

  // ---- Agenda: today + the next 14 days ----
  const agendaEnd = addDays(today, 14)
  const agendaDays = [...byDate.keys()].filter(d => d >= today && d <= agendaEnd).sort()

  return (
    <>
      <h1 className="ph">Calendar 📅</h1>
      <p className="cap">Your Google Calendar, copied in every morning with the brief. Read-only here — edit in Google.</p>

      {events.length === 0 ? (
        <div className="empty">
          {calendarConfigured ? (
            <>Nothing synced yet — the next 8:15am run copies your events in (or run <code>npm run sync:calendar</code>). If your calendar is empty, this stays empty too.</>
          ) : (
            <>Calendar isn&apos;t wired yet. Add <code>COMPOSIO_API_KEY</code> to Vercel (the Composio project where Google Calendar is linked), redeploy, and the next morning run fills this tab.</>
          )}
        </div>
      ) : null}

      <div className="grid">
        <Stat label="Today" value={todayCount} />
        <Stat label="This week" value={weekCount} />
        <Stat label="Next 7 days" value={next7} />
      </div>

      <div className="cal-head">
        <Link href={`/calendar?m=${prev}`} aria-label="Previous month">‹</Link>
        <strong>{MONTHS[M - 1]} {Y}</strong>
        <Link href={`/calendar?m=${next}`} aria-label="Next month">›</Link>
      </div>
      <div className="cal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div className="cal-dow" key={d}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div className="cal-cell blank" key={`b${i}`} />
          const list = byDate.get(d) ?? []
          return (
            <div className={`cal-cell${d === today ? ' today' : ''}${list.length ? ' has' : ''}`} key={d}>
              <span className="cal-n">{Number(d.slice(8))}</span>
              {list.slice(0, 2).map(e => <span className="cal-ev" key={e.id} title={e.title}>{e.title}</span>)}
              {list.length > 2 ? <span className="cal-more">+{list.length - 2}</span> : null}
            </div>
          )
        })}
      </div>

      <p className="nav-label" style={{ margin: '24px 0 8px' }}>Today and the next 14 days</p>
      {agendaDays.length === 0 ? (
        <div className="empty">Nothing on in the next two weeks.</div>
      ) : (
        <table className="tbl">
          <tbody>
            {agendaDays.map(d => (
              (byDate.get(d) ?? []).map((e, i) => (
                <tr key={e.id}>
                  <td data-label="Day" style={{ whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{i === 0 ? (d === today ? 'Today' : dayLabel(d)) : ''}</td>
                  <td data-label="Time" style={{ whiteSpace: 'nowrap' }}>{timeLabel(e)}</td>
                  <td data-label="What">
                    {e.link ? <a href={e.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{e.title}</a> : e.title}
                    {e.status === 'tentative' ? <span className="pill pending" style={{ marginLeft: 8 }}>tentative</span> : null}
                  </td>
                  <td data-label="Where" style={{ color: 'var(--ink-soft)' }}>{e.location || '—'}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
