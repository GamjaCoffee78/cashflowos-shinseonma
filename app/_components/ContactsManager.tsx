'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { emptyContact, money, type Contact, type ContactKind } from '@/lib/billing-shared'

const KINDS: { k: ContactKind | 'all'; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'customer', label: 'Customers' }, { k: 'supplier', label: 'Suppliers' },
]

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// The Contacts list with an add / edit form. Everything goes through /api/billing.
export default function ContactsManager({ contacts, stats }: { contacts: Contact[]; stats: Record<string, { owes: number; docs: number }> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [filter, setFilter] = useState<ContactKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Contact | null>(null)
  const [msg, setMsg] = useState('')

  const run = (body: object, after?: () => void) => start(async () => {
    const r = await post(body)
    setMsg(r.message)
    if (r.ok) { after?.(); router.refresh() }
  })
  const set = (k: keyof Contact, v: string) => setEdit(e => e && ({ ...e, [k]: k === 'terms' ? Number(v) : v }))

  const needle = q.trim().toLowerCase()
  const shown = contacts
    .filter(c => filter === 'all' || c.kind === filter || c.kind === 'both')
    .filter(c => !needle || `${c.name} ${c.attn} ${c.phone} ${c.email}`.toLowerCase().includes(needle))

  return (
    <div className="bc">
      <div className="bl-filter">
        {KINDS.map(k => (
          <button key={k.k} type="button" className={`bl-chip${filter === k.k ? ' on' : ''}`} onClick={() => setFilter(k.k)}>{k.label}</button>
        ))}
        <input className="bl-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, email" />
        <button type="button" className="btn" onClick={() => { setMsg(''); setEdit(emptyContact(filter === 'supplier' ? 'supplier' : 'customer')) }}>+ New contact</button>
      </div>
      {msg ? <p className="bl-msg" style={{ textAlign: 'left' }}>{msg}</p> : null}

      {edit ? (
        <section className="bf-card bc-form">
          <h3>{edit.id ? `Edit ${edit.name}` : 'New contact'}</h3>
          <div className="bf-grid bf">
            <label>Type
              <select value={edit.kind} onChange={e => set('kind', e.target.value)}>
                <option value="customer">Customer</option><option value="supplier">Supplier</option><option value="both">Both</option>
              </select>
            </label>
            <label className="bf-wide">Name<input value={edit.name} onChange={e => set('name', e.target.value)} placeholder="Company or person" /></label>
            <label className="bf-wide">Address<textarea rows={3} value={edit.address} onChange={e => set('address', e.target.value)} /></label>
            <label>Attention<input value={edit.attn} onChange={e => set('attn', e.target.value)} /></label>
            <label>Phone<input value={edit.phone} onChange={e => set('phone', e.target.value)} /></label>
            <label>Email<input type="email" value={edit.email} onChange={e => set('email', e.target.value)} /></label>
            <label>Reg. no. / TIN<input value={edit.regNo} onChange={e => set('regNo', e.target.value)} /></label>
            <label>Payment terms (days)<input type="number" min={0} value={edit.terms} onChange={e => set('terms', e.target.value)} /></label>
            <label className="bf-wide">Notes (not printed)<textarea rows={2} value={edit.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. delivers Tue/Thu only, prefers WhatsApp" /></label>
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={pending} onClick={() => run({ action: 'contact_save', ...edit }, () => setEdit(null))}>Save contact</button>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <p className="cap">{contacts.length ? 'No match.' : 'No contacts yet — add one, or they are saved automatically the first time you bill someone.'}</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Name</th><th>Type</th><th>Contact</th><th>Owes us</th><th /></tr></thead>
          <tbody>
            {shown.map(c => {
              const st = stats[c.name.toLowerCase()]
              return (
                <tr key={c.id}>
                  <td data-label="Name"><b>{c.name}</b>{c.address ? <><br /><small className="bl-dim pre">{c.address}</small></> : null}</td>
                  <td data-label="Type"><span className={`pill ${c.kind === 'supplier' ? 'pending' : 'open'}`}>{c.kind}</span></td>
                  <td data-label="Contact">{[c.attn, c.phone, c.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td data-label="Owes us">{st?.owes ? <span className="pill overdue">{money(st.owes)}</span> : '—'}{st?.docs ? <><br /><small className="bl-dim">{st.docs} document{st.docs === 1 ? '' : 's'}</small></> : null}</td>
                  <td data-label="">
                    <span className="bc-acts">
                      <Link className="btn ghost" href={`/billing/new?type=${c.kind === 'supplier' ? 'PO' : 'INV'}&contact=${c.id}`}>{c.kind === 'supplier' ? '+ PO' : '+ Invoice'}</Link>
                      <button type="button" className="btn ghost" onClick={() => { setMsg(''); setEdit({ ...c }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                      <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => confirm(`Remove ${c.name} from Contacts? Documents already made are not affected.`) && run({ action: 'contact_remove', id: c.id })}>Remove</button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
