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
  const kitchen = all.filter(r => r.category === 'cash_in' && isKitchen(r))
  // The headline cards and the month-on-month stay WINDOWED, so this tab can
  // never disagree with the Dashboard about what "revenue" means.
  const rows = kitchen.filter(inMoneyWindow)
  // The year-by-year section below deliberately IGNORES the window — a table
  // whose history starts this January has nothing to compare against. Same
  // reasoning as getYearlySales() in lib/records.ts. It is labelled as
  // all-time on the page so the two figures are never read as one.
  const period = moneyFromLabel()

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

  const sales = rows
  const revenue = total(sales)
  const waitingAmt = total(sales.filter(isWaiting))
  const paidAmt = total(sales.filter(r => !isWaiting(r)))
  const jobs = sales.length
  const avg = jobs > 0 ? revenue / jobs : 0

  // Which calendar year a row belongs to — the date the money moved.
  const yearOf = (r: Rec) => String(r.due_date || r.created_at || '').slice(0, 4)

  // Every year the BUSINESS has money in, not just the years Kitchen Service
  // does. A year with no kitchen work then shows an honest RM 0.00 instead of
  // vanishing, which is itself the answer to "did we do kitchen work in 2024?".
  const businessYears = [...new Set(
    all.filter(r => r.category === 'cash_in' || r.category === 'cash_out')
       .map(yearOf).filter(y => /^\d{4}$/.test(y)),
  )]

  // Newest first — 2026, then 2025, then 2024.
  const years = [...new Set([...businessYears, ...kitchen.map(yearOf)])]
    .filter(y => /^\d{4}$/.test(y))
    .sort((a, b) => b.localeCompare(a))
    .map(year => {
      const rs = kitchen.filter(r => yearOf(r) === year)
      return { year, rs, revenue: total(rs), jobs: rs.length }
    })

  // Change against the year BEFORE it (the next one down the list, since the
  // list runs newest first). Null when there is no earlier year, or when the
  // earlier year was zero — there is no percentage change from nothing.
  const withChange = years.map((y, i) => {
    const prev = years[i + 1]
    return {
      ...y,
      changePct: prev && prev.revenue > 0 ? ((y.revenue - prev.revenue) / prev.revenue) * 100 : null,
    }
  })

  const lifetime = total(kitchen)

  // Waiting money first — that's what needs chasing.
  // Waiting money first, then newest — what needs chasing, then what happened.
  const sorted = (rs: Rec[]) =>
    [...rs].sort(
      (a, b) =>
        Number(isWaiting(b)) - Number(isWaiting(a)) ||
        String(b.due_date || '').localeCompare(String(a.due_date || '')),
    )

  const Rows = ({ label, rs }: { label: string; rs: Rec[] }) => (
    <>
      <p className="rowlabel">
        {label} · {rs.length} row{rs.length === 1 ? '' : 's'} · {rm(total(rs))}
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
        Kitchen Service revenue — money in only. The cards below cover
        {period ? ` since ${period}` : ' the reporting period'}, matching the Dashboard; the
        year-by-year section goes back to the beginning. These rows still count on Cash In —
        this mirrors them, it doesn&apos;t move them.
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

      {/* Month on month — the same component the Dashboard and Ecomm Sales use.
          Windowed, like the cards above it. */}
      <ChannelTrend trend={getChannelMonthly(all, KITCHEN)} period={period} />

      {/* Year by year, newest first. ALL-TIME on purpose — see the note where
          `rows` is built. Labelled so it is never read as the windowed figure. */}
      {kitchen.length > 0 ? (
        <section className="ct" aria-labelledby="ky-h">
          <h2 id="ky-h">Year by year — since the beginning</h2>
          <table className="ct-table">
            <caption className="mm-sr">
              Kitchen Service revenue for each year, newest first, with the change on the
              year before
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Revenue</th>
                <th scope="col">Jobs</th>
                <th scope="col">vs year before</th>
              </tr>
            </thead>
            <tbody>
              {withChange.map(y => {
                const up = y.changePct !== null && y.changePct > 0
                const down = y.changePct !== null && y.changePct < 0
                return (
                  <tr key={y.year}>
                    <th scope="row" className="ct-month">{y.year}</th>
                    <td className="ct-total" data-label="Revenue">
                      <span className="mm-val">{rm(y.revenue)}</span>
                      <span className="mm-track" aria-hidden="true">
                        <span
                          className="mm-bar in"
                          style={{
                            width: `${Math.max((y.revenue / Math.max(...withChange.map(x => x.revenue), 1)) * 100, y.revenue > 0 ? 1.5 : 0)}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td className="ct-part" data-label="Jobs">{y.jobs}</td>
                    <td className="ct-delta" data-label="vs year before">
                      {y.changePct === null ? (
                        <span className="ct-none" title="No earlier year to compare against">—</span>
                      ) : (
                        <span className={`ct-pct ${up ? 'up' : down ? 'down' : 'flat'}`}>
                          <span aria-hidden="true">{up ? '▲' : down ? '▼' : '■'}</span>{' '}
                          {y.changePct > 0 ? '+' : ''}
                          {Math.round(y.changePct)}%
                          <span className="mm-sr">
                            {' '}
                            {up ? 'up' : down ? 'down' : 'unchanged'} on the year before
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              <tr>
                <th scope="row" className="ct-month">All time</th>
                <td className="ct-total" data-label="Revenue">
                  <span className="mm-val">{rm(lifetime)}</span>
                </td>
                <td className="ct-part" data-label="Jobs">{kitchen.length}</td>
                <td className="ct-delta" />
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {all.length === 0 ? (
        <Empty />
      ) : kitchen.length === 0 ? (
        <Empty label="Kitchen Service rows (nothing has a Kitchen meta.group)" />
      ) : (
        // One table per year, newest first — 2026, then 2025, then 2024. A year
        // with no kitchen work is skipped here (an empty table says nothing);
        // the year table above already shows it as RM 0.00.
        withChange
          .filter(y => y.rs.length > 0)
          .map(y => <Rows key={y.year} label={y.year} rs={y.rs} />)
      )}
    </>
  )
}
