// 👉 This is your Cash Out tab — money going OUT, including receipts your robot
// files for you. Safe to edit the columns/labels. It reads the ONE `records`
// table, filtered to category='cash_out'. Rows with meta.auto_filed = the Vault
// agent filed them on autopilot (🟢) — we badge those so you can spot them.
import { getRecords, rm, m, todayISO, inMoneyWindow, moneyFromLabel } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import SpendBreakdown from '@/app/_components/SpendBreakdown'
import DeleteReceipt from '@/app/_components/DeleteReceipt'

export const dynamic = 'force-dynamic'

export default async function CashOut() {
  const all = await getRecords()
  // Windowed to ABANG.moneyFrom so this tab agrees with the Dashboard.
  const rows = all.filter(r => r.category === 'cash_out' && inMoneyWindow(r))

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  // Spend so far this calendar month (by due_date, the date the money moved).
  const monthPrefix = todayISO().slice(0, 7) // YYYY-MM
  const thisMonth = rows
    .filter(r => (r.due_date || '').slice(0, 7) === monthPrefix)
    .reduce((s, r) => s + Number(r.amount || 0), 0)
  // How many the robot filed for you without asking (the autopilot count).
  const autoFiled = rows.filter(r => r.meta?.auto_filed).length
  const period = moneyFromLabel()

  // Newest spend first (most recent due_date at the top).
  const sorted = [...rows].sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))

  return (
    <>
      <h1 className="ph">Cash Out 🧾</h1>
      <p className="cap">Money going out — including receipts your robot files for you.</p>

      <div className="grid">
        <Stat label="Total out" value={rm(total)} />
        <Stat label="This month" value={rm(thisMonth)} />
        <Stat label="🤖 Auto-filed" value={autoFiled} />
      </div>

      {/* The analysis sits ABOVE the ledger: "where is the money going" first,
          then the row-by-row record. The list below is unchanged. */}
      <SpendBreakdown rows={rows} period={period} />

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <Empty label="money-out" />
      ) : (
        <>
        <p className="rowlabel">Every row · {rows.length}</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>What</th>
              <th>Category</th>
              <th>Status</th>
              <th>Date</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <td data-label="What">
                  {r.title}
                  {r.meta?.auto_filed ? (
                    <span className="pill filed" style={{ marginLeft: 8 }}>🤖 auto-filed</span>
                  ) : null}
                </td>
                <td data-label="Category">{m(r, 'category')}</td>
                <td data-label="Status">
                  <span className={`pill ${r.status || '—'}`}>{r.status || '—'}</span>
                </td>
                <td data-label="Date">{r.due_date || '—'}</td>
                <td data-label="Amount">{rm(r.amount)}</td>
                <td data-label="">{r.meta?.source === 'vault' ? <DeleteReceipt id={r.id} title={r.title} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </>
  )
}
