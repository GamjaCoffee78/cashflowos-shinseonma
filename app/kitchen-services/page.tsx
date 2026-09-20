// 👉 Kitchen Services — the Kitchen Service revenue, pulled out of the money
// rows that already sit on Cash In / Cash Out.
//
// It MIRRORS those rows; it does not move them. The same records still count on
// Cash In, Cash Out and the Dashboard totals — nothing is taken away, exactly
// like Ecomm Sales does for the marketplaces.
//
// Which rows belong here is decided by isKitchen() in lib/ecomm.ts — the SAME
// rule Offline Channels uses to EXCLUDE them, so a row can never show on both
// tabs or fall between them.
import {
  getRecords, getChannelMonthly, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec,
} from '@/lib/records'
import { isKitchen, isWaiting, groupOf } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'

// Which rows are Kitchen Service is decided by isKitchen() in lib/ecomm.ts —
// the SAME rule Offline Channels uses to exclude them, so a row can never show
// on both tabs or fall between them. 'Kitchen' is the channel name passed to
// the month-on-month component.
const KITCHEN = 'Kitchen'

export const dynamic = 'force-dynamic'

export default async function KitchenServices() {
  const all = await getRecords()
  // Same reporting window as the Dashboard and the other money tabs, so this
  // tab can never disagree with them about what a period's revenue was.
  // cash_in ONLY. The owner sheet has no per-channel cost line — its
  // expenditure (Product Orders, Packaging, Marketing, Fixed & Operating,
  // Miscellaneous) belongs to the business as a whole, not to Kitchen Service.
  // Mirroring cash_out here would report company-wide costs as kitchen costs.
  const rows = all.filter(r => r.category === 'cash_in' && isKitchen(r) && inMoneyWindow(r))
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows
  const revenue = total(sales)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))
  const jobs = sales.length
  const avg = jobs > 0 ? revenue / jobs : 0

  // One section per distinct meta.group, biggest earner first. A row matched on
  // its title carries no group, so it gets its own honest heading rather than
  // silently borrowing someone else's.
  const label = (r: Rec) => groupOf(r) || 'Kitchen Service (untagged)'
  const groups = [...new Set(rows.map(label))]
    .map(name => {
      const rs = rows.filter(r => label(r) === name)
      const gSales = rs.filter(r => r.category === 'cash_in')
      return { name, rs, sales: total(gSales), jobs: gSales.length }
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))

  // Waiting money first — that's what needs chasing.
  const sorted = (rs: Rec[]) => [...rs].sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)))

  const Rows = ({ label, rs }: { label: string; rs: Rec[] }) => (
    <>
      <p className="rowlabel">{label} · {rs.length} row{rs.length === 1 ? '' : 's'}</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>What</th>
            <th>Status</th>
            <th>Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted(rs).map(r => {
            const shownStatus = isOverdue(r) ? 'overdue' : r.status || '—'
            return (
              <tr key={r.id}>
                <td data-label="What">{r.title}</td>
                <td data-label="Status">
                  <span className={`pill ${shownStatus}`}>{shownStatus}</span>
                </td>
                <td data-label="Date">{r.due_date || r.created_at?.slice(0, 10) || '—'}</td>
                <td data-label="Amount">{rm(r.amount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )

  return (
    <>
      <h1 className="ph">Kitchen Services 🍳</h1>
      <p className="cap">
        Kitchen Service revenue — money in only{period ? ` · since ${period}` : ''}. These
        rows still count on Cash In — this mirrors them, it doesn&apos;t move them.
      </p>

      <div className="grid">
        <Stat label="Revenue" value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Jobs" value={jobs} />
      </div>

      <div className="grid">
        <Stat label="Avg per job" value={rm(avg)} />
      </div>

      {/* Month on month — the same component the Dashboard and Ecomm Sales use. */}
      <ChannelTrend trend={getChannelMonthly(all, KITCHEN)} period={period} />

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <Empty label="Kitchen Service rows (nothing has a Kitchen meta.group)" />
      ) : (
        groups.map(g => <Rows key={g.name} label={g.name} rs={g.rs} />)
      )}
    </>
  )
}
