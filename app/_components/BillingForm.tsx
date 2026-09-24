'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DOC_TYPES, TYPE_KEYS, addDays, contactFits, emptyLine, lineAmount, money, totals,
  type BillingDoc, type Contact, type DocType, type Line, type Party,
} from '@/lib/billing-shared'
import DocSheet from './DocSheet'

// The create/edit form for a billing document. Totals update as you type;
// the server re-checks everything and assigns the running number on save.
export default function BillingForm({
  initial, contacts, invoices,
}: {
  initial: BillingDoc & { id?: number }
  contacts: Contact[]
  invoices: { number: string; name: string; balance: number }[]
}) {
  const router = useRouter()
  const [d, setD] = useState(initial)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState(false)
  const [saveContact, setSaveContact] = useState(true)
  const cfg = DOC_TYPES[d.type]
  const t = totals(d)

  const set = <K extends keyof BillingDoc>(k: K, v: BillingDoc[K]) => setD(p => ({ ...p, [k]: v }))
  const setParty = (k: keyof Party, v: string) => setD(p => ({ ...p, party: { ...p.party, [k]: v } }))
  const setLine = (i: number, k: keyof Line, v: string) =>
    setD(p => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: k === 'desc' || k === 'uom' ? v : Number(v) } : l)) }))

  // Contacts that suit this document first (suppliers for a PO, customers otherwise).
  const fits = contacts.filter(c => contactFits(c, d.type))
  const known = contacts.find(c => c.name.toLowerCase() === d.party.name.trim().toLowerCase())
  const toParty = (c: Contact): Party => ({ name: c.name, address: c.address, attn: c.attn, phone: c.phone, email: c.email, regNo: c.regNo })
  const pickParty = (name: string) => {
    const found = contacts.find(c => c.name === name)
    setD(p => found
      ? { ...p, party: toParty(found), ...(p.type === 'INV' || p.type === 'PO' ? { terms: found.terms, dueDate: '' } : {}) }
      : { ...p, party: { ...p.party, name } })
  }
  const pickInvoice = (num: string) => {
    const inv = invoices.find(i => i.number === num)
    const c = inv && contacts.find(x => x.name === inv.name)
    setD(p => ({ ...p, refNo: num, party: c && !p.party.name ? toParty(c) : p.party }))
  }

  const save = (issue: boolean) =>
    start(async () => {
      setErr('')
      if (issue && !confirm(`Issue this ${cfg.label}? Once issued it can't be edited — only cancelled or adjusted by a credit/debit note.`)) return
      try {
        const res = await fetch('/api/billing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', ...d, issue, saveContact }),
        })
        const r = await res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }))
        if (!r.ok) return setErr(r.message)
        router.push(`/billing/${r.id}`)
        router.refresh()
      } catch (e) {
        setErr(String((e as Error)?.message || e))
      }
    })

  const due = d.dueDate || addDays(d.date, d.terms)

  return (
    <div className="bf">
      <section className="bf-card">
        <div className="bf-grid">
          <label>Document
            <select value={d.type} disabled={!!d.id && d.status !== 'draft'} onChange={e => set('type', e.target.value as DocType)}>
              {TYPE_KEYS.map(k => <option key={k} value={k}>{DOC_TYPES[k].label}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={d.date} onChange={e => set('date', e.target.value)} /></label>
          {d.type === 'INV' || d.type === 'PO' ? (
            <>
              <label>Terms (days)<input type="number" min={0} value={d.terms} onChange={e => setD(p => ({ ...p, terms: Number(e.target.value), dueDate: '' }))} /></label>
              <label>{d.type === 'PO' ? 'Required by' : 'Due date'}<input type="date" value={due} onChange={e => set('dueDate', e.target.value)} /></label>
            </>
          ) : null}
        </div>
      </section>

      <section className="bf-card">
        <h3>{cfg.party}</h3>
        <div className="bf-grid">
          <label className="bf-wide">Name
            <input list="bf-parties" value={d.party.name} onChange={e => pickParty(e.target.value)} placeholder="Company or person" />
            <datalist id="bf-parties">{fits.map(c => <option key={c.id ?? c.name} value={c.name} />)}</datalist>
            <small className="bf-hint">
              {fits.length ? `Type or pick from ${fits.length} saved ${d.type === 'PO' ? 'supplier' : 'customer'}${fits.length === 1 ? '' : 's'}. ` : ''}
              <a href="/billing/contacts" target="_blank">Manage contacts</a>
            </small>
          </label>
          <label className="bf-wide">Address<textarea rows={3} value={d.party.address} onChange={e => setParty('address', e.target.value)} /></label>
          <label>Attention<input value={d.party.attn} onChange={e => setParty('attn', e.target.value)} /></label>
          <label>Phone<input value={d.party.phone} onChange={e => setParty('phone', e.target.value)} /></label>
          <label>Email<input type="email" value={d.party.email} onChange={e => setParty('email', e.target.value)} /></label>
          <label>Reg. no. / TIN<input value={d.party.regNo} onChange={e => setParty('regNo', e.target.value)} placeholder="for e-Invoice" /></label>
          {d.type === 'PO' || d.type === 'DO' ? (
            <label className="bf-wide">{d.type === 'PO' ? 'Deliver to (if not our office)' : 'Delivery address (if different)'}
              <textarea rows={2} value={d.shipTo} onChange={e => set('shipTo', e.target.value)} />
            </label>
          ) : null}
        </div>
      </section>

      <section className="bf-card">
        <h3>References</h3>
        <div className="bf-grid">
          {cfg.needsRef ? (
            <label>Against invoice
              <select value={d.refNo} onChange={e => pickInvoice(e.target.value)}>
                <option value="">— pick —</option>
                {invoices.map(i => <option key={i.number} value={i.number}>{i.number} · {i.name} · owes {money(i.balance)}</option>)}
              </select>
            </label>
          ) : (
            <label>Our ref (DO / PO no.)<input value={d.refNo} onChange={e => set('refNo', e.target.value)} /></label>
          )}
          <label>{d.type === 'PO' ? 'Supplier quote no.' : 'Customer PO no.'}<input value={d.yourRef} onChange={e => set('yourRef', e.target.value)} /></label>
          {cfg.needsRef ? (
            <label className="bf-wide">Reason<input value={d.reason} onChange={e => set('reason', e.target.value)} placeholder={d.type === 'CN' ? 'e.g. goods returned damaged, price overcharged' : 'e.g. extra delivery, undercharged'} /></label>
          ) : null}
        </div>
      </section>

      <section className="bf-card">
        <h3>Items</h3>
        <div className="bf-lines">
          <div className="bf-line bf-head">
            <span>Description</span><span>Qty</span><span>UOM</span>
            {cfg.priced ? <><span>Unit price</span><span>Disc %</span><span>Amount</span></> : null}<span />
          </div>
          {d.lines.map((l, i) => (
            <div className={`bf-line${cfg.priced ? '' : ' nop'}`} key={i}>
              <input aria-label="Description" value={l.desc} onChange={e => setLine(i, 'desc', e.target.value)} placeholder="Item / service" />
              <input aria-label="Qty" type="number" step="any" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} />
              <input aria-label="UOM" value={l.uom} onChange={e => setLine(i, 'uom', e.target.value)} />
              {cfg.priced ? (
                <>
                  <input aria-label="Unit price" type="number" step="0.01" value={l.price} onChange={e => setLine(i, 'price', e.target.value)} />
                  <input aria-label="Discount %" type="number" step="any" min={0} max={100} value={l.disc} onChange={e => setLine(i, 'disc', e.target.value)} />
                  <span className="bf-amt">{money(lineAmount(l))}</span>
                </>
              ) : null}
              <button type="button" className="bf-x" aria-label="Remove line" disabled={d.lines.length === 1}
                onClick={() => set('lines', d.lines.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn ghost" onClick={() => set('lines', [...d.lines, emptyLine()])}>+ Add item</button>

        {cfg.priced ? (
          <div className="bf-tot">
            <div><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
            <div>
              <span>SST
                <select value={d.taxRate} onChange={e => set('taxRate', Number(e.target.value))}>
                  <option value={0}>None</option><option value={6}>6% (service)</option><option value={8}>8% (service)</option>
                  <option value={5}>5% (sales)</option><option value={10}>10% (sales)</option>
                </select>
              </span>
              <span>{money(t.tax)}</span>
            </div>
            <div className="g"><span>Total</span><span>{money(t.total)}</span></div>
          </div>
        ) : null}
      </section>

      <section className="bf-card">
        <div className="bf-grid">
          <label className="bf-wide">Notes printed on the document<textarea rows={2} value={d.notes} onChange={e => set('notes', e.target.value)} /></label>
          <label>Prepared by<input value={d.createdBy} onChange={e => set('createdBy', e.target.value)} placeholder="Your name" /></label>
        </div>
      </section>

      {d.party.name.trim() ? (
        <label className="bf-check">
          <input type="checkbox" checked={saveContact} onChange={e => setSaveContact(e.target.checked)} />
          {known ? `Update ${known.name}'s details in Contacts` : `Save ${d.party.name.trim()} to Contacts as a ${d.type === 'PO' ? 'supplier' : 'customer'}`}
        </label>
      ) : null}

      {err ? <p className="bf-err">{err}</p> : null}
      <div className="btnrow bf-actions">
        <button type="button" className="btn ghost" onClick={() => setPreview(true)}>👀 Preview</button>
        <button type="button" className="btn ghost" disabled={pending} onClick={() => save(false)}>Save draft</button>
        <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>Issue {cfg.label}</button>
      </div>

      {preview ? (
        <div className="bf-preview" role="dialog" aria-modal="true" aria-label="Preview" onClick={() => setPreview(false)}>
          <div className="bf-preview-in" onClick={e => e.stopPropagation()}>
            <div className="bf-preview-bar">
              <b>Preview — not saved yet</b>
              <span className="btnrow">
                <button type="button" className="btn ghost" onClick={() => setPreview(false)}>← Keep editing</button>
                <button type="button" className="btn ghost" disabled={pending} onClick={() => { setPreview(false); save(false) }}>Save draft</button>
                <button type="button" className="btn" disabled={pending} onClick={() => { setPreview(false); save(true) }}>Issue</button>
              </span>
            </div>
            <DocSheet doc={{ ...d, dueDate: due, lines: d.lines.filter(l => l.desc.trim()).length ? d.lines.filter(l => l.desc.trim()) : d.lines }} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
