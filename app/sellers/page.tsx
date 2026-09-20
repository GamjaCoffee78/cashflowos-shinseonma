// 👉 Sellers — the MY and SG seller SALES (money in), split out of Ecomm Sales
// so the marketplace settlement numbers aren't mixed with seller money.
//
// Like every money view here it MIRRORS rows from `records`; it moves nothing.
// A row lands here when its `meta.group` contains "seller" (see lib/ecomm.ts) —
// the same rule Ecomm Sales uses to EXCLUDE them, so a row can never show on
// both tabs or fall between them.
//
// YEAR FILTER: like Ecomm, this tab deliberately IGNORES the app-wide money
// window (ABANG.moneyFrom, currently 2026-01-01). That window keeps the
// Dashboard on the current year; here the point is to look back, so the year
// chips decide the period and every year with rows is reachable.
import Link from 'next/link'
import { getRecords, rm, todayISO, type Rec } from '@/lib/records'
import { isMoney, isSeller, isWaiting, groupOf, norm, salesYears } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

// The ?y= value meaning "every year at once". A word, not a number, so it can
// never collide with a real year. Matches the Ecomm tab.
const ALL = 'all'

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

export default async function Sellers({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>
}) {
  const { y } = await searchParams
  const all = await getRecords()
  // Seller SALES only (money in). Seller-side costs are money-out and stay on
  // Cash Out, matching Ecomm. No money window — the year chips are the period.
  const everyYear = all.filter(
    r => r.category === 'cash_in' && isSeller(r) && !!r.due_date,
  )

  // Years come from ALL marketplace money, not just this tab's rows, so Ecomm
  // and Sellers always offer the same chips — see salesYears in lib/ecomm.ts.
  const years = salesYears(all)
  // Default to this year; if it has nothing yet, show the most recent that does.
  const thisYear = todayISO().slice(0, 4)
  // years[0] is undefined when there are no rows at all, which would print
  // "sales in ." — fall back to this year so the caption always reads.
  const year =
    y && years.includes(y) ? y : years.includes(thisYear) ? thisYear : years[0] ?? thisYear

  // "All" is an explicit choice, never the default — the tab still opens on
  // the current year, which is what you want to see most days.
  const showAll = y === ALL
  const rows = showAll
    ? everyYear
    : everyYear.filter(r => (r.due_date as string).slice(0, 4) === year)

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows
  const inMarket = (mk: 'MY' | 'SG' | 'Other') => sales.filter(r => marketOf(r) === mk)

  const salesMY = total(inMarket('MY'))
  const salesSG = total(inMarket('SG'))
  const salesOther = total(inMarket('Other'))
  const totalSales = salesMY + salesSG + salesOther
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
        MY and SG sellers — sales{showAll ? ' across every year' : ` in ${year}`}. Split out of Ecomm so marketplace settlements
        stay clean. These rows still count on Cash In — this mirrors them, it
        doesn&apos;t move them. Seller costs are on Cash Out.
      </p>

      {/* The year chips ARE the period control for this tab. */}
      {years.length > 0 ? (
        <nav className="yearbar" aria-label="Year">
          {/* "All" first: it is the widest view, so it reads as the outer one. */}
          <Link
            href={`/sellers?y=${ALL}`}
            className={`yearchip${showAll ? ' active' : ''}`}
            aria-current={showAll ? 'page' : undefined}
          >
            All
          </Link>
          {years.map(k => (
            <Link
              key={k}
              href={`/sellers?y=${k}`}
              className={`yearchip${!showAll && k === year ? ' active' : ''}`}
              aria-current={!showAll && k === year ? 'page' : undefined}
            >
              {k}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="rowlabel">Sales by market</p>
      <div className="grid">
        <Stat label="MY sellers" value={rm(salesMY)} />
        <Stat label="SG sellers" value={rm(salesSG)} />
        {salesOther > 0 ? <Stat label="Sellers (no market)" value={rm(salesOther)} /> : null}
        <Stat label="Total sales" value={rm(totalSales)} />
      </div>

      <p className="rowlabel">Paid vs waiting</p>
      <div className="grid">
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
      ) : rows.length > 0 ? null : everyYear.length > 0 ? (
        // Seller rows DO exist — this year just has none. Say that, rather
        // than implying the matching rule failed.
        // Only reachable with a year selected: under All, rows IS everyYear,
        // so an empty result means no seller rows at all and falls through to
        // the diagnostic below.
        <div className="empty">No seller sales in {year}.</div>
      ) : (
        // No seller rows at all. Don't just say "empty" — the useful thing is
        // WHICH groups exist, so the mismatch is visible instead of guessed at.
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
      )}

      {rows.length > 0 ? (
        groups.map(g => (
          <div key={g.name}>
            <p className="rowlabel">
              {g.name} · {marketOf(g.rs[0])} · {g.rs.length} row{g.rs.length === 1 ? '' : 's'}
            </p>
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
      ) : null}
    </>
  )
}
