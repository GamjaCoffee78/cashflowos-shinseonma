import Link from 'next/link'
import type { Rec } from '@/lib/records'
import { ItemActions, AddTask, DayAdd } from '@/app/_components/ProductionActions'
import ChipPop from '@/app/_components/ChipPop'
import { colorStyle } from '@/lib/item-colors'

// Months to show: every month with items, plus this month and the next five —
// so any date can be picked and filled with the ＋ on its day.
export function calendarMonths(rows: { due_date: string | null }[], today: string, asked?: string) {
  const set = new Set(rows.map(r => (r.due_date as string).slice(0, 7)))
  const [y, mo] = today.slice(0, 7).split('-').map(Number)
  for (let k = 0; k < 6; k++) {
    const d = new Date(Date.UTC(y, mo - 1 + k, 1))
    set.add(d.toISOString().slice(0, 7))
  }
  if (asked && /^\d{4}-\d{2}$/.test(asked)) set.add(asked)
  const months = [...set].sort()
  const current = asked && months.includes(asked) ? asked : today.slice(0, 7)
  return { months, current }
}

// The Production Timeline, as a presentational component: it takes rows and
// renders them. The page fetches; this decides what the month LOOKS like.
//
// Reading order is deliberate — the page answers three questions in this order:
//   1. What needs me now?        → the "Next up" band
//   2. How busy is this month?   → the month chips + counts
//   3. What exactly, and when?   → the calendar, then the week lists
//
// Status: imported rows start 'planned'. The buttons in the day list mark one
// 'done' or move it to another date (app/api/production). An item whose date has
// passed and isn't done says "not done" — so it gets ticked or moved.

// Order prefixes like "[FM Order] …" or "[ZUS Order- FFF] …" are how the sheet
// tags who the work is for. Pulling them out gives each item a colour and a
// short chip, and leaves a title you can actually read.
function splitTag(title: string): { tag: string | null; rest: string } {
  const m = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(title)
  if (!m) return { tag: null, rest: title }
  // "ZUS Order- FFF" → "ZUS" — the first word is the customer.
  const tag = m[1].trim().split(/[\s\-—]+/)[0].toUpperCase()
  return { tag, rest: m[2] || title }
}

// A stable colour per tag, picked from the brand's accent set. Same tag always
// gets the same swatch, so the calendar reads as a pattern across the month.
const TAG_TONES = ['clay', 'sage', 'honey', 'rust', 'ink'] as const
const toneFor = (tag: string | null, tags: string[]) =>
  tag ? TAG_TONES[tags.indexOf(tag) % TAG_TONES.length] : 'ink'

const dayNum = (iso: string) => Number(iso.slice(8, 10))

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(d)
}
const monthLabel = (k: string) => fmt(`${k}-01`, { month: 'long', year: 'numeric' })
const monthShort = (k: string) => fmt(`${k}-01`, { month: 'short' })
const fullDay = (iso: string) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' })

// Whole days between two calendar dates. No clock — due_date is a day.
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

function whenLabel(iso: string, today: string): string {
  const d = daysBetween(iso, today)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d < 0) return `${-d}d ago`
  if (d < 7) return `in ${d} days`
  return `in ${Math.round(d / 7)} wk`
}

