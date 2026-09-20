// 👉 Ecomm — every marketplace SALE (money in). Route stays /ecomm-sales.
// It MIRRORS the rows; it does not move them. The same records still count on
// Cash In, Cash Out and the Dashboard totals — nothing is taken away.
//
// A row belongs here when its `meta.group` names one of the ECOMM_CHANNELS
// below ("Shopee MY", "Shopee SG", "TikTok Shop" — what the importer stamps
// on). That's the same field the Dashboard's channel section reads, so the two
// can never disagree. Rows are then grouped by their OWN meta.group value, so a
// new marketplace shows up as its own section the moment it's imported — add
// its name to ECOMM_CHANNELS in lib/ecomm.ts and nothing else needs to change.
// Seller rows are NOT here: they have their own tab (app/sellers).
import {
  getRecords, getChannelMonthly, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec,
} from '@/lib/records'
import { ECOMM_CHANNELS, isEcomm, isWaiting, groupOf } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'

export const dynamic = 'force-dynamic'

export default async function EcommSales() {
  const all = await getRecords()
  // Marketplace SALES only — a named channel (lib/ecomm.ts), not a seller
  // (own tab), not ad spend (own category + own tab), and money-IN only:
  // marketplace costs live on Cash Out. Same reporting window as the Dashboard.
  const rows = all.filter(
    r => r.category === 'cash_in' && isEcomm(r) && inMoneyWindow(r),
  )
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)


  // One section per distinct meta.group, biggest seller first. Nothing is
  // hard-coded to Shopee, so TikTok Shop appears on its own the moment it lands.
  const groups = [...new Set(rows.map(groupOf))]
    .map(name => {
      const rs = rows.filter(r => groupOf(r) === name)
      return { name: name || 'Untagged', rs, sales: total(rs), orders: rs.length }
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))

  const totalSales = total(rows)
  const waitingAmt = total(rows.filter(isWaiting))
  const paidAmt = total(rows.filter(r => !isWaiting(r)))

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
      <h1 className="ph">Ecomm 🛒</h1>
      <p className="cap">
        Shopee MY, Shopee SG and TikTok Shop — sales
        {period ? ` · since ${period}` : ''}. These rows still count on Cash In — this
        mirrors them, it doesn&apos;t move them. Marketplace costs are on Cash Out.
      </p>

      <p className="rowlabel">Sales by channel</p>
      <div className="grid">
        {groups.map(g => <Stat key={g.name} label={g.name} value={rm(g.sales)} />)}
        <Stat label="Total sales" value={rm(totalSales)} />
      </div>

      <p className="rowlabel">Paid vs waiting</p>
      <div className="grid">
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
      </div>

      {/* Per-channel counts only make sense once there ARE channels — an empty
          heading over an empty grid is noise, so the whole block waits. */}
      {groups.length > 0 ? (
        <>
          <p className="rowlabel">Orders &amp; averages</p>
          <div className="grid">
            {groups.map(g => <Stat key={g.name} label={`${g.name} orders`} value={g.orders} />)}
            {groups.map(g => (
              <Stat
                key={`${g.name}-avg`}
                label={`${g.name} avg`}
                value={rm(g.orders > 0 ? g.sales / g.orders : 0)}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* Month on month, one section per channel — same component the Dashboard uses. */}
      {ECOMM_CHANNELS.map(c => (
        <ChannelTrend key={c} trend={getChannelMonthly(all, c)} period={period} />
      ))}

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <Empty label="marketplace rows (nothing has a Shopee or TikTok meta.group)" />
      ) : (
        groups.map(g => <Rows key={g.name} label={g.name} rs={g.rs} />)
      )}
    </>
  )
}
