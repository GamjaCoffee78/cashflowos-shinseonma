// The body of a per-shop Shopee tab (Shopee MY, Shopee SG). One shop's orders
// only, always in that shop's own currency — MYR and SGD are never added up.
import { getRecords, rm, todayISO } from '@/lib/records'
import { shopeeOrders, shopeeTotals, shopeeConfigured, money, currencyOf, linkedRegions } from '@/lib/shopee'
import { daysAgoISO } from '@/lib/ads-daily'
import Stat from '@/app/_components/Stat'
import SyncNow from '@/app/_components/SyncNow'

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
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
  const t7 = shopeeTotals(orders, 7)
  const t30 = shopeeTotals(orders, 30)
  const today = todayISO()
  const todayCount = orders.filter(o => o.date === today).length
  const linked = shopeeConfigured ? await linkedRegions().catch(() => []) : []
  const thisShopLinked = linked.includes(region)

  // 30-day strip: revenue per day, zero-filled so quiet days show as gaps.
  const byDate = new Map<string, number>()
  for (const o of orders) byDate.set(o.date, (byDate.get(o.date) ?? 0) + o.amount)
  const strip: { date: string; value: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const date = daysAgoISO(i)
    strip.push({ date, value: byDate.get(date) ?? 0 })
  }
  const max = Math.max(1, ...strip.map(s => s.value))

  return (
    <>
      <h1 className="ph">{title}</h1>
      <p className="cap">
        Orders pulled live from your Shopee {region} shop, synced every morning with the brief. Figures are in {cur}, and are
        never mixed with the other shop&apos;s. Separate from the Ecomm tab, which still shows what you imported from
        your Shopee exports — nothing here changes those.
      </p>

      {shopeeConfigured && <SyncNow source="shopee" region={region} label="🛍️ Sync now" hint={`Asking Shopee ${region} for the latest orders…`} />}

      {orders.length === 0 ? (
        <div className="empty">
          {!shopeeConfigured ? (
            <>
              Shopee isn&apos;t wired yet. Add <code>SHOPEE_PARTNER_ID</code> and <code>SHOPEE_PARTNER_KEY</code> in Vercel
              (Shopee Open Platform → App List → your app), redeploy, then open <code>/api/shopee/authorize</code> once per shop.
            </>
          ) : thisShopLinked ? (
            <>No orders in the last {30} days for this shop yet — press <b>Sync now</b>, or wait for the 8:15am run.</>
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
          <div className="grid">
            <Stat label="Today" value={todayCount} />
            <Stat label="Orders · 7 days" value={t7.orders} />
            <Stat label={`Revenue · 7 days`} value={m(t7.revenue)} />
            <Stat label="Orders · 30 days" value={t30.orders} />
            <Stat label={`Revenue · 30 days`} value={m(t30.revenue)} />
            <Stat label="Average order" value={m(t30.avg)} />
          </div>

          <p className="nav-label" style={{ margin: '0 0 8px' }}>Revenue · last 30 days ({cur})</p>
          <div className="tt-strip" role="img" aria-label={`Shopee ${region} revenue for the last 30 days`}>
            {strip.map(s => (
              <div className="tt-col" key={s.date} title={`${dayLabel(s.date)} · ${m(s.value)}`}>
                <div className="tt-bar" style={{ height: `${Math.max(2, (s.value / max) * 100)}%`, opacity: s.value ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="tt-axis">
            <span>{dayLabel(strip[0].date)}</span>
            <span>{dayLabel(strip[strip.length - 1].date)}</span>
          </div>

          <p className="nav-label" style={{ margin: '24px 0 8px' }}>Latest orders</p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Day</th>
                <th>Order</th>
                <th>Buyer</th>
                <th>What</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 40).map(o => (
                <tr key={o.id}>
                  <td data-label="Day" style={{ whiteSpace: 'nowrap' }}>{dayLabel(o.date)}</td>
                  <td data-label="Order" style={{ whiteSpace: 'nowrap' }}>#{o.order_sn}</td>
                  <td data-label="Buyer">{o.buyer || '—'}</td>
                  <td data-label="What" style={{ color: 'var(--ink-soft)' }}>{o.items || '—'}</td>
                  <td data-label="Amount">{money(o.amount, o.currency || cur)}</td>
                  <td data-label="Status"><span className={`pill ${/COMPLETED|SHIPPED/i.test(o.status) ? 'paid' : 'open'}`}>{o.status || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length > 40 ? <p className="cap" style={{ marginTop: 10 }}>Showing the 40 most recent of {orders.length} synced orders.</p> : null}
        </>
      )}
    </>
  )
}
