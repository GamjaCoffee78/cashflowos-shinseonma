// 👉 Offline Channels — the REVENUE that did not come through an online
// marketplace. This is the owner sheet's "OFFLINE CHANNELS (auto from Staff —
// based on invoice)" section: TFP Retail (VG/BIG/BSC), Qra and Others.
//
// Same concept as Kitchen Services: it MIRRORS rows that already sit on Cash
// In. Nothing is moved, nothing is taken away from the Dashboard totals.
//
// Which rows belong here is decided by isOffline() in lib/ecomm.ts, in ONE
// place, so this tab can never drift into double-counting a row that Ecomm
// Sales, Sellers or Kitchen Services is already showing.
//
// The page is split by YEAR with ?year= links, the same server-rendered
// switcher Kitchen Services and Content use. Picking a year is what scopes the
// figures, so the reporting window (ABANG.moneyFrom) is not applied — "2025"
// has to mean all of 2025. The default is the newest year with sales in it,
// which is the window's own period, so the page agrees with the Dashboard on
// load.
import { getRecords, rm, todayISO, type Rec } from '@/lib/records'
import { isOffline, isWaiting, groupOf, norm } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import YearTabs from '@/app/_components/YearTabs'

export const dynamic = 'force-dynamic'

// Which offline channel a row belongs to.
//
// The importer files every offline row under ONE generic meta.group ("Offline")
// and puts the sheet's actual line name in the TITLE — "TFP Retail
// (VG/BIG/BSC)", "Qra", "Offline — Others". So for a generic bucket the title
// names the channel; a row carrying a real, specific group keeps it.
//
// Grouping by title rather than a hard-coded list means a fourth line added to
// the sheet's OFFLINE CHANNELS section shows up as its own channel, instead of
// being folded into "Others".
const GENERIC_GROUPS = ['offline', 'offline channels', 'other', 'others', '']

const channelOf = (r: Rec) => {
  const g = groupOf(r)
  if (g && !GENERIC_GROUPS.includes(norm(g))) return g
  return String(r.title ?? '').trim() || g || 'Untitled'
}

const yearOf = (r: Rec) => String(r.due_date || r.created_at || '').slice(0, 4)
const isYear = (y: string) => /^\d{4}$/.test(y)
const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

