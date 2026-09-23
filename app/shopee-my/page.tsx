// 👉 Shopee MY 🛍️ — orders straight from Shopee's Open API, synced every
// morning (lib/shopee.ts). Its own `shopee_order` rows: the Ecomm and money
// tabs keep counting the rows that came from the xlsx exports, and nothing here
// overwrites or double-counts them.
import { getRecords, rm, todayISO } from '@/lib/records'
import { shopeeOrders, shopeeTotals, shopeeConfigured } from '@/lib/shopee'
import { daysAgoISO } from '@/lib/ads-daily'
import Stat from '@/app/_components/Stat'
import SyncNow from '@/app/_components/SyncNow'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const rm2 = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default async function ShopeeMY() {
  const orders = shopeeOrders(await getRecords())
  const t7 = shopeeTotals(orders, 7)
  const t30 = shopeeTotals(orders, 30)
  const today = todayISO()
  const todayCount = orders.filter(o => o.date === today).length

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
      <h1 className="ph">Shopee MY 🛍️</h1>
      <p className="cap">
        Orders pulled live from Shopee, synced every morning with the brief. Separate from the Ecomm tab, which still
        shows the figures imported from your Shopee exports — nothing here changes those.
      </p>

      {shopeeConfigured && <SyncNow source="shopee" label="🛍️ Sync now" hint="Asking Shopee for the latest orders…" />}

      {orders.length === 0 ? (
        <div className="empty">
          {shopeeConfigured ? (
            <>
              No orders pulled yet. Link your shop once at <code>/api/shopee/authorize</code>, then press <b>Sync now</b>
              {' '}— or wait for the 8:15am run.
            </>
          ) : (
            <>
              Shopee isn&apos;t wired yet. Add <code>SHOPEE_PARTNER_ID</code> and <code>SHOPEE_PARTNER_KEY</code> in Vercel
              (Shopee Open Platform → App List → your app), redeploy, then open <code>/api/shopee/authorize</code> once to
              connect the shop.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid">
            <Stat label="Today" value={todayCount} />
            <Stat label="Orders · 7 days" value={t7.orders} />
            <Stat label="Revenue · 7 days" value={rm2(t7.revenue)} />
            <Stat label="Orders · 30 days" value={t30.orders} />
            <Stat label="Revenue · 30 days" value={rm2(t30.revenue)} />
            <Stat label="Average order" value={rm2(t30.avg)} />
          </div>

          <p className="nav-label" style={{ margin: '0 0 8px' }}>Revenue · last 30 days</p>
          <div className="tt-strip" role="img" aria-label="Shopee revenue for the last 30 days">
            {strip.map(s => (
              <div className="tt-col" key={s.date} title={`${dayLabel(s.date)} · ${rm(s.value)}`}>
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
                  <td data-label="Amount">{rm2(o.amount)}</td>
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
