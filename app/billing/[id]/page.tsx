import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDoc, listDocs, invoiceBalance } from '@/lib/billing'
import { COMPANY, DOC_TYPES, amountInWords, fmtDate, lineAmount, money, totals } from '@/lib/billing-shared'
import BillingActions from '@/app/_components/BillingActions'

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
  const ship = doc.type === 'PO' ? (doc.shipTo || `${COMPANY.name}\n${COMPANY.address.join('\n')}`) : doc.shipTo

  return (
    <>
      <div className="bl-bar no-print">
        <Link href="/billing">← Billing</Link>
        <BillingActions
          doc={{ id: doc.id, type: doc.type, number: doc.number, status: doc.status, email: doc.party.email, name: doc.party.name, total: t.total, dueDate: doc.dueDate }}
          balance={bal?.balance ?? null}
        />
      </div>

      <article className={`bdoc${doc.status === 'cancelled' ? ' void' : ''}`}>
        {doc.status === 'draft' ? <div className="bdoc-stamp">DRAFT</div> : null}
        {doc.status === 'cancelled' ? <div className="bdoc-stamp">CANCELLED</div> : null}
        <header className="bdoc-head">
          <div className="bdoc-co">
            <img src="/icons/icon-192.png" alt="" width={44} height={44} />
            <div>
              <b>{COMPANY.name}</b> <small>({COMPANY.regNo})</small><br />
              {COMPANY.address.map(a => <span key={a}>{a}<br /></span>)}
              {[COMPANY.phone && `Tel: ${COMPANY.phone}`, COMPANY.email, COMPANY.sstNo && `SST No: ${COMPANY.sstNo}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="bdoc-title">
            <h2>{doc.taxRate > 0 && doc.type === 'INV' ? 'TAX INVOICE' : cfg.title}</h2>
            <table>
              <tbody>
                <tr><td>No.</td><td><b>{doc.number}</b></td></tr>
                <tr><td>Date</td><td>{fmtDate(doc.date)}</td></tr>
                {doc.type === 'INV' ? <tr><td>Terms</td><td>{doc.terms ? `${doc.terms} days` : 'Cash'}</td></tr> : null}
                {doc.type === 'INV' ? <tr><td>Due</td><td>{fmtDate(doc.dueDate)}</td></tr> : null}
                {doc.type === 'PO' && doc.dueDate ? <tr><td>Required by</td><td>{fmtDate(doc.dueDate)}</td></tr> : null}
                {doc.refNo ? <tr><td>{cfg.needsRef ? 'Invoice' : 'Our ref'}</td><td>{doc.refNo}</td></tr> : null}
                {doc.yourRef ? <tr><td>{doc.type === 'PO' ? 'Quote' : 'Your PO'}</td><td>{doc.yourRef}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </header>

        <section className="bdoc-parties">
          <div>
            <h4>{cfg.party}</h4>
            <b>{doc.party.name}</b>{doc.party.regNo ? <small> ({doc.party.regNo})</small> : null}<br />
            <span className="pre">{doc.party.address}</span>
            {doc.party.attn ? <><br />Attn: {doc.party.attn}</> : null}
            {doc.party.phone || doc.party.email ? <><br />{[doc.party.phone, doc.party.email].filter(Boolean).join(' · ')}</> : null}
          </div>
          {ship ? <div><h4>Deliver to</h4><span className="pre">{ship}</span></div> : null}
        </section>

        {doc.reason ? <p className="bdoc-reason"><b>Reason:</b> {doc.reason}</p> : null}

        <table className="bdoc-lines">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th className="r">Qty</th><th>UOM</th>
              {cfg.priced ? <><th className="r">Unit price</th><th className="r">Disc</th><th className="r">Amount (RM)</th></> : null}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td><td>{l.desc}</td><td className="r">{l.qty}</td><td>{l.uom}</td>
                {cfg.priced ? (
                  <>
                    <td className="r">{l.price.toFixed(2)}</td>
                    <td className="r">{l.disc ? `${l.disc}%` : ''}</td>
                    <td className="r">{lineAmount(l).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        {cfg.priced ? (
          <div className="bdoc-sum">
            <p className="bdoc-words">{amountInWords(t.total)}</p>
            <div className="bdoc-tot">
              <div><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
              {doc.taxRate > 0 ? <div><span>SST {doc.taxRate}%</span><span>{money(t.tax)}</span></div> : null}
              <div className="g"><span>Total</span><span>{money(t.total)}</span></div>
            </div>
          </div>
        ) : null}

        {doc.type === 'INV' ? (
          <section className="bdoc-bank">
            <h4>Payment to</h4>
            {COMPANY.name}<br />
            {COMPANY.bank.name} ({COMPANY.bank.branch})<br />
            Account no.: <b>{COMPANY.bank.account}</b> · SWIFT: {COMPANY.bank.swift}<br />
            <small>{COMPANY.bank.address}</small><br />
            <small>Please quote {doc.number} as the payment reference.</small>
          </section>
        ) : null}

        {doc.notes ? <p className="bdoc-notes pre">{doc.notes}</p> : null}

        <footer className="bdoc-sign">
          <div>{doc.type === 'DO' ? 'Issued by' : 'Prepared by'}{doc.createdBy ? `: ${doc.createdBy}` : ''}</div>
          <div>{doc.type === 'DO' ? 'Received in good order & condition (name, IC, chop, date)' : doc.type === 'PO' ? 'Approved by' : 'Authorised signature'}</div>
        </footer>
        <p className="bdoc-fine">This is a computer-generated document.</p>
      </article>

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
