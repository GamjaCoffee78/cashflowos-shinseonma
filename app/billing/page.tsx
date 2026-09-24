import Link from 'next/link'
import { listDocs, invoiceBalance } from '@/lib/billing'
import { DOC_TYPES, TYPE_KEYS, fmtDate, money, totals, type DocType } from '@/lib/billing-shared'
import { todayISO } from '@/lib/records'

export const dynamic = 'force-dynamic'

// 👉 Billing — Purchase Orders, Delivery Orders, Invoices, Credit & Debit Notes.
//    Rows are category='billing_doc' (see lib/billing.ts). Kept OUT of the
//    Cash In / Cash Out totals: an invoice becomes cash only when it's paid.

const AGE = [
  { label: 'Current', max: 0 },
  { label: '1–30 days', max: 30 },
  { label: '31–60 days', max: 60 },
  { label: '61–90 days', max: 90 },
  { label: '90+ days', max: Infinity },
]
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export default async function Billing({ searchParams }: { searchParams: Promise<{ t?: string; q?: string }> }) {
  const { t, q } = await searchParams
  const type = TYPE_KEYS.includes(t as DocType) ? (t as DocType) : null
  const today = todayISO()
  const docs = await listDocs()

  // Receivables — what customers still owe on issued invoices.
  const open = docs
    .filter(d => d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled')
    .map(d => ({ d, ...invoiceBalance(d, docs) }))
    .filter(x => x.balance > 0.005)
  const owed = open.reduce((s, x) => s + x.balance, 0)
  const aging = AGE.map(() => 0)
  for (const x of open) {
    const late = daysBetween(x.d.dueDate || x.d.date, today)
    aging[AGE.findIndex(a => late <= a.max)] += x.balance
  }
  const overdue = aging.slice(1).reduce((a, b) => a + b, 0)
  const month = today.slice(0, 7)
  const billed = docs.filter(d => d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled' && d.date.startsWith(month))
    .reduce((s, d) => s + totals(d).total, 0)
  const poOpen = docs.filter(d => d.type === 'PO' && d.status === 'issued')

  const needle = (q ?? '').trim().toLowerCase()
  const shown = docs
    .filter(d => !type || d.type === type)
    .filter(d => !needle || `${d.number} ${d.party.name} ${d.refNo} ${d.yourRef}`.toLowerCase().includes(needle))

  // Status shown on the list: an issued invoice settled by payments/credit notes reads as paid.
  const statusOf = (d: (typeof docs)[number]) => {
    if (d.type !== 'INV' || d.status === 'draft' || d.status === 'cancelled') return d.status
    const b = invoiceBalance(d, docs).balance
    if (b <= 0.005) return 'paid'
    if (d.dueDate && d.dueDate < today) return 'overdue'
    return d.status
  }

  return (
    <>
      <h1 className="ph">Billing 🧾</h1>
      <p className="cap">Purchase orders, delivery orders, invoices, credit &amp; debit notes — numbered, printable, tracked until paid.</p>

      <div className="bl-new">
        {TYPE_KEYS.map(k => (
          <Link key={k} className="btn" href={`/billing/new?type=${k}`}>+ {DOC_TYPES[k].label}</Link>
        ))}
      </div>

      <div className="bl-stats">
        <div className="bl-stat"><span>Customers owe</span><b>{money(owed)}</b><small>{open.length} unpaid invoice{open.length === 1 ? '' : 's'}</small></div>
        <div className="bl-stat"><span>Overdue</span><b className={overdue > 0 ? 'bl-red' : ''}>{money(overdue)}</b><small>past due date</small></div>
        <div className="bl-stat"><span>Invoiced this month</span><b>{money(billed)}</b><small>before credit notes</small></div>
        <div className="bl-stat"><span>Open POs</span><b>{poOpen.length}</b><small>{money(poOpen.reduce((s, d) => s + totals(d).total, 0))} awaiting goods</small></div>
      </div>

      {owed > 0 ? (
        <>
          <h2 className="bl-h2">Debtors aging</h2>
          <table className="tbl bl-aging">
            <thead><tr>{AGE.map(a => <th key={a.label}>{a.label}</th>)}<th>Total</th></tr></thead>
            <tbody><tr>{aging.map((v, i) => <td key={i} data-label={AGE[i].label}>{money(v)}</td>)}<td data-label="Total"><b>{money(owed)}</b></td></tr></tbody>
          </table>
        </>
      ) : null}

      <h2 className="bl-h2">Documents</h2>
      <form className="bl-filter" method="get">
        <Link className={`bl-chip${!type ? ' on' : ''}`} href="/billing">All</Link>
        {TYPE_KEYS.map(k => <Link key={k} className={`bl-chip${type === k ? ' on' : ''}`} href={`/billing?t=${k}`}>{DOC_TYPES[k].label}</Link>)}
        {type ? <input type="hidden" name="t" value={type} /> : null}
        <input className="bl-input" name="q" defaultValue={q ?? ''} placeholder="Search no. or name" />
      </form>

      {shown.length === 0 ? (
        <p className="cap">No documents yet — start with one of the buttons above.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>No.</th><th>Date</th><th>Party</th><th>Ref</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map(d => {
              const st = statusOf(d)
              const bal = d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled' ? invoiceBalance(d, docs).balance : null
              return (
                <tr key={d.id}>
                  <td data-label="No."><Link href={`/billing/${d.id}`}><b>{d.number}</b></Link><br /><small className="bl-dim">{DOC_TYPES[d.type].label}</small></td>
                  <td data-label="Date">{fmtDate(d.date)}</td>
                  <td data-label="Party">{d.party.name}</td>
                  <td data-label="Ref">{d.refNo || d.yourRef || '—'}</td>
                  <td data-label="Amount">{DOC_TYPES[d.type].priced ? money(totals(d).total) : '—'}</td>
                  <td data-label="Balance">{bal === null ? '—' : money(bal)}</td>
                  <td data-label="Status"><span className={`pill ${st}`}>{st}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
