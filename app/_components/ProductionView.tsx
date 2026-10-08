import Link from 'next/link'
import type { Rec } from '@/lib/records'
import { ItemActions, AddTask, AddLeave, DayAdd } from '@/app/_components/ProductionActions'
import ChipPop from '@/app/_components/ChipPop'
import { colorStyle } from '@/lib/item-colors'

// People's colours (leave…): strong, far-apart hues, shown as solid bars, so
// no two people can be mistaken for each other.
const PEOPLE = ['#E53935', '#1E63D6', '#2E9D3A', '#F28C00', '#8E3CCB', '#00A3A3', '#E0399A', '#7A4A1E', '#1F2A44', '#9BB000']

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
  // Every month from the first to the last, empty ones included, so the row
  // reads as a calendar instead of skipping.
  const have = [...set].sort()
  const months: string[] = []
  for (let k = have[0]; k <= have[have.length - 1]; ) {
    months.push(k)
    const [yy, mm] = k.split('-').map(Number)
    k = new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 7)
  }
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

// Social Calendar channels: one fixed colour each, so a post reads at a glance.
// REELS is the sheet's old name for the TikTok row, so it shows as TikTok.
const CHANNELS = [
  { key: 'IGF', label: 'IGF · feed', fg: '#1E5FC4', bg: 'rgba(30,95,196,.22)' },
  { key: 'IGR', label: 'IGR · reels', fg: '#D63384', bg: 'rgba(214,51,132,.22)' },
  { key: 'IGST', label: 'IGST · stories', fg: '#E8740C', bg: 'rgba(240,130,20,.24)' },
  { key: 'TIKTOK', label: 'TikTok', fg: '#0A9A8F', bg: 'rgba(0,170,160,.22)' },
] as const
function channelsOf(tag: string | null) {
  if (!tag) return []
  const keys = new Set(tag.split(/[\/,\s]+/).map(c => c.trim().toUpperCase()).map(c => (c === 'REELS' ? 'TIKTOK' : c)))
  return CHANNELS.filter(c => keys.has(c.key))
}
const channelStyle = (tag: string | null) => {
  const c = channelsOf(tag)[0]
  return c ? ({ '--tone': c.fg, '--tone-bg': c.bg } as React.CSSProperties) : undefined
}
// "IGR IGST TikTok", each in its own colour.
function ChannelTags({ tag }: { tag: string }) {
  const cs = channelsOf(tag)
  if (!cs.length) return <>{tag}</>
  return <>{cs.map(c => <span key={c.key} className="pt-ch" style={{ color: c.fg }}>{c.key === 'TIKTOK' ? 'TikTok' : c.key}</span>)}</>
}

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

