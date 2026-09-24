import { COMPANY, DOC_TYPES, amountInWords, fmtDate, lineAmount, money, totals, type BillingDoc } from '@/lib/billing-shared'

// The printed billing document. Used by the document page AND the live preview
// in the form, so what you preview is exactly what prints. No data access —
// safe on the server and in the browser.

// The warm note at the foot of every document — Okmaya's voice, per document type.
const THANKS = {
  INV: { title: 'Thank you for choosing Okmaya! 🤍', body: 'Every order helps our little kitchen keep cooking with heart. We truly appreciate your support.' },
  DO:  { title: 'Made with love, delivered with care 🍱', body: 'Please check your items on arrival — if anything is not right, just let us know and we will make it right.' },
  PO:  { title: 'Thank you, partner 🤝', body: 'We are grateful to grow together with you. Kindly confirm this order and the delivery date at your convenience.' },
  CN:  { title: 'We are sorry for the trouble 🙏', body: 'This credit has been applied to your account. Thank you for your patience and for staying with Okmaya.' },
  DN:  { title: 'Thank you for your understanding 🤍', body: 'This note covers the adjustment described above. Please reach out if you have any questions at all.' },
} as const

export default function DocSheet({ doc }: { doc: BillingDoc }) {
  const cfg = DOC_TYPES[doc.type]
  const t = totals(doc)
  const ship = doc.type === 'PO' ? (doc.shipTo || `${COMPANY.name}\n${COMPANY.address.join('\n')}`) : doc.shipTo
  return (
    <article className={`bdoc${doc.status === 'cancelled' ? ' void' : ''}`}>
      {doc.status === 'draft' ? <div className="bdoc-stamp">DRAFT</div> : null}
      {doc.status === 'cancelled' ? <div className="bdoc-stamp">CANCELLED</div> : null}
      <div className="bdoc-band" aria-hidden="true" />
      <header className="bdoc-head">
        <div className="bdoc-co">
          <img className="bdoc-logo" src="/icons/okmaya-secondary.png" alt="Okmaya" width={230} height={66} />
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
              <tr><td>No.</td><td><b>{doc.number || 'Given on save'}</b></td></tr>
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
          <small>Please quote {doc.number || 'the invoice number'} as the payment reference.</small>
        </section>
      ) : null}

      {doc.notes ? <p className="bdoc-notes pre">{doc.notes}</p> : null}

      <footer className="bdoc-sign">
        <div>{doc.type === 'DO' ? 'Issued by' : 'Prepared by'}{doc.createdBy ? `: ${doc.createdBy}` : ''}</div>
        <div>{doc.type === 'DO' ? 'Received in good order & condition (name, IC, chop, date)' : doc.type === 'PO' ? 'Approved by' : 'Authorised signature'}</div>
      </footer>
      <div className="bdoc-thanks">
        <img src="/icons/icon-192.png" alt="" width={64} height={64} />
        <div>
          <b>{THANKS[doc.type].title}</b>
          <p>{THANKS[doc.type].body}</p>
          <small>감사합니다 · Terima kasih · Thank you</small>
        </div>
      </div>
      <p className="bdoc-fine">This is a computer-generated document.</p>
    </article>
  )
}
