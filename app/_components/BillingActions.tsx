'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { COMPANY, money, fmtDate, todayMY, type DocStatus, type DocType } from '@/lib/billing-shared'

type Doc = { id: number; type: DocType; number: string; status: DocStatus; email: string; phone: string; attn: string; name: string; total: number; dueDate: string }

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// The buttons above a document: print, email, issue, convert, pay, cancel.
type Who = { name: string; phone: string; email: string; attn: string }

// Malaysian numbers for wa.me: digits only, 012-345 6789 → 60123456789.
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('0')) return `6${d}`
  return d
}

export default function BillingActions({ doc, balance, sharePath, contacts, openSend = false }: { doc: Doc; balance: number | null; sharePath: string | null; contacts: Who[]; openSend?: boolean }) {
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

  const [sending, setSending] = useState(openSend)
  const [to, setTo] = useState<Who>({ name: doc.attn || doc.name, phone: doc.phone, email: doc.email, attn: doc.attn })
  const [copied, setCopied] = useState(false)
  const link = sharePath && typeof window !== 'undefined' ? `${window.location.origin}${sharePath}` : ''

  const live = doc.status !== 'draft' && doc.status !== 'cancelled'
  const label = { PO: 'Purchase Order', DO: 'Delivery Order', INV: 'Invoice', CN: 'Credit Note', DN: 'Debit Note' }[doc.type]
  const intro = `${label} ${doc.number}` + (doc.type === 'INV' ? ` for ${money(doc.total)}, due ${fmtDate(doc.dueDate)}` : '')
  const defaultMsg = `Hi ${to.name || doc.name},\n\nHere is our ${intro}:\n${link || '(link)'}\n` +
    (doc.type === 'INV' ? `\nPayment to ${COMPANY.bank.name}, account ${COMPANY.bank.account}. Please quote ${doc.number} as the reference.\n` : '') +
    `\nThank you for supporting Okmaya! 🤍\n${COMPANY.name}`
  const [text, setText] = useState('')
  const message = text || defaultMsg
  const wa = `https://wa.me/${waNumber(to.phone)}?text=${encodeURIComponent(message)}`
  const mail = `mailto:${encodeURIComponent(to.email)}?subject=${encodeURIComponent(`${label} ${doc.number} from ${COMPANY.name}`)}&body=${encodeURIComponent(message)}`
  const pickWho = (name: string) => {
    const c = contacts.find(x => x.name === name)
    setText('')
    setTo(c ? { name: c.attn || c.name, phone: c.phone, email: c.email, attn: c.attn } : { ...to, name })
  }

  return (
    <div className="bl-actions">
      <button type="button" className="btn ghost" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      <button type="button" className="btn" onClick={() => setSending(v => !v)}>📤 Send</button>
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
      <button type="button" className="btn danger" disabled={pending} onClick={() => {
        const ok = doc.status === 'draft'
          ? confirm(`Delete draft ${doc.number}? This can't be undone.`)
          : confirm(`Delete ${doc.number} for good? This can't be undone, and anyone you sent the link to will no longer see it.`)
        if (!ok) return
        start(async () => {
          const r = await post({ id: doc.id, action: 'delete' })
          setMsg(r.message)
          if (r.ok) { router.push('/billing'); router.refresh() }
        })
      }}>🗑 Delete</button>

      {sending ? (
        <div className="bl-pay bl-send">
          {!sharePath ? <p className="bf-err">Sharing needs AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY set in Vercel.</p> : null}
          {doc.status === 'draft' ? <p className="bl-dim" style={{ flexBasis: '100%', margin: 0 }}>This is still a draft — the customer will see a DRAFT stamp. Issue it first if it's final.</p> : null}
          <label>Send to
            <input list="bl-who" value={to.name} onChange={e => pickWho(e.target.value)} placeholder="Name" />
            <datalist id="bl-who">{contacts.map(c => <option key={c.name} value={c.name} />)}</datalist>
          </label>
          <label>WhatsApp no.<input value={to.phone} onChange={e => setTo({ ...to, phone: e.target.value })} placeholder="012-345 6789" /></label>
          <label>Email<input type="email" value={to.email} onChange={e => setTo({ ...to, email: e.target.value })} placeholder="name@company.com" /></label>
          <label style={{ flexBasis: '100%' }}>Message
            <textarea rows={7} value={message} onChange={e => setText(e.target.value)} />
          </label>
          <div className="btnrow" style={{ flexWrap: 'wrap' }}>
            <a className={`btn bl-wa${to.phone && link ? '' : ' off'}`} href={to.phone && link ? wa : undefined} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className={`btn${to.email && link ? '' : ' off'}`} href={to.email && link ? mail : undefined}>✉️ Email</a>
            <button type="button" className="btn ghost" disabled={!link} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
            {link ? <a className="btn ghost" href={link} target="_blank" rel="noreferrer">👀 See what they see</a> : null}
          </div>
        </div>
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