export default async function OfflineChannels({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const sp = await searchParams
  const all = await getRecords()

  const offline = all.filter(isOffline)

  // Every year the BUSINESS has money in, not just the years offline sells —
  // so a year with no offline sales still gets a tab reading 0, which is itself
  // the answer rather than a gap.
  const years = [...new Set([
    ...all.filter(r => r.category === 'cash_in' || r.category === 'cash_out').map(yearOf),
    ...offline.map(yearOf),
  ])].filter(isYear).sort((a, b) => b.localeCompare(a))

  // Default to the newest year with actual sales, so nobody lands on an empty
  // tab the moment a new year turns over.
  const newestWithSales = years.find(y => offline.some(r => yearOf(r) === y))
  const asked = String(sp.year ?? '').trim()
  // An unknown ?year= falls back rather than erroring — a bookmarked link
  // outliving its year should still show something honest.
  const active = asked === 'all' ? 'all' : years.includes(asked) ? asked : (newestWithSales ?? 'all')

  const counts: Record<string, number> = { all: offline.length }
  for (const y of years) counts[y] = offline.filter(r => yearOf(r) === y).length

  const rows = active === 'all' ? offline : offline.filter(r => yearOf(r) === active)
  const scope = active === 'all' ? 'all time' : active

  const revenue = total(rows)
  const waitingAmt = total(rows.filter(isWaiting))
  const paidAmt = total(rows.filter(r => !isWaiting(r)))

  // One row per channel, biggest first. Revenue, orders, average and share all
  // live in ONE table — they used to be three separate rows of stat cards,
  // which read as clutter rather than as a breakdown.
  const channels = [...new Set(rows.map(channelOf))]
    .map(name => {
      const rs = rows.filter(r => channelOf(r) === name)
      const amount = total(rs)
      return {
        name,
        amount,
        orders: rs.length,
        avg: rs.length > 0 ? amount / rs.length : 0,
        share: revenue > 0 ? (amount / revenue) * 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))

  // Year by year — the cross-year comparison, so it belongs on All time only.
  const byYear = years.map(year => {
    const rs = offline.filter(r => yearOf(r) === year)
    return { year, revenue: total(rs), orders: rs.length }
  })
  const withChange = byYear.map((y, i) => {
    const prev = byYear[i + 1] // the list runs newest first, so this is the year before
    return {
      ...y,
      changePct: prev && prev.revenue > 0 ? ((y.revenue - prev.revenue) / prev.revenue) * 100 : null,
    }
  })
  const peakYear = Math.max(...byYear.map(y => y.revenue), 1)

  const isOverdue = (r: Rec) => isWaiting(r) && !!r.due_date && r.due_date < todayISO()
  // Waiting money first, then newest — what needs chasing, then what happened.
  const ledger = [...rows].sort(
    (a, b) =>
      Number(isWaiting(b)) - Number(isWaiting(a)) ||
      String(b.due_date || '').localeCompare(String(a.due_date || '')),
  )

  // Money rows carrying no channel tag at all. Deliberately not counted as
  // offline (see lib/ecomm.ts) — but reported, so money belonging to no channel
  // is visible rather than silently missing from every channel tab.
  const untagged = all.filter(r => r.category === 'cash_in' && !groupOf(r))
  const knownGroups = [...new Set(all.filter(r => r.category === 'cash_in').map(groupOf).filter(Boolean))].sort()

  const Bar = ({ pct }: { pct: number }) => (
    <span className="mm-track" aria-hidden="true">
      <span className="mm-bar in" style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%` }} />
    </span>
  )

  return (
    <>
      <h1 className="ph">Offline Channels 🏪</h1>
      <p className="cap">
        Revenue from everything that isn&apos;t an online marketplace — the owner sheet&apos;s
        OFFLINE CHANNELS section. Pick a year to scope everything below it. Shopee, TikTok,
        sellers and Kitchen Service have their own tabs and are not repeated here. These rows
        still count on Cash In — this mirrors them, it doesn&apos;t move them.
      </p>

      <YearTabs years={years} active={active} counts={counts} base="/offline-channels" />

      <div className="grid">
        <Stat label={`Revenue · ${scope}`} value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Channels" value={channels.length} />
      </div>

      {/* Breakdown by channel — revenue, orders, average and share in one
          table, for whichever year is selected. */}
      {channels.length > 0 ? (
        <section className="ct" aria-labelledby="oc-h">
          <h2 id="oc-h">By channel · {scope}</h2>
          <table className="ct-table">
            <caption className="mm-sr">
              Offline revenue by channel, largest first, with orders, average order and share
              of the period
            </caption>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Revenue</th>
                <th scope="col">Orders</th>
                <th scope="col">Avg</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(c => (
                <tr key={c.name}>
                  <th scope="row" className="ct-month">{c.name}</th>
                  <td className="ct-total" data-label="Revenue">
                    <span className="mm-val">{rm(c.amount)}</span>
                    <Bar pct={c.share} />
                  </td>
                  <td className="ct-part" data-label="Orders">{c.orders}</td>
                  <td className="ct-part" data-label="Avg">{rm(c.avg)}</td>
                  <td className="ct-delta" data-label="Share">
                    <span className="ct-pct flat">{Math.round(c.share)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Cross-year comparison, on All time only — inside a single year it
          would just repeat the tabs above. */}
      {active === 'all' && offline.length > 0 ? (
        <section className="ct" aria-labelledby="oy-h">
          <h2 id="oy-h">Year by year</h2>
          <table className="ct-table">
            <caption className="mm-sr">
              Offline revenue for each year, newest first, with the change on the year before
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Revenue</th>
                <th scope="col">Orders</th>
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
                      <Bar pct={(y.revenue / peakYear) * 100} />
                    </td>
                    <td className="ct-part" data-label="Orders">{y.orders}</td>
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
            </tbody>
          </table>
        </section>
      ) : null}

      {untagged.length > 0 ? (
        <p className="cap">
          Not counted above: {untagged.length} money-in row{untagged.length === 1 ? '' : 's'}{' '}
          ({rm(total(untagged))}) carry no channel tag at all. They still count on Cash In —
          they just belong to no channel, so no channel tab claims them.
        </p>
      ) : null}

      {/* The ledger — every row behind the numbers above, one table.
          NOT on All time: each year tab already carries its own ledger, and
          repeating all of them here would just be a longer list of the same
          rows. All time is the summary view. */}
      {all.length === 0 ? (
        <Empty />
      ) : offline.length === 0 ? (
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
      ) : active === 'all' ? null : rows.length === 0 ? (
        <div className="empty">
          No offline revenue in {active}. The year tabs above show which years have sales in
          them.
        </div>
      ) : (
        <>
          <p className="rowlabel">
            Ledger · {scope} · {ledger.length} row{ledger.length === 1 ? '' : 's'} · {rm(revenue)}
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>What</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(r => {
                const shownStatus = isOverdue(r) ? 'overdue' : r.status || '—'
                return (
                  <tr key={r.id}>
                    <td data-label="What">{r.title}</td>
                    <td data-label="Channel">{channelOf(r)}</td>
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
      )}
    </>
  )
}
