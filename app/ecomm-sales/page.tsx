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
//
// YEAR FILTER: this tab deliberately IGNORES the app-wide money window
// (ABANG.moneyFrom, currently 2026-01-01). That window exists so the Dashboard
// reports the current year, but here the whole point is to look back — so the
// year chips decide the period instead, and every year with rows is reachable.
import Link from 'next/link'
import { getRecords, rm, todayISO, type Rec, type ChannelTrend as Trend } from '@/lib/records'
import { ECOMM_CHANNELS, isEcomm, isWaiting, groupOf } from '@/lib/ecomm'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import ChannelTrend from '@/app/_components/ChannelTrend'

export const dynamic = 'force-dynamic'

// "2026-03" → "Mar 2026". en-US, not en-GB: en-GB abbreviates September as
// "Sept", the only four-letter month, which reads as a typo beside the others.
function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

// Month on month for one channel, within the chosen year. This is deliberately
// NOT lib/records' getChannelMonthly: that one applies the app-wide money
// window, so it returns nothing for 2024 or 2025.
function trendFor(rows: Rec[], prefix: string): Trend | null {
  const needle = prefix.trim().toLowerCase()
  const perMonth = new Map<string, Map<string, number>>()
  const partNames = new Set<string>()

  for (const r of rows) {
    const group = groupOf(r)
    if (!group.toLowerCase().startsWith(needle)) continue
    const amount = Number(r.amount || 0)
    if (!(amount > 0)) continue
    const key = (r.due_date ?? '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    partNames.add(group)
    const m = perMonth.get(key) ?? new Map<string, number>()
    m.set(group, (m.get(group) ?? 0) + amount)
    perMonth.set(key, m)
  }
  if (!perMonth.size) return null

  const parts = [...partNames].sort()
  const keys = [...perMonth.keys()].sort()
  const months = keys.map((key, i) => {
    const m = perMonth.get(key)!
    const amounts = parts.map(p => m.get(p) ?? 0)
    const total = amounts.reduce((a, b) => a + b, 0)
    let changePct: number | null = null
    if (i > 0) {
      const prev = [...(perMonth.get(keys[i - 1]) ?? new Map()).values()].reduce((a, b) => a + b, 0)
      // No percentage against a zero month — "up from nothing" is not a number.
      if (prev > 0) changePct = ((total - prev) / prev) * 100
    }
    return { key, label: monthLabel(key), parts: amounts, total, changePct }
  })
  return { channel: prefix, parts, months }
}

export default async function EcommSales({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>
}) {
  const { y } = await searchParams
  const all = await getRecords()
  // Marketplace SALES only — a named channel (lib/ecomm.ts), not a seller
  // (own tab), not ad spend (own category + own tab), and money-IN only:
  // marketplace costs live on Cash Out. No money window here — see the note at
  // the top of the file; the year chips are the period.
  const everyYear = all.filter(r => r.category === 'cash_in' && isEcomm(r) && !!r.due_date)

  // Only years that actually have rows, newest first — so next January adds
  // itself and an empty year is never offered.
  const years = [...new Set(everyYear.map(r => (r.due_date as string).slice(0, 4)))]
    .sort()
    .reverse()
  // Default to this year; if it has nothing yet, show the most recent that does.
  const thisYear = todayISO().slice(0, 4)
  const year = y && years.includes(y) ? y : years.includes(thisYear) ? thisYear : years[0]

  const rows = everyYear.filter(r => (r.due_date as string).slice(0, 4) === year)

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
        Shopee MY, Shopee SG and TikTok Shop — sales in {year}. These rows still count on
        Cash In — this mirrors them, it doesn&apos;t move them. Marketplace costs are on
        Cash Out.
      </p>

      {/* The year chips ARE the period control for this tab. */}
      {years.length > 1 ? (
        <nav className="yearbar" aria-label="Year">
          {years.map(k => (
            <Link
              key={k}
              href={`/ecomm-sales?y=${k}`}
              className={`yearchip${k === year ? ' active' : ''}`}
              aria-current={k === year ? 'page' : undefined}
            >
              {k}
            </Link>
          ))}
        </nav>
      ) : null}

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

      {/* Month on month within the chosen year, one section per channel. */}
      {ECOMM_CHANNELS.map(c => (
        <ChannelTrend key={c} trend={trendFor(rows, c)} period={year} />
      ))}

      {all.length === 0 ? (
        <Empty />
      ) : everyYear.length === 0 ? (
        <Empty label="marketplace rows (nothing has a Shopee or TikTok meta.group)" />
      ) : rows.length === 0 ? (
        <Empty label={`marketplace sales in ${year}`} />
      ) : (
        groups.map(g => <Rows key={g.name} label={g.name} rs={g.rs} />)
      )}
    </>
  )
}
