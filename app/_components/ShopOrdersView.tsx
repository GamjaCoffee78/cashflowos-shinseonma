// The look of a marketplace tab — used by Shopee MY, Shopee SG and TikTok Shop,
// so the three stay identical by construction rather than by copy-paste.
//
// Reading order, top to bottom: how today is going → the last 7 and 30 days
// against the periods before them → the shape of the month → what's selling →
// every month synced → the orders themselves, grouped by day so a date is read
// once, not forty times.
//
// Presentation only: it is handed rows and totals, and never fetches anything.
import { daysAgoISO } from '@/lib/ads-daily'

export type ShopRow = {
  id: number
  ref: string            // the marketplace's order number
  date: string           // YYYY-MM-DD
  buyer: string
  items: string
  amount: number
  currency: string
  status: string
  net?: number           // payout after the marketplace's cut, when the sync fetched it
}
export type MonthRow = { month: string; orders: number; revenue: number }
export type StatusLook = { label: string; pill: string }

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { weekday: 'short', timeZone: 'UTC' })
}
const monthName = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// Totals for a window, inclusive. `back` = days ago it starts, `until` = days
// ago it ends, so the period before the last 7 days is (13, 7).
function totals(rows: ShopRow[], back: number, until = 0) {
  const from = daysAgoISO(back)
  const to = daysAgoISO(until)
  const w = rows.filter(o => o.date >= from && o.date <= to)
  const revenue = w.reduce((s, o) => s + o.amount, 0)
  // After the marketplace's cut. Orders without a payout yet are estimated at the
  // fee rate of those that have one; `netExact` says whether any estimating happened.
  const known = w.filter(o => o.net != null)
  const knownGross = known.reduce((s, o) => s + o.amount, 0)
  const knownNet = known.reduce((s, o) => s + (o.net as number), 0)
  const keep = knownGross > 0 ? knownNet / knownGross : 0
  const net = known.length ? knownNet + (revenue - knownGross) * keep : undefined
  return { orders: w.length, revenue, avg: w.length ? revenue / w.length : 0, net, netExact: known.length === w.length }
}

// What sold, from the summary the sync wrote ("2× Bulgogi Sauce @ RM8.61; …").
function topProducts(rows: ShopRow[], limit = 5) {
  const tally = new Map<string, number>()
  for (const o of rows) {
    for (const part of o.items.split(';')) {
      const m = part.trim().match(/^(\d+)×\s*(.+?)\s*@/)
      if (!m) continue
      const name = m[2].replace(/\s*\([^)]*\)\s*$/, '').trim()
      if (name) tally.set(name, (tally.get(name) ?? 0) + Number(m[1]))
    }
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, qty]) => ({ name, qty }))
}

// Change against the period before, coloured only where the direction has a
// clear meaning. "new" when there is nothing to compare with.
function Delta({ now, before }: { now: number; before: number }) {
  if (!before && !now) return null
  if (!before) return <span className="dlt flat">new</span>
  const diff = now - before
  if (!diff) return <span className="dlt flat">–</span>
  return (
    <span className={`dlt ${diff > 0 ? 'good' : 'bad'}`} title="vs the period before">
      {diff > 0 ? '▲' : '▼'} {Math.abs(Math.round((diff / before) * 100))}%
    </span>
  )
}

function Period({ label, days, rows, m, since, cutBy }: { label: string; days: number; rows: ShopRow[]; m: (n: number) => string; since: string; cutBy?: string }) {
  const now = totals(rows, days - 1)
  const before = totals(rows, days * 2 - 1, days)
  // Only compare against a period we actually hold, or a shop synced a week ago
  // shows "+612%" against a fortnight that was never fetched.
  const comparable = !!since && daysAgoISO(days * 2 - 1) >= since
  return (
    <div className="sp-period">
      <p className="nav-label">{label}</p>
      <div className="sp-figs">
        <div>
          <span className="l">{cutBy ? `Sales · before ${cutBy} cut` : 'Revenue'}</span>
          <span className="v big">{m(now.revenue)}</span>
          {comparable && <Delta now={now.revenue} before={before.revenue} />}
        </div>
        {cutBy && (
          <div>
            <span className="l">You receive · after fees</span>
            {now.net != null ? (
              <>
                <span className="v big" style={{ color: 'var(--sage)' }}>{now.netExact ? '' : '≈ '}{m(now.net)}</span>
                <span className="sp-cut">
                  {cutBy} took {m(now.revenue - now.net)} ({now.revenue ? Math.round(((now.revenue - now.net) / now.revenue) * 100) : 0}%)
                  {!now.netExact && ' · est.'}
                </span>
              </>
            ) : (
              <span className="sp-cut">Not synced yet — press Sync now</span>
            )}
          </div>
        )}
        <div>
          <span className="l">Orders</span>
          <span className="v">{now.orders.toLocaleString('en-MY')}</span>
          {comparable && <Delta now={now.orders} before={before.orders} />}
        </div>
        <div>
          <span className="l">Average order</span>
          <span className="v">{m(now.avg)}</span>
          {comparable && <Delta now={now.avg} before={before.avg} />}
        </div>
      </div>
    </div>
  )
}

