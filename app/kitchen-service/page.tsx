// 👉 This is your Kitchen Service tab — one of Okmaya's four revenue streams
// (online/ecommerce, sellers, offline retail, and kitchen services: the sauces
// and pastes supplied in kitchen packs).
//
// It does NOT introduce a new category. Kitchen Service money is ALREADY in the
// `records` table as ordinary `cash_in` rows, stamped by the importer with
// `meta.group = 'Kitchen Service'` — the same field the Dashboard's "Biggest
// source" column reads. So this tab is a filtered VIEW of money that already
// counts, not a second copy of it. Giving it its own category would either leave
// the tab empty or double-count the stream in the Dashboard totals.
//
// Windowed through inMoneyWindow() like every other money surface, so the figure
// here agrees with the Dashboard and the 08:15 brief (see CLAUDE.md §0a).
import { getRecords, rm, m, inMoneyWindow, moneyFromLabel, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

// Which channel counts as Kitchen Service. Matched case-insensitively on a
// substring so 'Kitchen Service', 'Kitchen Services' and 'Kitchen Packs' all
// land here — the importer's exact wording can change without breaking the tab.
const KITCHEN = /kitchen/i

// The channel an importer stamped on a row. Hand-entered rows have no group, so
// they fall back to their own title — the same rule getMonthlyMoney() uses, kept
// identical on purpose so the two surfaces never disagree about a row's channel.
const channelOf = (r: Rec) => String(r.meta?.group || r.title || '').trim() || 'Other'

const WAITING = ['waiting', 'unpaid', 'overdue', 'pending']
const monthKey = (r: Rec) => (r.due_date || '').slice(0, 7)

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

export default async function KitchenService() {
  const all = await getRecords()
  const sales = all.filter(r => r.category === 'cash_in' && inMoneyWindow(r))
  const rows = sales.filter(r => KITCHEN.test(channelOf(r)))

  const period = moneyFromLabel()
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const allSales = sales.reduce((s, r) => s + Number(r.amount || 0), 0)
  const share = allSales > 0 ? total / allSales : 0

  const waiting = rows
    .filter(r => WAITING.includes((r.status || '').toLowerCase()))
    .reduce((s, r) => s + Number(r.amount || 0), 0)

  // Month by month, so a growing (or stalling) stream is visible rather than
  // hidden inside one lifetime total.
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    const key = monthKey(r)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.amount || 0))
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const peak = Math.max(...months.map(([, v]) => v), 1)
  const best = months.length ? [...months].sort((a, b) => b[1] - a[1])[0] : null

  // Every channel present in the window — shown only when nothing matched, so a
  // wording mismatch in the importer explains itself instead of rendering a bare
  // "nothing here yet" that looks like missing data.
  const channels = [...new Set(sales.map(channelOf))].sort()

  return (
    <>
      <h1 className="ph">Kitchen Service 🍳</h1>
      <p className="cap">
        Sauces and pastes supplied in kitchen packs — one of Okmaya&apos;s four revenue
        streams{period ? `, since ${period}` : ''}.
      </p>

      <div className="grid">
        <Stat label="Kitchen Service revenue" value={rm(total)} />
        <Stat label="Share of all sales" value={`${Math.round(share * 100)}%`} />
        <Stat label="Best month" value={best ? `${monthLabel(best[0])} · ${rm(best[1])}` : '—'} />
        {waiting > 0 ? <Stat label="Still waiting" value={rm(waiting)} yes /> : null}
      </div>

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <div className="empty">
          No Kitchen Service rows found in this period.
          {channels.length ? (
            <>
              <br />
              The sales channels currently in the data are:{' '}
              <strong>{channels.join(', ')}</strong>.
              <br />
              If one of those is your kitchen-pack business under another name, say the word
              and this tab will match it.
            </>
          ) : null}
        </div>
      ) : (
        <>
          {months.length > 1 ? (
            <section className="mm" aria-labelledby="ks-h">
              <h2 id="ks-h">Kitchen Service by month{period ? ` — since ${period}` : ''}</h2>
              <table className="mm-table">
                <caption className="mm-sr">Kitchen Service revenue by month</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(([key, value]) => (
                    <tr key={key}>
                      <th scope="row" className="mm-month">{monthLabel(key)}</th>
                      <td className="mm-cell" data-label="Revenue">
                        <span className="mm-val">{rm(value)}</span>
                        <span className="mm-track" aria-hidden="true">
                          <span
                            className="mm-bar in"
                            style={{ width: `${Math.max((value / peak) * 100, value > 0 ? 1.5 : 0)}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <table className="tbl">
            <thead>
              <tr>
                <th>What</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Date</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
                .map(r => {
                  const status = r.status || '—'
                  return (
                    <tr key={r.id}>
                      <td data-label="What">{r.title}</td>
                      <td data-label="Customer">{m(r, 'customer')}</td>
                      <td data-label="Status">
                        <span className={`pill ${status}`}>{status}</span>
                      </td>
                      <td data-label="Date">{r.due_date || '—'}</td>
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
