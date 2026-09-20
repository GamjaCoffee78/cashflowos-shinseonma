// 👉 Offline Channels — the REVENUE that did not come through an online
// marketplace. This is the owner sheet's "OFFLINE CHANNELS (auto from Staff —
// based on invoice)" section: TFP Retail (VG/BIG/BSC), Qra and Others.
//
// Same concept as Kitchen Services and Ecomm Sales: it MIRRORS rows that
// already sit on Cash In / Cash Out. Nothing is moved, nothing is taken away
// from the Dashboard totals.
//
// Which rows belong here is decided by isOffline() in lib/ecomm.ts, in ONE
// place, so this tab can never drift into double-counting a row that Ecomm
// Sales, Sellers or Kitchen Services is already showing.
import { getRecords, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec } from '@/lib/records'
import { isOffline, isWaiting, groupOf, norm } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

// Which offline channel a row belongs to.
//
// The importer files every offline row under ONE generic meta.group ("Offline")
// and puts the sheet's actual line name in the TITLE — "TFP Retail
// (VG/BIG/BSC)", "Qra", "Others". So for a generic bucket the title is what
// names the channel; a row that carries a real, specific group keeps it.
//
// Grouping by the title rather than a hard-coded list of the three names means
// a fourth line added to the sheet's OFFLINE CHANNELS section shows up as its
// own channel on its own, instead of being folded into "Others".
const GENERIC_GROUPS = ['offline', 'offline channels', 'other', 'others', '']

const channelOf = (r: Rec) => {
  const g = groupOf(r)
  if (g && !GENERIC_GROUPS.includes(norm(g))) return g
  return String(r.title ?? '').trim() || g || 'Untitled'
}

export const dynamic = 'force-dynamic'

export default async function OfflineChannels() {
  const all = await getRecords()
  // Same reporting window as the Dashboard and every other money tab.
  const rows = all.filter(r => isOffline(r) && inMoneyWindow(r))
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  // isOffline() is cash_in only — the sheet has no offline cost section, and
  // sweeping the company's expenditure in here would be a lie. So every row on
  // this tab is money IN.
  const sales = rows
  const revenue = total(sales)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))

  // One section per channel, biggest earner first.
  const groups = [...new Set(rows.map(channelOf))]
    .map(name => {
      const rs = rows.filter(r => channelOf(r) === name)
      const gSales = rs.filter(r => r.category === 'cash_in')
      return { name, rs, sales: total(gSales), orders: gSales.length }
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))

  // Money rows carrying no meta.group at all. Deliberately NOT counted as
  // offline (see lib/ecomm.ts) — but counted HERE, so money that belongs to no
  // channel is visible rather than silently missing from every channel tab.
  const untagged = all.filter(r => r.category === 'cash_in' && !groupOf(r) && inMoneyWindow(r))
  const untaggedIn = total(untagged)

  // Every group present in the money rows — shown in the empty state so a
  // mismatch between what's stored and what this tab looks for is visible.
  const knownGroups = [...new Set(all.filter(r => r.category === 'cash_in').map(groupOf).filter(Boolean))].sort()

  // Waiting money first — that's what needs chasing.
  const sorted = (rs: Rec[]) => [...rs].sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)))

  return (
    <>
      <h1 className="ph">Offline Channels 🏪</h1>
      <p className="cap">
        Revenue from everything that isn&apos;t an online marketplace — the owner
        sheet&apos;s OFFLINE CHANNELS section{period ? `, since ${period}` : ''}. Shopee,
        TikTok, sellers and Kitchen Service have their own tabs and are not repeated here.
        These rows still count on Cash In — this mirrors them, it doesn&apos;t move them.
      </p>

      <div className="grid">
        <Stat label="Revenue" value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Channels" value={groups.length} />
      </div>

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
          Not counted above: {untagged.length} money-in row{untagged.length === 1 ? '' : 's'}{' '}
          ({rm(untaggedIn)}) carry no channel tag at all. They still count on Cash In — they
          just belong to no channel, so no channel tab claims them.
        </p>
      ) : null}

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        // Records ARE loading but none matched. The useful thing is WHICH
        // groups exist, so the mismatch is visible instead of guessed at.
        <div className="empty">
          No offline rows matched. A row lands here when it is money IN with a{' '}
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
                  <th>Status</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted(g.rs).map(r => {
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
          </div>
        ))
      )}
    </>
  )
}