export default function ProductionView({
  rows, months, current, today,
  title = 'Production Timeline 🏭',
  caption = "What has to happen, and when — from the Okmaya project sheet. Tick what's done, move what slipped.",
  basePath = '/production',
  editable = true,
  category = 'production',
  addLabel = '＋ New task',
  addPlaceholder,
  children,
}: {
  category?: string    // which category ＋ New task adds to
  addLabel?: string
  addPlaceholder?: string
  children?: React.ReactNode  // extra section under the header (the Social Calendar's ideas)
  title?: string       // the same month view also serves Social Calendar and Events
  caption?: string
  basePath?: string
  editable?: boolean   // Done / Move / New task (production only, for now)
  rows: Rec[]          // every production row, each with a due_date
  months: string[]     // every month that has items, ascending
  current: string      // the month being shown
  today: string
}) {
  const mine = rows
    .filter(r => (r.due_date ?? '').slice(0, 7) === current)
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))

  // Tags present this month, most used first — that order drives the colours.
  const tagCounts = new Map<string, number>()
  for (const r of mine) {
    const { tag } = splitTag(r.title)
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)

  // ── 1. What needs me now? ───────────────────────────────────────
  const isDone = (r: Rec) => (r.status || '').toLowerCase() === 'done'
  const ahead = rows
    .filter(r => (r.due_date ?? '') >= today && !isDone(r))
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))
  const dueToday = rows.filter(r => r.due_date === today && !isDone(r))
  const next7 = ahead.filter(r => daysBetween(r.due_date as string, today) <= 7)
  const passed = mine.filter(r => (r.due_date ?? '') < today && !isDone(r)).length

  const byDay = new Map<string, Rec[]>()
  for (const r of mine) {
    const k = r.due_date as string
    byDay.set(k, [...(byDay.get(k) ?? []), r])
  }

  // ── The month grid, Monday-first ────────────────────────────────
  const [y, mo] = current.split('-').map(Number)
  const first = new Date(Date.UTC(y, mo - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7     // getUTCDay: 0=Sun → Monday-first
  const iso = (d: number) => `${current}-${String(d).padStart(2, '0')}`
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, n) => n + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let n = 0; n < cells.length; n += 7) weeks.push(cells.slice(n, n + 7))

  const Chip = ({ r }: { r: Rec }) => {
    const { tag, rest } = splitTag(r.title)
    return (
      <ChipPop
        title={rest}
        tag={/^\s*\[([^\]]+)\]/.exec(r.title)?.[1]?.trim() ?? null}
        when={fullDay(r.due_date as string)}
        status={isDone(r) ? '✓ Done' : (r.due_date as string) < today ? 'Not done' : 'Planned'}
        {...(editable ? { id: r.id, done: isDone(r) } : {})}
      >
        <span className={`pt-chip tone-${toneFor(tag, tags)}${isDone(r) ? ' done' : ''}${r.meta?.color ? ' colored' : ''}`} style={colorStyle(r.meta?.color)}>
          {tag ? <b>{tag}</b> : null}{rest}
        </span>
      </ChipPop>
    )
  }

  return (
    <>
      <h1 className="ph">{title}</h1>
      <p className="cap">{caption}</p>
      {editable ? (
        <div style={{ margin: '10px 0 16px' }}>
          <AddTask defaultDate={today} category={category} basePath={basePath} label={addLabel} {...(addPlaceholder ? { placeholder: addPlaceholder } : {})} />
        </div>
      ) : null}
      {children}

      {/* 1 ─ What needs me now. The single most useful thing on the page, so
             it goes first and reads as a sentence, not a number. */}
      <section className="pt-now">
        <div className="pt-now-head">
          <h2>
            {dueToday.length > 0
              ? `${dueToday.length} thing${dueToday.length === 1 ? '' : 's'} due today`
              : ahead.length > 0
                ? `Nothing due today · next is ${whenLabel(ahead[0].due_date as string, today)}`
                : 'Nothing left on the timeline'}
          </h2>
          <span className="pt-now-sub">
            {next7.length} in the next 7 days · {ahead.length} still ahead
          </span>
        </div>
        {ahead.length > 0 ? (
          <ul className="pt-next">
            {ahead.slice(0, 4).map(r => (
              <li key={`n${r.id}`}>
                <span className="pt-when">{whenLabel(r.due_date as string, today)}</span>
                <span className="pt-date">{fullDay(r.due_date as string)}</span>
                <Chip r={r} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 2 ─ How busy is each month? Every month at once, with its count, so
             you can see the shape of the year and jump straight to one. */}
      <nav className="pt-months" aria-label="Month">
        {months.map(k => {
          const n = rows.filter(r => (r.due_date ?? '').slice(0, 7) === k).length
          const isNow = k === today.slice(0, 7)
          return (
            <Link
              key={k}
              href={`${basePath}?m=${k}`}
              className={`pt-month${k === current ? ' active' : ''}`}
              aria-current={k === current ? 'page' : undefined}
            >
              <span className="pt-m-name">{monthShort(k)}{isNow ? ' •' : ''}</span>
              <span className="pt-m-count">{n}</span>
            </Link>
          )
        })}
      </nav>

      {/* 3 ─ What exactly, and when. */}
      <div className="pt-headline">
        <h2>{monthLabel(current)}</h2>
        <span className="cap" style={{ margin: 0 }}>
          {mine.length} item{mine.length === 1 ? '' : 's'}
          {editable && passed > 0 ? ` · ${passed} passed and not done` : ''}
        </span>
      </div>

      {tags.length > 0 ? (
        <div className="pt-legend">
          {tags.map(t => (
            <span key={t}>
              <i className={`pt-sw tone-${toneFor(t, tags)}`} aria-hidden="true" />
              {t}
              <b>{tagCounts.get(t)}</b>
            </span>
          ))}
        </div>
      ) : null}

      {mine.length === 0 ? (
        <div className="empty">Nothing scheduled in {monthLabel(current)}{editable ? ' — tap ＋ on any day to add something.' : '.'}</div>
      ) : null}
      {mine.length === 0 && !editable ? null : (
        <>
          <div className="cal" role="table" aria-label={`Production calendar, ${monthLabel(current)}`}>
            <div className="cal-head" role="row">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} role="columnheader" className="cal-dow">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div className="cal-grid" role="row" key={`w${wi}`}>
                {week.map((d, n) => {
                  if (d === null) {
                    return <div key={`p${wi}-${n}`} className="cal-cell out" aria-hidden="true" />
                  }
                  const key = iso(d)
                  const items = byDay.get(key) ?? []
                  const weekend = n >= 5
                  return (
                    <div
                      key={key}
                      role="cell"
                      className={[
                        'cal-cell',
                        key === today ? 'today' : '',
                        key < today ? 'past' : '',
                        weekend ? 'weekend' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <span className="cal-num">{d}</span>
                      {editable ? <DayAdd date={key} category={category} label={fullDay(key)} /> : null}
                      <div className="cal-items">
                        {items.map(r => <Chip key={r.id} r={r} />)}
                      </div>
                      {items.length > 0 ? (
                        <span className="cal-count" aria-hidden="true">{items.length}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* The full list, day by day. The calendar shows shape; this is where
              you read the whole title. Days with nothing are simply absent. */}
          <div className="pt-days">
            {[...byDay.entries()].map(([day, items]) => (
              <div className={`pt-day${day === today ? ' today' : ''}${day < today ? ' past' : ''}`} key={day}>
                <div className="pt-day-head">
                  <span className="pt-day-num">{dayNum(day)}</span>
                  <span className="pt-day-dow">{fmt(day, { weekday: 'long' })}</span>
                  {day === today ? <span className="pill overdue">today</span> : null}
                  {day < today ? <span className="pt-day-note">passed</span> : null}
                </div>
                <ul>
                  {items.map(r => {
                    const { tag, rest } = splitTag(r.title)
                    const done = isDone(r)
                    const moved = Array.isArray(r.meta?.moved_from) ? r.meta.moved_from : []
                    return (
                      <li key={r.id} className={`${done ? 'done' : ''}${r.meta?.color ? ' colored' : ''}`} style={colorStyle(r.meta?.color)}>
                        {tag ? (
                          <span className={`pt-tag tone-${toneFor(tag, tags)}`} style={colorStyle(r.meta?.color)}>{tag}</span>
                        ) : null}
                        <span className="pt-title">{rest}</span>
                        {editable && !done && day < today ? <span className="pill overdue">not done</span> : null}
                        {moved.length ? (
                          <span className="pt-day-note">moved from {fullDay(moved[moved.length - 1].date)}</span>
                        ) : null}
                        {editable ? <ItemActions id={r.id} done={done} date={day} title={r.title} color={r.meta?.color ?? ''} /> : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
