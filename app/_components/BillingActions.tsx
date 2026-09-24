'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { COMPANY, money, fmtDate, todayMY, type DocStatus, type DocType } from '@/lib/billing-shared'

type Doc = { id: number; type: DocType; number: string; status: DocStatus; email: string; name: string; total: number; dueDate: string }

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// The buttons above a document: print, email, issue, convert, pay, cancel.
export default function BillingActions({ doc, balance }: { doc: Doc; balance: number | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [paying, setPaying] = useState(false)
  const [pay, setPay] = useState({ date: todayMY(), amount: String(balance ?? ''), method: 'Bank transfer', ref: '' })

  const run = (body: object) => start(async () => {
    const r = await post({ id: doc.id, ...body })
    setMsg(r.message)
    if (r.ok) { setPaying(false); router.refresh() }
  })

  const live = doc.status !== 'draft' && doc.status !== 'cancelled'
  const label = { PO: 'Purchase Order', DO: 'Delivery Order', INV: 'Invoice', CN: 'Credit Note', DN: 'Debit Note' }[doc.type]
  const mail = `mailto:${encodeURIComponent(doc.email)}?subject=${encodeURIComponent(`${label} ${doc.number} from ${COMPANY.name}`)}&body=${encodeURIComponent(
    `Dear ${doc.name},\n\nPlease find attached ${label} ${doc.number}` +
    (doc.type === 'INV' ? ` for ${money(doc.total)}, due ${fmtDate(doc.dueDate)}.\n\nPayment to ${COMPANY.bank.name}, account ${COMPANY.bank.account}. Please quote ${doc.number} as reference.` : '.') +
    `\n\nThank you.\n\n${COMPANY.name}\n${COMPANY.email}`)}`

  return (
    <div className="bl-actions">
      <button type="button" className="btn ghost" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      <a className="btn ghost" href={mail} title="Save the PDF first, then attach it to the email">✉️ Email</a>
      {doc.status === 'draft' ? (
        <>
          <Link className="btn ghost" href={`/billing/new?edit=${doc.id}`}>Edit</Link>
          <button type="button" className="btn" disabled={pending} onClick={() => confirm(`Issue ${doc.number}? It can't be edited afterwards.`) && run({ action: 'status', to: 'issued' })}>Issue</button>
        </>
      ) : null}
      {live && doc.type === 'PO' ? <Link className="btn ghost" href={`/billing/new?type=PO&from=${doc.id}`}>Duplicate</Link> : null}
      {live && doc.type === 'PO' && doc.status === 'issued' ? <button type="button" className="btn ghost" disabled={pending} onClick={() => run({ action: 'status', to: 'received' })}>Goods received</button> : null}
      {live && doc.type === 'DO' ? <Link className="btn" href={`/billing/new?type=INV&from=${doc.id}`}>→ Invoice</Link> : null}
      {live && doc.type === 'DO' && doc.status === 'issued' ? <button type="button" className="btn ghost" disabled={pending} onClick={() => run({ action: 'status', to: 'received' })}>Delivered</button> : null}
      {live && doc.type === 'INV' ? (
        <>
          <Link className="btn ghost" href={`/billing/new?type=DO&from=${doc.id}`}>→ DO</Link>
          <Link className="btn ghost" href={`/billing/new?type=CN&from=${doc.id}`}>→ Credit Note</Link>
          <Link className="btn ghost" href={`/billing/new?type=DN&from=${doc.id}`}>→ Debit Note</Link>
          {balance !== null && balance > 0.005 ? <button type="button" className="btn" onClick={() => setPaying(p => !p)}>💰 Record payment</button> : null}
        </>
      ) : null}
      {doc.status !== 'cancelled' ? (
        <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => {
          const reason = prompt(`Cancel ${doc.number}? The number stays in the records, marked cancelled.\n\nReason:`)
          if (reason !== null) run({ action: 'status', to: 'cancelled', reason })
        }}>Cancel</button>
      ) : null}

      {paying ? (
        <div className="bl-pay">
          <label>Date<input type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></label>
          <label>Amount (RM)<input type="number" step="0.01" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></label>
          <label>Method
            <select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
              {['Bank transfer', 'DuitNow', 'Cheque', 'Cash', 'Card', 'Other'].map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Ref<input value={pay.ref} onChange={e => setPay({ ...pay, ref: e.target.value })} placeholder="bank ref / cheque no." /></label>
          <button type="button" className="btn" disabled={pending} onClick={() => run({ action: 'payment', ...pay })}>Save payment</button>
        </div>
      ) : null}
      {msg ? <p className="bl-msg">{msg}</p> : null}
    </div>
  )
}
