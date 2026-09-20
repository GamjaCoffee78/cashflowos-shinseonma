// 👉 Offline Channels — the money that did NOT come through an online
// marketplace: walk-in, retail, events, wholesale, dealers, and anything else
// the sheet names as its own channel.
//
// Same concept as Kitchen Services and Ecomm Sales: it MIRRORS rows that
// already sit on Cash In / Cash Out. Nothing is moved, nothing is taken away
// from the Dashboard totals.
//
// Which rows belong here is decided by isOffline() in lib/ecomm.ts, in ONE
// place, so this tab can never drift into double-counting a row that Ecomm
// Sales, Sellers or Kitchen Services is already showing.
import { getRecords, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec } from '@/lib/records'
import { isMoney, isOffline, isWaiting, groupOf } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

export default async function OfflineChannels() {
  const all = await getRecords()
  // Same reporting window as the Dashboard and every other money tab.
  const rows = all.filter(r => isMoney(r) && isOffline(r) && inMoneyWindow(r))
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows.filter(r => r.category === 'cash_in')
  const costs = rows.filter(r => r.category === 'cash_out')

  const revenue = total(sales)
  const spend = total(costs)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))

  // One section per channel, biggest earner first.
  const groups = [...new Set(rows.map(groupOf))]
    .map(name => {
      const rs = rows.filter(r => groupOf(r) === name)
      const gSales = rs.filter(r => r.category === 'cash_in')
      return { name, rs, sales: total(gSales), orders: gSales.length }
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))

  // Money rows carrying no meta.group at all. Deliberately NOT counted as
  // offline (see lib/ecomm.ts) — but counted HERE, so money that belongs to no
  // channel is visible rather than silently missing from every channel tab.
  const untagged = all.filter(r => isMoney(r) && !groupOf(r) && inMoneyWindow(r))
  const untaggedIn = total(untagged.filter(r => r.category === 'cash_in'))

  // Every group present in the money rows — shown in the empty state so a
  // mismatch between what's stored and what this tab looks for is visible.
  const knownGroups = [...new Set(all.filter(isMoney).map(groupOf).filter(Boolean))].sort()

  // Waiting money first — that's what needs chasing.
  const sorted = (rs: Rec[]) => [...rs].sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)))

  return (
    <>
      <h1 className="ph">Offline Channels 🏪</h1>
      <p className="cap">
        Money in and out from everything that isn&apos;t an online marketplace
        {period ? ` · since ${period}` : ''}. Shopee, TikTok, sellers and Kitchen Service have
        their own tabs and are not repeated here. These rows still count on Cash In and Cash
        Out — this mirrors them, it doesn&apos;t move them.
      </p>

      <div className="grid">
        <Stat label="Revenue" value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Channels" value={groups.length} />
      </div>

      {/* Costs and net only mean something once there ARE offline costs — an
          RM 0.00 card next to the revenue reads as a missing number. */}
      {costs.length > 0 ? (
        <>
          <p className="rowlabel">Costs &amp; net</p>
          <div className="grid">
            <Stat label="Costs" value={rm(spend)} />
            <Stat label="Net" value={rm(revenue - spend)} />
          </div>
        </>
      ) : null}

      {groups.length > 0 ? (
        <>
          <p className="rowlabel">Sales by channel</p>
          <div className="grid">
            {groups.map(g => <Stat key={g.name} label={g.name} value={rm(g.sales)} />)}
          </div>

          <p className="rowlabel">Orders &amp; averages</p>
          <div className="grid">
            {groups.map(g => <Stat key={`${g.name}-n`} label={`${g.name} orders`} value={g.orders} />)}
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

      {/* Money with no channel on it. Never folded into the totals above — but
          never hidden either, because it is real money sitting on Cash In. */}
      {untagged.length > 0 ? (
        <p className="cap">
          Not counted above: {untagged.length} money row{untagged.length === 1 ? '' : 's'} carry
          no channel tag at all ({rm(untaggedIn)} of it money in). They still count on Cash In
          and Cash Out — they just belong to no channel, so no channel tab claims them.
        </p>
      ) : null}

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        // Records ARE loading but none matched. The useful thing is WHICH
        // groups exist, so the mismatch is visible instead of guessed at.
        <div className="empty">
          No offline rows matched. A row lands here when it has a{' '}
          <code>meta.group</code> that isn&apos;t Shopee, TikTok, a seller, or Kitchen Service.
          <br />
          <br />
          The {knownGroups.length} group{knownGroups.length === 1 ? '' : 's'} actually in your
          money rows:
          <br />
          {knownGroups.length ? knownGroups.map(g => <code key={g}> {g} </code>) : '(none have a meta.group)'}
        </div>
      ) : (
        groups.map(g => (
          <div key={g.name}>
            <p className="rowlabel">{g.name} · {g.rs.length} row{g.rs.length === 1 ? '' : 's'}</p>
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
                {sorted(g.rs).map(r => {
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
          </div>
        ))
      )}
    </>
  )
}
