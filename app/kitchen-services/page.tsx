// 👉 Kitchen Services — the Kitchen Service revenue, pulled out of the money
// rows that already sit on Cash In.
//
// It MIRRORS those rows; it does not move them. The same records still count on
// Cash In and the Dashboard totals — nothing is taken away.
//
// Which rows belong here is decided by isKitchen() in lib/ecomm.ts — the SAME
// rule Offline Channels uses to EXCLUDE them, so a row can never show on both
// tabs or fall between them.
//
// The page is split by YEAR with ?year= links (All time · 2026 · 2025 · 2024),
// the same server-rendered switcher Content uses for platforms. No client JS.
// Picking a year is what scopes the figures, so the reporting window
// (ABANG.moneyFrom) is not applied here — "2025" must mean all of 2025. The
// default year is the newest one with work in it, which is the window's period
// and therefore agrees with the Dashboard on load.
import { getRecords, rm, todayISO, type Rec, type ChannelTrend as Trend } from '@/lib/records'
import { isKitchen, isWaiting, groupOf } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'
import YearTabs from '@/app/_components/YearTabs'

export const dynamic = 'force-dynamic'

const KITCHEN = 'Kitchen'

// Which calendar year a row belongs to — the date the money moved.
const yearOf = (r: Rec) => String(r.due_date || r.created_at || '').slice(0, 4)
const isYear = (y: string) => /^\d{4}$/.test(y)

const monthLabel = (key: string) => {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

const total = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

// Month on month for whatever set of rows is in view, shaped for the existing
// ChannelTrend component so this tab and the Dashboard draw trends identically.
// One part only, so it renders a single "Kitchen" column.
function trendOf(rows: Rec[]): Trend | null {
  const per = new Map<string, number>()
  for (const r of rows) {
    const key = (r.due_date || todayISO()).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    per.set(key, (per.get(key) ?? 0) + Number(r.amount || 0))
  }
  if (!per.size) return null
  const keys = [...per.keys()].sort()
  return {
    channel: KITCHEN,
    parts: [KITCHEN],
    months: keys.map((key, i) => {
      const amount = per.get(key)!
      const prev = i > 0 ? per.get(keys[i - 1])! : null
      return {
        key,
        label: monthLabel(key),
        parts: [amount],
        total: amount,
        // No percentage against a missing or zero month — +∞% is not an answer.
        changePct: prev && prev > 0 ? ((amount - prev) / prev) * 100 : null,
      }
    }),
  }
}

export default async function KitchenServices({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const sp = await searchParams
  const all = await getRecords()

  // cash_in ONLY. The owner sheet has no per-channel cost line — its
  // expenditure belongs to the business as a whole, not to Kitchen Service.
  const kitchen = all.filter(r => r.category === 'cash_in' && isKitchen(r))

  // Every year the BUSINESS has money in, not just the years Kitchen Service
  // does — so a year with no kitchen work still gets a tab reading 0, which is
  // itself the answer to "did we do kitchen work in 2024?".
  const years = [...new Set([
    ...all.filter(r => r.category === 'cash_in' || r.category === 'cash_out').map(yearOf),
    ...kitchen.map(yearOf),
  ])].filter(isYear).sort((a, b) => b.localeCompare(a))

  // Default to the newest year that actually has kitchen work, not merely the
  // newest year — landing on an empty tab would look like a broken page.
  const newestWithWork = years.find(y => kitchen.some(r => yearOf(r) === y))
  const asked = String(sp.year ?? '').trim()
  // An unknown ?year= falls back rather than 404s; a bookmarked link outliving
  // its year should still show something honest.
  const active = asked === 'all' ? 'all' : years.includes(asked) ? asked : (newestWithWork ?? 'all')

  const counts: Record<string, number> = { all: kitchen.length }
  for (const y of years) counts[y] = kitchen.filter(r => yearOf(r) === y).length

  const rows = active === 'all' ? kitchen : kitchen.filter(r => yearOf(r) === active)
  const scope = active === 'all' ? 'all time' : active

  const revenue = total(rows)
  const waitingAmt = total(rows.filter(isWaiting))
  const paidAmt = total(rows.filter(r => !isWaiting(r)))
  const jobs = rows.length
  const avg = jobs > 0 ? revenue / jobs : 0

  // Year-by-year, newest first — the cross-year comparison, so it belongs on
  // the All time view rather than being repeated inside every year.
  const byYear = years.map(year => {
    const rs = kitchen.filter(r => yearOf(r) === year)
    return { year, rs, revenue: total(rs), jobs: rs.length }
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
            <th>Section</th>
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
                <td data-label="Section">{groupOf(r) || '—'}</td>
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
        Kitchen Service revenue — money in only. Pick a year to scope everything below it.
        These rows still count on Cash In — this mirrors them, it doesn&apos;t move them.
      </p>

      <YearTabs years={years} active={active} counts={counts} base="/kitchen-services" />

      <div className="grid">
        <Stat label={`Revenue · ${scope}`} value={rm(revenue)} />
        <Stat label="Paid" value={rm(paidAmt)} />
        <Stat label="Waiting" value={rm(waitingAmt)} yes={waitingAmt > 0} />
        <Stat label="Jobs" value={jobs} />
        <Stat label="Avg per job" value={rm(avg)} />
      </div>

      {/* Month on month for whatever is in view — the whole history on All
          time, that year's months on a year. */}
      <ChannelTrend trend={trendOf(rows)} period={active === 'all' ? null : active} />

      {/* The cross-year comparison lives on All time only; inside a single year
          it would just repeat the tabs above. */}
      {active === 'all' && kitchen.length > 0 ? (
        <section className="ct" aria-labelledby="ky-h">
          <h2 id="ky-h">Year by year</h2>
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
                          style={{ width: `${Math.max((y.revenue / peakYear) * 100, y.revenue > 0 ? 1.5 : 0)}%` }}
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
            </tbody>
          </table>
        </section>
      ) : null}

      {/* The rows behind the numbers. NOT on All time: each year tab already
          carries its own, and repeating them all here would just be a longer
          list of the same rows. All time is the summary view. */}
      {all.length === 0 ? (
        <Empty />
      ) : kitchen.length === 0 ? (
        <Empty label="Kitchen Service rows (nothing has a Kitchen meta.group)" />
      ) : active === 'all' ? null : rows.length === 0 ? (
        <div className="empty">
          No Kitchen Service revenue in {active}. The year tabs above show which years have
          work in them.
        </div>
      ) : (
        <Rows label={active} rs={rows} />
      )}
    </>
  )
}
