'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CalEvent } from '@/lib/calendar'
import { isLeave } from '@/lib/calendar-leave'

// The Calendar tab, working like Google Calendar: Month / Week / Day views,
// click a day or an hour to add, click an event to edit or delete it, drag an
// event to move it, tick teammates to invite them. Every change goes to the
// real Google Calendar through /api/calendar.

type Person = { name: string; calendarId: string; color: string }
type Draft = {
  rowId?: number
  title: string; calendar: string; allDay: boolean
  date: string; endDate: string; start: string; end: string
  location: string; description: string; invite: string[]; link?: string
  kind: 'event' | 'leave'
}

const TZ = 'Asia/Kuala_Lumpur'
const HOUR_PX = 48
const FIRST_HOUR = 6
const LAST_HOUR = 23
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number) => String(n).padStart(2, '0')
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
const dow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
const dayTitle = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })
// "2026-09-25T10:30:00+08:00" → { date: '2026-09-25', hm: '10:30', mins: 630 } in Malaysia time.
function local(isoDT: string) {
  const d = new Date(isoDT)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(p => [p.type, p.value]))
  const h = Number(parts.hour) % 24, m = Number(parts.minute)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${pad(h)}:${pad(m)}`, mins: h * 60 + m }
}
const hmToMins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
const minsToHm = (m: number) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`
const niceTime = (hm: string) => {
  const h = Number(hm.slice(0, 2)), m = hm.slice(3)
  return `${h % 12 || 12}${m === '00' ? '' : ':' + m}${h < 12 ? 'am' : 'pm'}`
}

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) { return { ok: false, message: String((e as Error)?.message || e) } }
}

