// 👉 Kitchen Services — the Kitchen Service revenue, pulled out of the money
// rows that already sit on Cash In / Cash Out.
//
// It MIRRORS those rows; it does not move them. The same records still count on
// Cash In, Cash Out and the Dashboard totals — nothing is taken away, exactly
// like Ecomm Sales does for the marketplaces.
//
// A row belongs here when its `meta.group` starts with "Kitchen" (what the
// owner-sheet importer stamps on), or — for a hand-entered row that carries no
// group at all — when its title starts with "Kitchen Service". The title
// fallback is deliberately narrow so a one-off "Kitchen equipment" purchase
// never wanders onto this tab.
import {
  getRecords, getChannelMonthly, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec,
} from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'

// Matched case-insensitively against the START of meta.group, so "Kitchen
// Service", "Kitchen Services" and "Kitchen Service — Outlet 2" all land here
// and keep their own names as section headings.
const KITCHEN = 'Kitchen'

// Same "not in the bank yet" statuses Cash In uses, so the tabs agree.
const WAITING = ['waiting', 'unpaid', 'overdue', 'pending']

// This tab reports MONEY. Anything else is somebody else's category.
const MONEY = new Set(['cash_in', 'cash_out'])

const groupOf = (r: Rec) => String(r.meta?.group ?? '').trim()
// Underscores and hyphens are word characters, so 'kitchen_service' would not
// match a plain word test — flatten them before comparing.
const norm = (s: string) => s.toLowerCase().replace(/[_\-/|]+/g, ' ').trim()
const isKitchen = (r: Rec) => {
  const g = groupOf(r)
  if (g) return norm(g).startsWith(norm(KITCHEN))
  return norm(String(r.title ?? '')).startsWith('kitchen service')
}

export const dynamic = 'force-dynamic'

export default async function KitchenServices() {
  const all = await getRecords()
  // Same reporting window as the Dashboard and the other money tabs, so this
  // tab can never disagree with them about what a period's revenue was.
  const rows = all.filter(
    r => MONEY.has(r.category ?? '') && isKitchen(r) && inMoneyWindow(r),
  )
  const period = moneyFromLabel()

  const isWaiting = (r: Rec) => WAITING.includes((r.status || '').toLowerCase())
  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows.filter(r => r.category === 'cash_in')
  const costs = rows.filter(r => r.category === 'cash_out')

  const revenue = total(sales)
  const spend = total(costs)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))
  const jobs = sales.length
  const avg = jobs > 0 ? revenue / jobs : 0

  // One section per distinct meta.group, biggest earner first. Untagged rows
  // that got here on the title fallback are collected under their own heading
  // rather than silently borrowing someone else's.
  const groups = [...new Set(rows.map(r => groupOf(r) || 'Kitchen Service (untagged)'))]
    .map(name => {
      const rs = rows.filter(r => (groupOf(r) || 'Kitchen Service (untagged)') === name)
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

  return (
    <>
      <h1 className="ph">Kitchen Services 🍳</h1>
      <p className="cap">
        Kitchen Service revenue, pulled out of the money rows
        {period ? ` · since ${period}` : ''}. These rows still count on Cash In and Cash Out —
        this mirrors them, it doesn&apos;t move them.
      </p>

      <div className="grid">
        <Stat label="Revenue" value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Jobs" value={jobs} />
      </div>

      {/* Costs and net only mean something once there ARE kitchen costs — an
          RM 0.00 costs card next to the revenue reads as a missing number. */}
      {costs.length > 0 ? (
        <>
          <p className="rowlabel">Costs &amp; net</p>
          <div className="grid">
            <Stat label="Costs" value={rm(spend)} />
            <Stat label="Net" value={rm(revenue - spend)} />
            <Stat label="Avg per job" value={rm(avg)} />
          </div>
        </>
      ) : (
        <div className="grid">
          <Stat label="Avg per job" value={rm(avg)} />
        </div>
      )}

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
