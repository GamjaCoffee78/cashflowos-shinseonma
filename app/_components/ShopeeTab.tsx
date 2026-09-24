// The body of a per-shop Shopee tab (Shopee MY, Shopee SG). One shop's orders
// only, always in that shop's own currency — MYR and SGD are never added up.
//
// Reading order, top to bottom: how today is going → the last 7 and 30 days
// against the periods before them → the shape of the month → what's selling →
// the orders themselves, grouped by day so a date is read once, not forty times.
import { getRecords, todayISO } from '@/lib/records'
import { shopeeOrders, shopeeTotals, topProducts, shopeeConfigured, money, currencyOf, linkedRegions, earliestDay, type ShopeeRow } from '@/lib/shopee'
import { daysAgoISO } from '@/lib/ads-daily'
import SyncNow from '@/app/_components/SyncNow'

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { weekday: 'short', timeZone: 'UTC' })
}

// Shopee's shouty enum, in plain words, with the pill colour that matches the
// rest of the app: green = money landed, blue = on its way, amber = waiting.
const STATUS: Record<string, { label: string; pill: string }> = {
  COMPLETED: { label: 'Completed', pill: 'paid' },
  SHIPPED: { label: 'Shipped', pill: 'open' },
  TO_CONFIRM_RECEIVE: { label: 'Delivered', pill: 'open' },
  PROCESSED: { label: 'Processed', pill: 'open' },
  READY_TO_SHIP: { label: 'Ready to ship', pill: 'pending' },
  UNPAID: { label: 'Unpaid', pill: 'pending' },
  IN_CANCEL: { label: 'Cancelling', pill: 'lost' },
  CANCELLED: { label: 'Cancelled', pill: 'lost' },
  TO_RETURN: { label: 'Return', pill: 'lost' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s ? s.replace(/_/g, ' ').toLowerCase() : '—', pill: '' }

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

function Period({
  label,
  days,
  orders,
  m,
  since,
}: {
  label: string
  days: number
  orders: ShopeeRow[]
  m: (n: number) => string
  since: string          // the oldest day synced; older windows can't be compared
}) {
  const now = shopeeTotals(orders, days - 1)
  const before = shopeeTotals(orders, days * 2 - 1, days)
  // Only compare against a period we actually hold. Without this, a shop synced
  // a week ago shows "+612%" against a fortnight that was never fetched.
  const comparable = !!since && daysAgoISO(days * 2 - 1) >= since
  return (
    <div className="sp-period">
      <p className="nav-label">{label}</p>
      <div className="sp-figs">
        <div>
          <span className="l">Revenue</span>
          <span className="v big">{m(now.revenue)}</span>
          {comparable && <Delta now={now.revenue} before={before.revenue} />}
        </div>
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

export default async function ShopeeTab({
  region,
  title,
  fallbackCurrency,
}: {
  region: 'MY' | 'SG'
  title: string
  fallbackCurrency: string   // shown before the first order arrives
}) {
  const orders = shopeeOrders(await getRecords(), region)
  const cur = currencyOf(orders, fallbackCurrency)
  const m = (n: number) => money(n, cur)
  const today = todayISO()
  const todays = orders.filter(o => o.date === today)
  const todayRevenue = todays.reduce((s, o) => s + o.amount, 0)
  const linked = shopeeConfigured ? await linkedRegions().catch(() => []) : []
  const thisShopLinked = linked.includes(region)

  // 30-day strip: revenue per day, zero-filled so quiet days read as gaps.
  const byDate = new Map<string, number>()
  for (const o of orders) byDate.set(o.date, (byDate.get(o.date) ?? 0) + o.amount)
  const strip = Array.from({ length: 30 }, (_, i) => {
    const date = daysAgoISO(29 - i)
    return { date, value: byDate.get(date) ?? 0 }
  })
  const max = Math.max(1, ...strip.map(s => s.value))
  const peak = strip.reduce((best, s) => (s.value > best.value ? s : best), strip[0])

  // The order list, grouped by day: the date is a heading, not a repeated cell.
  const recent = orders.slice(0, 60)
  const days: { date: string; rows: ShopeeRow[] }[] = []
  for (const o of recent) {
    const last = days[days.length - 1]
    if (last && last.date === o.date) last.rows.push(o)
    else days.push({ date: o.date, rows: [o] })
  }
  const best = topProducts(orders.filter(o => o.date >= daysAgoISO(29)))
  const since = earliestDay(orders)

  return (
    <>
      <div className="sp-head">
        <div>
          <h1 className="ph">{title}</h1>
          <p className="cap">
            Live from your Shopee {region} shop · all figures in {cur} · synced every morning
          </p>
        </div>
        {orders.length > 0 && (
          <div className="sp-today">
            <span className="l">Today</span>
            <span className="v">{m(todayRevenue)}</span>
            <span className="s">{todays.length} order{todays.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {shopeeConfigured && <SyncNow source="shopee" region={region} label="🛍️ Sync now" hint={`Asking Shopee ${region} for the latest orders…`} />}

      {orders.length === 0 ? (
        <div className="empty">
          {!shopeeConfigured ? (
            <>
              Shopee isn&apos;t wired yet. Add <code>SHOPEE_PARTNER_ID</code> and <code>SHOPEE_PARTNER_KEY</code> in Vercel
              (Shopee Open Platform → App List → your app), redeploy, then open <code>/api/shopee/authorize</code> once per shop.
            </>
          ) : thisShopLinked ? (
            <>No orders in the last 30 days for this shop yet — press <b>Sync now</b>, or wait for the 8:15am run.</>
          ) : (
            <>
              Your Shopee {region} shop isn&apos;t linked yet. Sign in to <b>that shop&apos;s</b> Seller Centre, then open{' '}
              <code>/api/shopee/authorize</code> — Shopee asks which shop to connect, and the region decides which tab it feeds.
              {linked.length ? <> (Linked so far: {linked.join(', ')}.)</> : null}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="sp-periods">
            <Period label="Last 7 days" days={7} orders={orders} m={m} since={since} />
            <Period label="Last 30 days" days={30} orders={orders} m={m} since={since} />
          </div>

          <section className="sp-card">
            <div className="sp-card-head">
              <p className="nav-label" style={{ margin: 0 }}>Revenue by day</p>
              {peak.value > 0 && <span className="cap" style={{ margin: 0 }}>Best day {dayLabel(peak.date)} · {m(peak.value)}</span>}
            </div>
            <div className="sp-chart" role="img" aria-label={`Shopee ${region} revenue for the last 30 days`}>
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

          <p className="nav-label" style={{ margin: '28px 0 8px' }}>Latest orders</p>
          {days.map(d => {
            const dayTotal = d.rows.reduce((s, o) => s + o.amount, 0)
            return (
              <section className="sp-day" key={d.date}>
                <div className="sp-day-head">
                  <span className="d">{d.date === today ? 'Today' : `${weekday(d.date)} ${dayLabel(d.date)}`}</span>
                  <span className="t">{d.rows.length} order{d.rows.length === 1 ? '' : 's'} · {m(dayTotal)}</span>
                </div>
                <ul className="sp-orders">
                  {d.rows.map(o => {
                    const st = statusOf(o.status)
                    return (
                      <li key={o.id}>
                        <div className="sp-o-main">
                          <span className="sp-o-items" title={o.items}>{o.items || '—'}</span>
                          <span className="sp-o-meta">
                            <span className="sp-sn">#{o.order_sn}</span>
                            {o.buyer ? <> · {o.buyer}</> : null}
                          </span>
                        </div>
                        <div className="sp-o-right">
                          <span className="sp-o-amt">{money(o.amount, o.currency || cur)}</span>
                          <span className={`pill ${st.pill}`}>{st.label}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {orders.length > recent.length ? (
            <p className="cap">Showing the {recent.length} most recent of {orders.length} synced orders.</p>
          ) : null}
        </>
      )}
    </>
  )
}