export default function CalendarApp({ events, people, today, me }: { events: CalEvent[]; people: Person[]; today: string; me: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [cursor, setCursor] = useState(today)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveFrom, setLeaveFrom] = useState(today)
  const [leaveTo, setLeaveTo] = useState(() => addDays(today, 6))

  const colorOf = (name?: string) => people.find(p => p.name === name)?.color ?? '#1E5FC4'
  const nameOfEmail = (email: string) => people.find(p => p.calendarId.toLowerCase() === email.toLowerCase())?.name

  // Events with their Malaysia-time start / end worked out once.
  const evs = useMemo(() => events
    .filter(e => (e.owners ?? []).some(o => !hidden.has(o)))
    .map(e => {
      if (e.allDay) {
        const endIncl = addDays(e.end.slice(0, 10), -1)
        return { e, date: e.start.slice(0, 10), endDate: endIncl < e.start.slice(0, 10) ? e.start.slice(0, 10) : endIncl, startMin: 0, endMin: 1440, startHm: '', endHm: '' }
      }
      const a = local(e.start), b = local(e.end)
      return { e, date: a.date, endDate: b.date, startMin: a.mins, endMin: b.date > a.date ? 1440 : Math.max(b.mins, a.mins + 15), startHm: a.hm, endHm: b.hm }
    }), [events, hidden])
  type Ev = (typeof evs)[number]
  const onDay = (d: string) => evs.filter(x => x.date <= d && x.endDate >= d)
  // Leave overlapping a date range, earliest first; the person is the calendar it's on.
  const leaveIn = (from: string, to: string) => evs
    .filter(x => isLeave(x.e) && x.date <= to && x.endDate >= from)
    .sort((a, b) => a.date.localeCompare(b.date))
  const awayToday = [...new Set(leaveIn(today, today).map(x => nameOfEmail(x.e.calOf ?? '') ?? x.e.owners?.[0] ?? ''))].filter(Boolean)

  // ---- open the form ----
  const newAt = (date: string, startHm?: string, allDay = false) => {
    setMsg('')
    const st = startHm ?? '09:00'
    setDraft({ title: '', calendar: me, allDay, date, endDate: date, start: st, end: minsToHm(hmToMins(st) + 60), location: '', description: '', invite: [], kind: 'event' })
  }
  const edit = (x: Ev) => {
    setMsg('')
    const e = x.e
    const invite = (e.owners ?? []).filter(o => people.find(p => p.name === o)?.calendarId.toLowerCase() !== (e.calOf ?? '').toLowerCase())
    setDraft({
      rowId: e.rowId, title: e.title, calendar: nameOfEmail(e.calOf ?? '') ?? e.owners?.[0] ?? me, allDay: e.allDay,
      date: x.date, endDate: x.endDate, start: x.startHm || '09:00', end: x.endHm || '10:00',
      location: e.location, description: e.description, invite, link: e.link,
      kind: isLeave(e) ? 'leave' : 'event',
    })
  }

  const save = (d: Draft) => start(async () => {
    const leave = d.kind === 'leave'
    const body = leave
      ? { ...d, allDay: true, invite: [], location: '', title: d.title.trim() || `🌴 ${d.calendar} on leave` }
      : d
    const r = await post({ action: d.rowId ? 'update' : 'create', id: d.rowId, ...body })
    setMsg(r.message)
    if (r.ok) { setDraft(null); router.refresh() }
  })
  const remove = (d: Draft) => {
    if (!d.rowId || !confirm(`Delete "${d.title}" from Google Calendar? Invited teammates lose it too.`)) return
    start(async () => {
      const r = await post({ action: 'delete', id: d.rowId })
      setMsg(r.message)
      if (r.ok) { setDraft(null); router.refresh() }
    })
  }

  // ---- drag to move: keeps the length, changes the day (and the hour in week/day view) ----
  const dropOn = (date: string, startMin?: number) => {
    const x = evs.find(v => v.e.rowId === dragId)
    setDragId(null)
    if (!x) return
    const span = Math.round((new Date(`${x.endDate}T00:00:00Z`).getTime() - new Date(`${x.date}T00:00:00Z`).getTime()) / 86400000)
    const moved: Draft = {
      rowId: x.e.rowId, title: x.e.title, calendar: '', allDay: x.e.allDay, date, endDate: addDays(date, span),
      start: x.startHm, end: x.endHm, location: x.e.location, description: x.e.description,
      invite: (x.e.owners ?? []), link: x.e.link, kind: isLeave(x.e) ? 'leave' : 'event',
    }
    if (startMin !== undefined && !x.e.allDay) {
      const len = (x.endMin - x.startMin) + span * 1440
      const endAbs = startMin + len
      moved.start = minsToHm(startMin)
      moved.end = minsToHm(endAbs)
      moved.endDate = addDays(date, Math.floor(endAbs / 1440))
    }
    if (moved.date === x.date && moved.start === x.startHm) return
    setMsg('Moving…')
    save(moved)
  }

  // ---- what the header shows ----
  const weekStart = addDays(cursor, -dow(cursor))
  const step = (n: number) => setCursor(view === 'month'
    ? (() => { const [y, m] = cursor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10) })()
    : addDays(cursor, n * (view === 'week' ? 7 : 1)))
  const title = view === 'month'
    ? `${MONTHS[Number(cursor.slice(5, 7)) - 1]} ${cursor.slice(0, 4)}`
    : view === 'week'
      ? `${dayTitle(weekStart, { day: 'numeric', month: 'short' })} – ${dayTitle(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
      : dayTitle(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const Chip = ({ x, withTime = true }: { x: Ev; withTime?: boolean }) => (
    <button
      type="button"
      className={`gc-chip${isLeave(x.e) ? ' gc-leave' : ''}`}
      draggable
      onDragStart={() => setDragId(x.e.rowId ?? null)}
      onDragEnd={() => setDragId(null)}
      onClick={ev => { ev.stopPropagation(); edit(x) }}
      style={{ ['--pc' as string]: colorOf(x.e.owners?.[0]) }}
      title={`${x.e.title} — ${(x.e.owners ?? []).join(', ')}`}
    >
      {(x.e.owners ?? []).length > 1 ? (x.e.owners ?? []).slice(1).map(o => <i key={o} className="gc-dot" style={{ background: colorOf(o) }} />) : null}
      {isLeave(x.e) && !x.e.title.startsWith('🌴') ? <b>🌴</b> : null}
      {withTime && !x.e.allDay ? <b>{niceTime(x.startHm)}</b> : null}
      {x.e.title}
    </button>
  )

  // ---- Month ----
  const Month = () => {
    const first = `${cursor.slice(0, 7)}-01`
    const gridStart = addDays(first, -dow(first))
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    return (
      <div className="gc-month">
        {DOW.map(d => <div key={d} className="gc-dow">{d}</div>)}
        {days.map(d => {
          const list = onDay(d)
          return (
            <div key={d}
              className={`gc-day${d.slice(0, 7) !== cursor.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}${dragId ? ' droppable' : ''}`}
              onClick={() => newAt(d)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => dropOn(d)}
            >
              <button type="button" className="gc-num" onClick={e => { e.stopPropagation(); setCursor(d); setView('day') }}>{Number(d.slice(8))}</button>
              {list.slice(0, 4).map(x => <Chip key={x.e.id} x={x} />)}
              {list.length > 4 ? <button type="button" className="gc-more" onClick={e => { e.stopPropagation(); setCursor(d); setView('day') }}>+{list.length - 4} more</button> : null}
            </div>
          )
        })}
      </div>
    )
  }

  // ---- Week / Day: hour rows, events placed by time, overlaps side by side ----
  const TimeGrid = ({ days }: { days: string[] }) => {
    const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
    const top = (m: number) => Math.max(0, (m - FIRST_HOUR * 60)) / 60 * HOUR_PX
    return (
      <div className="gc-week" style={{ ['--cols' as string]: days.length }}>
        <div className="gc-corner" />
        {days.map(d => (
          <button type="button" key={d} className={`gc-colhead${d === today ? ' today' : ''}`} onClick={() => { setCursor(d); setView('day') }}>
            <span>{dayTitle(d, { weekday: 'short' })}</span><b>{Number(d.slice(8))}</b>
          </button>
        ))}
        <div className="gc-corner gc-alldaylabel">all day</div>
        {days.map(d => (
          <div key={d} className="gc-allday" onClick={() => newAt(d, undefined, true)}
            onDragOver={e => e.preventDefault()} onDrop={() => dropOn(d)}>
            {onDay(d).filter(x => x.e.allDay).map(x => <Chip key={x.e.id} x={x} withTime={false} />)}
          </div>
        ))}
        <div className="gc-hours">
          {hours.map(h => <div key={h} style={{ height: HOUR_PX }}>{niceTime(`${pad(h)}:00`)}</div>)}
        </div>
        {days.map(d => {
          const timed = onDay(d).filter(x => !x.e.allDay).map(x => ({
            x, s: x.date < d ? 0 : x.startMin, t: x.endDate > d ? 1440 : x.endMin,
          })).sort((a, b) => a.s - b.s)
          // lanes for overlapping events
          const lanes: number[] = []
          const placed = timed.map(v => {
            let lane = lanes.findIndex(end => end <= v.s)
            if (lane === -1) { lane = lanes.length; lanes.push(v.t) } else lanes[lane] = v.t
            return { ...v, lane }
          })
          const n = Math.max(1, lanes.length)
          return (
            <div key={d} className={`gc-col${d === today ? ' today' : ''}`} style={{ height: hours.length * HOUR_PX }}>
              {hours.map(h => [0, 30].map(m => (
                <div key={`${h}${m}`} className={`gc-slot${m ? ' half' : ''}${dragId ? ' droppable' : ''}`}
                  onClick={() => newAt(d, `${pad(h)}:${pad(m)}`)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => dropOn(d, h * 60 + m)} />
              )))}
              {placed.map(({ x, s, t, lane }) => (
                <button type="button" key={x.e.id} className="gc-block" draggable
                  onDragStart={() => setDragId(x.e.rowId ?? null)} onDragEnd={() => setDragId(null)}
                  onClick={() => edit(x)}
                  style={{ top: top(s), height: Math.max(20, top(t) - top(s) - 2), left: `${(lane / n) * 100}%`, width: `${100 / n}%`, ['--pc' as string]: colorOf(x.e.owners?.[0]) }}
                  title={x.e.title}>
                  <b>{x.e.title}</b>
                  <span>{niceTime(x.startHm)} – {niceTime(x.endHm)}{(x.e.owners ?? []).length > 1 ? ` · ${(x.e.owners ?? []).join(', ')}` : ''}</span>
                </button>
              ))}
              {d === today ? <div className="gc-now" style={{ top: top(local(new Date().toISOString()).mins) }} /> : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="gc">
      <div className="gc-bar">
        <button type="button" className="btn" onClick={() => newAt(view === 'month' ? today : cursor)}>＋ Create</button>
        <button type="button" className="btn ghost" onClick={() => setCursor(today)}>Today</button>
        <span className="gc-arrows">
          <button type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
          <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
        </span>
        <strong className="gc-title">{title}</strong>
        <span className="gc-views">
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
          ))}
        </span>
      </div>

      <div className="wc-people">
        {people.map(p => {
          const on = !hidden.has(p.name)
          return (
            <button type="button" key={p.name} className={`wc-person${on ? ' on' : ''}`} style={{ ['--pc' as string]: p.color }}
              onClick={() => setHidden(h => { const n = new Set(h); n.has(p.name) ? n.delete(p.name) : n.add(p.name); return n })}>
              <span className="wc-box">{on ? '✓' : ''}</span>{p.name}
            </button>
          )
        })}
      </div>
      <div className="gc-leavebar">
        <span>🌴 <b>On leave today:</b> {awayToday.length ? awayToday.join(', ') : 'nobody'}</span>
        <button type="button" className="btn ghost" onClick={() => setLeaveOpen(v => !v)}>{leaveOpen ? 'Hide' : '🔎 Who’s on leave…'}</button>
        <button type="button" className="btn ghost" onClick={() => { newAt(today, undefined, true); setDraft(v => v && { ...v, kind: 'leave', allDay: true }) }}>🌴 Apply leave</button>
      </div>
      {leaveOpen ? (
        <div className="gc-leavepanel">
          <div className="gc-when">
            <span>From</span><input type="date" value={leaveFrom} onChange={e => { setLeaveFrom(e.target.value); if (e.target.value > leaveTo) setLeaveTo(e.target.value) }} />
            <span>to</span><input type="date" value={leaveTo} min={leaveFrom} onChange={e => setLeaveTo(e.target.value)} />
          </div>
          {(() => {
            const list = leaveIn(leaveFrom, leaveTo)
            if (!list.length) return <p className="gc-msg">Nobody is on leave between {dayTitle(leaveFrom, { day: 'numeric', month: 'short' })} and {dayTitle(leaveTo, { day: 'numeric', month: 'short' })}. 🎉</p>
            return (
              <ul className="gc-leavelist">
                {list.map(x => {
                  const who = nameOfEmail(x.e.calOf ?? '') ?? x.e.owners?.[0] ?? ''
                  const days = Math.round((new Date(`${x.endDate}T00:00:00Z`).getTime() - new Date(`${x.date}T00:00:00Z`).getTime()) / 86400000) + 1
                  return (
                    <li key={x.e.id} style={{ ['--pc' as string]: colorOf(who) }} onClick={() => edit(x)}>
                      <b>{who}</b>
                      <span>{dayTitle(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}{x.endDate !== x.date ? ` – ${dayTitle(x.endDate, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''} · {days} day{days === 1 ? '' : 's'}</span>
                      <em>{x.e.title}</em>
                    </li>
                  )
                })}
              </ul>
            )
          })()}
        </div>
      ) : null}
      {msg && !draft ? <p className="gc-msg">{pending ? '⏳ ' : ''}{msg}</p> : null}
      {dragId ? <p className="gc-msg">Drop it on a {view === 'month' ? 'day' : 'time'} to move it.</p> : null}

      {view === 'month' ? <Month /> : <TimeGrid days={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [cursor]} />}

      {draft ? (
        <div className="gc-modal" onMouseDown={e => { if (e.target === e.currentTarget) setDraft(null) }}>
          <form className="gc-form" onSubmit={e => { e.preventDefault(); save(draft) }}>
            <span className="gc-kind">
              <button type="button" className={draft.kind === 'event' ? 'on' : ''} onClick={() => setDraft({ ...draft, kind: 'event' })}>📅 Event</button>
              <button type="button" className={draft.kind === 'leave' ? 'on' : ''} onClick={() => setDraft({ ...draft, kind: 'leave', allDay: true })}>🌴 Leave</button>
            </span>
            <input className="gc-titlein" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder={draft.kind === 'leave' ? `e.g. Annual leave, MC — or leave blank` : 'Add title'} autoFocus required={draft.kind !== 'leave'} />
            <label className="gc-row">
              <span>{draft.kind === 'leave' ? 'Who' : 'Calendar'}</span>
              <select value={draft.calendar} disabled={!!draft.rowId} onChange={e => setDraft({ ...draft, calendar: e.target.value })}>
                {people.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            {draft.kind === 'event' ? <label className="gc-check"><input type="checkbox" checked={draft.allDay} onChange={e => setDraft({ ...draft, allDay: e.target.checked })} /> All day</label> : null}
            <div className="gc-when">
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value, endDate: e.target.value > draft.endDate ? e.target.value : draft.endDate })} required />
              {!draft.allDay && draft.kind === 'event' ? <input type="time" step={900} value={draft.start} onChange={e => {
                const len = hmToMins(draft.end) - hmToMins(draft.start)
                setDraft({ ...draft, start: e.target.value, end: minsToHm(hmToMins(e.target.value) + (len > 0 ? len : 60)) })
              }} required /> : null}
              <span>to</span>
              {!draft.allDay && draft.kind === 'event' ? <input type="time" step={900} value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} required /> : null}
              <input type="date" value={draft.endDate} min={draft.date} onChange={e => setDraft({ ...draft, endDate: e.target.value })} required />
            </div>
            {draft.kind === 'event' ? <><div className="gc-row">
              <span>Invite</span>
              <span className="gc-invite">
                {people.filter(p => p.name !== draft.calendar).map(p => (
                  <label key={p.name} style={{ ['--pc' as string]: p.color }} className={draft.invite.includes(p.name) ? 'on' : ''}>
                    <input type="checkbox" checked={draft.invite.includes(p.name)}
                      onChange={e => setDraft({ ...draft, invite: e.target.checked ? [...draft.invite, p.name] : draft.invite.filter(n => n !== p.name) })} />
                    {p.name}
                  </label>
                ))}
              </span>
            </div>
            <input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} placeholder="📍 Add location" /></> : null}
            <textarea rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Add description" />
            {msg ? <p className="gc-msg">{msg}</p> : null}
            <div className="gc-actions">
              {draft.rowId ? <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => remove(draft)}>🗑 Delete</button> : null}
              {draft.link ? <a className="btn ghost" href={draft.link} target="_blank" rel="noreferrer">Open in Google</a> : null}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
