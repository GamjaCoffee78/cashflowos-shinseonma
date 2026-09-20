// 👉 Sellers — the MY and SG seller rows, split out of Ecomm Sales so the
// marketplace settlement numbers aren't mixed with seller money.
//
// Like every money view here it MIRRORS rows from `records`; it moves nothing.
// A row lands here when its `meta.group` contains "seller" (see lib/ecomm.ts) —
// the same rule Ecomm Sales uses to EXCLUDE them, so a row can never show on
// both tabs or fall between them.
import { getRecords, inMoneyWindow, moneyFromLabel, rm, todayISO, type Rec } from '@/lib/records'
import { isMoney, isSeller, isWaiting, groupOf, norm } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

// Which market a seller belongs to. Hyphens/underscores are flattened first so
// 'shopee_sg_seller' is read as SG, not missed.
const marketOf = (r: Rec): 'MY' | 'SG' | 'Other' => {
  // The market can be in either field: meta.group is "Shopee SG" while the
  // title is "SG Sellers (MYR)". Read both so neither spelling is missed.
  const g = norm(`${groupOf(r)} ${r.title ?? ''}`)
  if (/\b(sg|singapore)\b/.test(g)) return 'SG'
  if (/\b(my|malaysia|mys)\b/.test(g)) return 'MY'
  return 'Other' // shown in its own section, never silently folded into MY
}

export default async function Sellers() {
  const all = await getRecords()
  const rows = all.filter(r => isMoney(r) && isSeller(r) && inMoneyWindow(r))
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows.filter(r => r.category === 'cash_in')
  const costs = rows.filter(r => r.category === 'cash_out')
  const inMarket = (mk: 'MY' | 'SG' | 'Other') => sales.filter(r => marketOf(r) === mk)

  const salesMY = total(inMarket('MY'))
  const salesSG = total(inMarket('SG'))
  const salesOther = total(inMarket('Other'))
  const totalSales = salesMY + salesSG + salesOther
  const totalCosts = total(costs)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))

  // One section per distinct seller LINE (the row title, e.g. "MY Sellers"),
  // biggest first — grouping by meta.group would just label them all "Shopee
  // MY"/"Shopee SG", which is the marketplace they were filed under, not the
  // seller they are.
  const sellerName = (r: Rec) => String(r.title ?? '').trim() || groupOf(r)
  const groups = [...new Set(rows.map(sellerName))]
    .map(name => {
      const rs = rows.filter(r => sellerName(r) === name)
      const gSales = rs.filter(r => r.category === 'cash_in')
      return { name: name || 'Untagged', rs, sales: total(gSales), orders: gSales.length }
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))

  // Every group present in the money rows — shown in the empty state so a
  // mismatch between what's stored and what this tab looks for is visible.
  const knownGroups = [...new Set(all.filter(isMoney).map(groupOf).filter(Boolean))].sort()

  // Waiting money first — that's what needs chasing.
  const sorted = (rs: Rec[]) => [...rs].sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)))

  return (
    <>
      <h1 className="ph">Sellers 🧑‍💼</h1>
      <p className="cap">
        MY and SG sellers — money in and out{period ? ` · since ${period}` : ''}. Split out of
        Ecomm Sales so marketplace settlements stay clean. These rows still count on Cash In
        and Cash Out — this mirrors them, it doesn&apos;t move them.
      </p>

      <p className="rowlabel">Sales by market</p>
      <div className="grid">
        <Stat label="MY sellers" value={rm(salesMY)} />
        <Stat label="SG sellers" value={rm(salesSG)} />
        {salesOther > 0 ? <Stat label="Sellers (no market)" value={rm(salesOther)} /> : null}
        <Stat label="Total sales" value={rm(totalSales)} />
      </div>

      <p className="rowlabel">Costs &amp; net</p>
      <div className="grid">
        <Stat label="Costs" value={rm(totalCosts)} />
        <Stat label="Net" value={rm(totalSales - totalCosts)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
      </div>

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

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        // Records ARE loading but none matched. Don't just say "empty" — the
        // useful thing is WHICH groups exist, so the mismatch is visible
        // instead of guessed at.
        <div className="empty">
          No seller rows matched. A row lands here when its <code>meta.group</code> contains
          the word &quot;seller&quot;.
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
            <p className="rowlabel">
              {g.name} · {marketOf(g.rs[0])} · {g.rs.length} row{g.rs.length === 1 ? '' : 's'}
            </p>
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