export default function ShopOrdersView({
  title,
  caption,
  rows,
  months,
  currency,
  money,
  statusOf,
  today,
  toolbar,
  empty,
  cutBy,
}: {
  title: string
  caption: string
  rows: ShopRow[]
  months: MonthRow[]
  currency: string
  money: (n: number, currency: string) => string
  statusOf: (s: string) => StatusLook
  today: string
  toolbar?: React.ReactNode      // the Sync now button
  empty: React.ReactNode         // shown when there are no orders yet
  cutBy?: string                 // e.g. "Shopee": adds the after-fees figure, from rows' net
}) {
  const m = (n: number) => money(n, currency)
  const todays = rows.filter(o => o.date === today)
  const todayRevenue = todays.reduce((s, o) => s + o.amount, 0)
  const since = rows.reduce((min, o) => (!min || o.date < min ? o.date : min), '')

  // 30-day strip: revenue per day, zero-filled so quiet days read as gaps.
  const byDate = new Map<string, number>()
  for (const o of rows) byDate.set(o.date, (byDate.get(o.date) ?? 0) + o.amount)
  const strip = Array.from({ length: 30 }, (_, i) => {
    const date = daysAgoISO(29 - i)
    return { date, value: byDate.get(date) ?? 0 }
  })
  const max = Math.max(1, ...strip.map(s => s.value))
  const peak = strip.reduce((best, s) => (s.value > best.value ? s : best), strip[0])

  // The order list, grouped by day: the date is a heading, not a repeated cell.
  const recent = rows.slice(0, 60)
  const days: { date: string; list: ShopRow[] }[] = []
  for (const o of recent) {
    const last = days[days.length - 1]
    if (last && last.date === o.date) last.list.push(o)
    else days.push({ date: o.date, list: [o] })
  }
  const best = topProducts(rows.filter(o => o.date >= daysAgoISO(29)))
  const monthMax = Math.max(1, ...months.map(x => x.revenue))

  return (
    <>
      <div className="sp-head">
        <div>
          <h1 className="ph">{title}</h1>
          <p className="cap">{caption}</p>
        </div>
        {rows.length > 0 && (
          <div className="sp-today">
            <span className="l">Today</span>
            <span className="v">{m(todayRevenue)}</span>
            <span className="s">{todays.length} order{todays.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {toolbar}

      {rows.length === 0 ? (
        <div className="empty">{empty}</div>
      ) : (
        <>
          <div className="sp-periods">
            <Period label="Last 7 days" days={7} rows={rows} m={m} since={since} cutBy={cutBy} />
            <Period label="Last 30 days" days={30} rows={rows} m={m} since={since} cutBy={cutBy} />
          </div>

          <section className="sp-card">
            <div className="sp-card-head">
              <p className="nav-label" style={{ margin: 0 }}>Revenue by day</p>
              {peak.value > 0 && <span className="cap" style={{ margin: 0 }}>Best day {dayLabel(peak.date)} · {m(peak.value)}</span>}
            </div>
            <div className="sp-chart" role="img" aria-label={`${title} revenue for the last 30 days`}>
              {strip.map(s => (
                <div className="sp-col" key={s.date} title={`${weekday(s.date)} ${dayLabel(s.date)} · ${m(s.value)}`}>
                  <div
                    className={`sp-bar${s.date === today ? ' today' : ''}${s.value && s.value === peak.value ? ' peak' : ''}`}
                    style={{ height: `${Math.max(2, (s.value / max) * 100)}%`, opacity: s.value ? 1 : 0.22 }}
                  />
                </div>
              ))}
            </div>
            <div className="sp-axis">
              <span>{dayLabel(strip[0].date)}</span>
              <span>Today</span>
            </div>
          </section>

          {best.length > 0 && (
            <section className="sp-card">
              <p className="nav-label" style={{ margin: '0 0 10px' }}>Best sellers · last 30 days</p>
              <ol className="sp-best">
                {best.map((p, i) => (
                  <li key={p.name}>
                    <span className="n">{i + 1}</span>
                    <span className="t" title={p.name}>{p.name}</span>
                    <span className="q">{p.qty} sold</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {months.length > 1 && (
            <section className="sp-card">
              <p className="nav-label" style={{ margin: '0 0 10px' }}>By month · everything synced</p>
              <table className="sp-months">
                <tbody>
                  {months.map(x => (
                    <tr key={x.month}>
                      <td className="mn">{monthName(x.month)}</td>
                      <td className="mb"><span style={{ width: `${Math.max(2, (x.revenue / monthMax) * 100)}%` }} /></td>
                      <td className="mo">{x.orders.toLocaleString('en-MY')}</td>
                      <td className="mr">{m(x.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="nav-label" style={{ margin: '28px 0 8px' }}>Latest orders</p>
          {days.map(d => {
            const dayTotal = d.list.reduce((s, o) => s + o.amount, 0)
            return (
              <section className="sp-day" key={d.date}>
                <div className="sp-day-head">
                  <span className="d">{d.date === today ? 'Today' : `${weekday(d.date)} ${dayLabel(d.date)}`}</span>
                  <span className="t">{d.list.length} order{d.list.length === 1 ? '' : 's'} · {m(dayTotal)}</span>
                </div>
                <ul className="sp-orders">
                  {d.list.map(o => {
                    const st = statusOf(o.status)
                    return (
                      <li key={o.id}>
                        <div className="sp-o-main">
                          <span className="sp-o-items" title={o.items}>{o.items || '—'}</span>
                          <span className="sp-o-meta">
                            <span className="sp-sn">#{o.ref}</span>
                            {o.buyer ? <> · {o.buyer}</> : null}
                          </span>
                        </div>
                        <div className="sp-o-right">
                          <span className="sp-o-amt">{money(o.amount, o.currency || currency)}</span>
                          <span className={`pill ${st.pill}`}>{st.label}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {rows.length > recent.length ? (
            <p className="cap">Showing the {recent.length} most recent of {rows.length} synced orders.</p>
          ) : null}
        </>
      )}
    </>
  )
}
