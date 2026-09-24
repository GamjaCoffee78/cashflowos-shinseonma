import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDoc, listDocs, invoiceBalance } from '@/lib/billing'
import { DOC_TYPES, fmtDate, money, totals } from '@/lib/billing-shared'
import BillingActions from '@/app/_components/BillingActions'
import DocSheet from '@/app/_components/DocSheet'

export const dynamic = 'force-dynamic'


// One billing document, laid out as the printed page. "Print / Save PDF" uses
// the browser's print dialog; the print stylesheet hides the app around it.
export default async function DocView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doc = await getDoc(Number(id))
  if (!doc) notFound()
  const docs = await listDocs()
  const cfg = DOC_TYPES[doc.type]
  const t = totals(doc)
  const bal = doc.type === 'INV' ? invoiceBalance(doc, docs) : null
  const linked = docs.filter(d => d.refNo === doc.number && d.id !== doc.id)
  const source = doc.refNo ? docs.find(d => d.number === doc.refNo) : undefined

  return (
    <>
      <div className="bl-bar no-print">
        <Link href="/billing">← Billing</Link>
        <BillingActions
          doc={{ id: doc.id, type: doc.type, number: doc.number, status: doc.status, email: doc.party.email, name: doc.party.name, total: t.total, dueDate: doc.dueDate }}
          balance={bal?.balance ?? null}
        />
      </div>

      <DocSheet doc={doc} />

      <div className="no-print bl-side">
        {bal ? (
          <section className="bf-card">
            <h3>Account</h3>
            <div className="bf-tot">
              <div><span>Invoice total</span><span>{money(bal.total)}</span></div>
              {bal.dn ? <div><span>+ Debit notes</span><span>{money(bal.dn)}</span></div> : null}
              {bal.cn ? <div><span>− Credit notes</span><span>{money(bal.cn)}</span></div> : null}
              {bal.paid ? <div><span>− Received</span><span>{money(bal.paid)}</span></div> : null}
              <div className="g"><span>Balance owed</span><span>{money(bal.balance)}</span></div>
            </div>
            {(doc.payments ?? []).length ? (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Ref</th></tr></thead>
                <tbody>{doc.payments.map((p, i) => <tr key={i}><td>{fmtDate(p.date)}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.ref}</td></tr>)}</tbody>
              </table>
            ) : null}
          </section>
        ) : null}
        {source || linked.length ? (
          <section className="bf-card">
            <h3>Linked documents</h3>
            <ul className="bl-links">
              {source ? <li>From <Link href={`/billing/${source.id}`}>{source.number}</Link> ({DOC_TYPES[source.type].label})</li> : null}
              {linked.map(l => <li key={l.id}><Link href={`/billing/${l.id}`}>{l.number}</Link> — {DOC_TYPES[l.type].label}, {l.status}{DOC_TYPES[l.type].priced ? `, ${money(totals(l).total)}` : ''}</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  )
}
