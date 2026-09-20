// 👉 Ecomm Sales — every Shopee MY + Shopee SG row, money IN and money OUT.
// It MIRRORS the rows; it does not move them. The same records still count on
// Cash In, Cash Out and the Dashboard totals — nothing is taken away.
//
// A row belongs here when its `meta.group` starts with "Shopee" (what the
// importer stamps on: "Shopee MY", "Shopee SG"), which is the same field the
// Dashboard's channel section reads, so the two can never disagree.
import {
  getRecords, getChannelMonthly, inMoneyWindow, moneyFromLabel, rm, m, todayISO, type Rec,
} from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'

export const dynamic = 'force-dynamic'

// Same "not in the bank yet" statuses Cash In uses, so the tabs agree.
const WAITING = ['waiting', 'unpaid', 'overdue', 'pending']

const groupOf = (r: Rec) => String(r.meta?.group ?? '').trim()
const isShopee = (r: Rec) => groupOf(r).toLowerCase().startsWith('shopee')

// Which market a row belongs to. Underscores and hyphens are flattened first —
// they're word characters, so 'shopee_sg' would otherwise never match \bsg\b.
const marketOf = (r: Rec): 'my' | 'sg' | 'other' => {
  const g = groupOf(r).toLowerCase().replace(/[_\-/|]+/g, ' ')
  if (/\b(sg|singapore)\b/.test(g)) return 'sg'
  if (/\b(my|malaysia|mys)\b/.test(g)) return 'my'
  return 'other' // a Shopee row with no market marker — shown, never silently dropped
}

export default async function EcommSales() {
  const all = await getRecords()
  // Same reporting window as the Dashboard and the money tabs.
  const rows = all.filter(r => isShopee(r) && inMoneyWindow(r))
  const period = moneyFromLabel()
  const trend = getChannelMonthly(all, 'Shopee')

  const isWaiting = (r: Rec) => WAITING.includes((r.status || '').toLowerCase())
  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows.filter(r => r.category === 'cash_in')
  const costs = rows.filter(r => r.category === 'cash_out')
  const byMarket = (rs: Rec[], mk: 'my' | 'sg' | 'other') => rs.filter(r => marketOf(r) === mk)

  const salesMY = total(byMarket(sales, 'my'))
  const salesSG = total(byMarket(sales, 'sg'))
  const salesOther = total(byMarket(sales, 'other'))
  const totalSales = salesMY + salesSG + salesOther
  const totalCosts = total(costs)

  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))
  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 0)

  // Waiting money first — that's what needs chasing.
  const sorted = (rs: Rec[]) => [...rs].sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)))

  const Rows = ({ label, rs }: { label: string; rs: Rec[] }) => {
    if (rs.length === 0) return null
    return (
      <>
        <p className="rowlabel">{label} · {rs.length} row{rs.length === 1 ? '' : 's'}</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>What</th>
              <th>Group</th>
              <th>In / Out</th>
              <th>Status</th>
              <th>Date</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted(rs).map(r => {
              const shownStatus = isOverdue(r) ? 'overdue' : r.status || '—'
              const out = r.category === 'cash_out'
              return (
                <tr key={r.id}>
                  <td data-label="What">{r.title}</td>
                  <td data-label="Group">{m(r, 'group')}</td>
                  <td data-label="In / Out">{out ? 'Out' : 'In'}</td>
                  <td data-label="Status">
                    <span className={`pill ${shownStatus}`}>{shownStatus}</span>
                  </td>
                  <td data-label="Date">{r.due_date || r.created_at?.slice(0, 10) || '—'}</td>
                  <td data-label="Amount">{out ? `− ${rm(r.amount)}` : rm(r.amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <>
      <h1 className="ph">Ecomm Sales 🛒</h1>
      <p className="cap">
        Shopee MY + Shopee SG, money in and out{period ? ` · since ${period}` : ''}. These rows
        still count on Cash In and Cash Out — this mirrors them, it doesn&apos;t move them.
      </p>

      <p className="rowlabel">Sales</p>
      <div className="grid">
        <Stat label="Shopee MY" value={rm(salesMY)} />
        <Stat label="Shopee SG" value={rm(salesSG)} />
        {salesOther > 0 ? <Stat label="Shopee (no market)" value={rm(salesOther)} /> : null}
        <Stat label="Total sales" value={rm(totalSales)} />
      </div>

      <p className="rowlabel">Costs &amp; net</p>
      <div className="grid">
        <Stat label="Shopee costs" value={rm(totalCosts)} />
        <Stat label="Net" value={rm(totalSales - totalCosts)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
      </div>

      <p className="rowlabel">Orders &amp; averages</p>
      <div className="grid">
        <Stat label="MY orders" value={byMarket(sales, 'my').length} />
        <Stat label="SG orders" value={byMarket(sales, 'sg').length} />
        <Stat label="MY avg order" value={rm(avg(salesMY, byMarket(sales, 'my').length))} />
        <Stat label="SG avg order" value={rm(avg(salesSG, byMarket(sales, 'sg').length))} />
      </div>

      <ChannelTrend trend={trend} period={period} />

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <Empty label="Shopee rows (nothing has meta.group starting with &quot;Shopee&quot;)" />
      ) : (
        <>
          <Rows label="Shopee MY 🇲🇾" rs={byMarket(rows, 'my')} />
          <Rows label="Shopee SG 🇸🇬" rs={byMarket(rows, 'sg')} />
          <Rows label="Shopee — no market tag" rs={byMarket(rows, 'other')} />
        </>
      )}
    </>
  )
}