// A multi-day item runs due_date → meta.end_date (inclusive). One-day items end where they start.
const endOf = (r: Rec) => {
  const e = r.meta?.end_date
  return typeof e === 'string' && e > (r.due_date as string) ? e : (r.due_date as string)
}
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const monthEnd = (k: string) => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
const inMonth = (r: Rec, k: string) => (r.due_date as string) <= monthEnd(k) && endOf(r) >= `${k}-01`
const multi = (r: Rec) => endOf(r) !== r.due_date
const personOf = (r: Rec) => (typeof r.meta?.person === 'string' ? r.meta.person.trim() : '')
const span = (r: Rec) => endOf(r) === r.due_date ? fullDay(r.due_date as string) : `${fullDay(r.due_date as string)} – ${fullDay(endOf(r))}`

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
    .filter(r => inMonth(r, current))
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))

  // Tags present this month, most used first — that order drives the colours.
  const tagCounts = new Map<string, number>()
  for (const r of mine) {
    const { tag } = splitTag(r.title)
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const social = category === 'social_plan'
  const people = [...new Set(mine.map(personOf).filter(Boolean))].sort()
  // One colour per person, handed out in name order over everyone on the
  // calendar, so two people never share a colour (until there are more than 8).
  const everyone = [...new Set(rows.map(personOf).filter(Boolean))].sort()
  const personColor = (p: string) => (p ? { fg: PEOPLE[everyone.indexOf(p) % PEOPLE.length] } : undefined)
  // Own colour first, then the person's colour — a solid bar with white text.
  const itemStyle = (r: Rec) => {
    const c = personColor(personOf(r))
    return colorStyle(r.meta?.color) ?? (c ? ({ '--tone': c.fg, '--tone-bg': c.fg, color: '#fff' } as React.CSSProperties) : undefined)
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)

  // ── 1. What needs me now? ───────────────────────────────────────
  const isDone = (r: Rec) => (r.status || '').toLowerCase() === 'done'
  // Still running counts as ahead: a span that started earlier but ends today or later.
  const ahead = rows
    .filter(r => endOf(r) >= today && !isDone(r))
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))
  const dueToday = rows.filter(r => (r.due_date as string) <= today && endOf(r) >= today && !isDone(r))
  const next7 = ahead.filter(r => daysBetween(r.due_date as string, today) <= 7)
  const passed = mine.filter(r => endOf(r) < today && !isDone(r)).length

  const byDay = new Map<string, Rec[]>()
  // A multi-day item sits on every day of its span that falls in this month.
  for (const r of mine) {
    for (let k = r.due_date as string; k <= endOf(r); k = addDays(k, 1)) {
      if (k.slice(0, 7) !== current) continue
      byDay.set(k, [...(byDay.get(k) ?? []), r])
    }
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

  // pos: where this day sits in a multi-day bar. Middle/end pieces carry no text
  // (only the first day of each week repeats it), so the bar reads as one link.
  // Multi-day items get a fixed row ("lane") per week, so a bar stays at the
  // same height from its first day to its last and reads as one connected line.
  const lanesOf = (week: (number | null)[]) => {
    const days = week.filter((d): d is number => d !== null).map(iso)
    if (!days.length) return [] as Rec[][]
    const lo = days[0], hi = days[days.length - 1]
    const spans = mine.filter(r => multi(r) && (r.due_date as string) <= hi && endOf(r) >= lo)
      .sort((a, b) => ((a.due_date as string) < (b.due_date as string) ? -1 : (a.due_date as string) > (b.due_date as string) ? 1 : a.id - b.id))
    const lanes: Rec[][] = []
    for (const r of spans) {
      const free = lanes.find(l => l.every(o => endOf(o) < (r.due_date as string) || (o.due_date as string) > endOf(r)))
      if (free) free.push(r)
      else lanes.push([r])
    }
    return lanes
  }

  const Chip = ({ r, pos = 'one', label = true }: { r: Rec; pos?: 'one' | 'start' | 'mid' | 'end'; label?: boolean }) => {
    const { tag, rest } = splitTag(r.title)
    const who = personOf(r)
    return (
      <ChipPop
        title={rest}
        person={who}
        tag={who ? `🌴 ${who}` : social ? (channelsOf(tag).map(c => (c.key === 'TIKTOK' ? 'TikTok' : c.key)).join(' · ') || tag) : (/^\s*\[([^\]]+)\]/.exec(r.title)?.[1]?.trim() ?? null)}
        when={span(r)}
        status={isDone(r) ? '✓ Done' : endOf(r) < today ? 'Not done' : 'Planned'}
        {...(editable ? { id: r.id, done: isDone(r), rawTitle: r.title, date: r.due_date as string, endDate: endOf(r) === r.due_date ? '' : endOf(r), category } : {})}
      >
        <span className={`pt-chip tone-${toneFor(tag, tags)}${isDone(r) ? ' done' : ''}${itemStyle(r) ? ' colored' : ''}${who && !r.meta?.color ? ' person' : ''} bar-${pos}`} style={itemStyle(r) ?? (social ? channelStyle(tag) : undefined)}>
          {label ? <>{who ? <b>{who}</b> : tag ? <b>{social ? <ChannelTags tag={tag} /> : tag}</b> : null}{rest}</> : '\u00a0'}
        </span>
      </ChipPop>
    )
  }

  return (
    <>
      <h1 className="ph">{title}</h1>
      <p className="cap">{caption}</p>
      {editable ? (
        <div style={{ margin: '10px 0 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
          <AddTask defaultDate={today} category={category} basePath={basePath} label={addLabel} {...(addPlaceholder ? { placeholder: addPlaceholder } : {})} />
          {category === 'events_other' ? <AddLeave defaultDate={today} basePath={basePath} /> : null}
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
                <span className="pt-when">{(r.due_date as string) < today ? 'ongoing' : whenLabel(r.due_date as string, today)}</span>
                <span className="pt-date">{span(r)}</span>
                <Chip r={r} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 2 ─ How busy is each month? Every month at once, with its count, so
             you can see the shape of the year and jump straight to one. */}
      <nav className="pt-months" aria-label="Month">
        {months.map((k, i) => {
          const n = rows.filter(r => inMonth(r, k)).length
          const isNow = k === today.slice(0, 7)
          return (
            <span key={k} className="pt-m-wrap">
            {i === 0 || k.endsWith('-01') ? <span className="pt-m-year">{k.slice(0, 4)}</span> : null}
            <Link
              href={`${basePath}?m=${k}`}
              className={`pt-month${k === current ? ' active' : ''}`}
              aria-current={k === current ? 'page' : undefined}
            >
              <span className="pt-m-name">{monthShort(k)}{isNow ? ' •' : ''}</span>
              <span className={`pt-m-count${n ? '' : ' none'}`} title={`${n} item${n === 1 ? '' : 's'}`}>{n || '–'}</span>
            </Link>
            </span>
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

      {social || tags.length > 0 ? (
        social ? (
        <div className="pt-legend">
          {CHANNELS.map(c => (
            <span key={c.key}>
              <i className="pt-sw" style={{ background: c.fg }} aria-hidden="true" />
              {c.label}
              <b>{mine.filter(r => channelsOf(splitTag(r.title).tag).some(x => x.key === c.key)).length}</b>
            </span>
          ))}
        </div>
        ) : (
        <div className="pt-legend">
          {tags.map(t => (
            <span key={t}>
              <i className={`pt-sw tone-${toneFor(t, tags)}`} aria-hidden="true" />
              {t}
              <b>{tagCounts.get(t)}</b>
            </span>
          ))}
        </div>
        )
      ) : null}

      {people.length ? (
        <div className="pt-legend">
          {people.map(p => (
            <span key={p}>
              <i className="pt-sw" style={{ background: personColor(p)?.fg }} aria-hidden="true" />
              🌴 {p}
              <b>{mine.filter(r => personOf(r) === p).length}</b>
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
            {weeks.map((week, wi) => { const lanes = lanesOf(week); return (
              <div className="cal-grid" role="row" key={`w${wi}`}>
                {week.map((d, n) => {
                  if (d === null) {
                    return <div key={`p${wi}-${n}`} className="cal-cell out" aria-hidden="true" />
                  }
                  const key = iso(d)
                  const items = byDay.get(key) ?? []
                  const singles = items.filter(r => !multi(r))
                  // The week's first visible day (or the month's 1st) repeats the label.
                  const rowStart = n === 0 || week[n - 1] === null
                  const rowEnd = n === 6 || week[n + 1] === null
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
                        {lanes.map((lane, li) => {
                          const r = lane.find(o => (o.due_date as string) <= key && endOf(o) >= key)
                          if (!r) return <span key={`l${li}`} className="pt-chip bar-gap" aria-hidden="true">{'\u00a0'}</span>
                          const first = key === r.due_date, last = key === endOf(r)
                          const open = first || rowStart, close = last || rowEnd
                          const pos = open && close ? 'one' : open ? 'start' : close ? 'end' : 'mid'
                          return <Chip key={`l${li}`} r={r} pos={pos} label={open} />
                        })}
                        {singles.map(r => <Chip key={r.id} r={r} />)}
                      </div>
                      {items.length > 0 ? (
                        <span className="cal-count" aria-hidden="true">{items.length}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) })}
          </div>

          {/* The full list, day by day. The calendar shows shape; this is where
              you read the whole title. Days with nothing are simply absent. */}
          <div className="pt-days">
            {[...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([day, items]) => [day, items.filter(r => day === ((r.due_date as string) < `${current}-01` ? `${current}-01` : r.due_date))] as const)
              .filter(([, items]) => items.length > 0)
              .map(([day, items]) => (
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
                        {personOf(r) ? <span className="pt-tag person" style={{ background: personColor(personOf(r))?.fg }}>🌴 {personOf(r)}</span> : null}
                        {tag ? (
                          <span className={`pt-tag tone-${toneFor(tag, tags)}`} style={colorStyle(r.meta?.color) ?? (social ? channelStyle(tag) : undefined)}>{social ? <ChannelTags tag={tag} /> : tag}</span>
                        ) : null}
                        <span className="pt-title">{rest}</span>
                        {endOf(r) !== r.due_date ? <span className="pt-day-note">{span(r)}</span> : null}
                        {editable && !done && endOf(r) < today ? <span className="pill overdue">not done</span> : null}
                        {moved.length ? (
                          <span className="pt-day-note">moved from {fullDay(moved[moved.length - 1].date)}</span>
                        ) : null}
                        {editable ? <ItemActions id={r.id} done={done} date={r.due_date as string} endDate={endOf(r) === r.due_date ? '' : endOf(r)} title={r.title} color={r.meta?.color ?? ''} category={category} /> : null}
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
