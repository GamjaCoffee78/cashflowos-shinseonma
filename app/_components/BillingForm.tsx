'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DOC_TYPES, TYPE_KEYS, addDays, emptyLine, lineAmount, money, totals,
  type BillingDoc, type DocType, type Line, type Party,
} from '@/lib/billing-shared'

// The create/edit form for a billing document. Totals update as you type;
// the server re-checks everything and assigns the running number on save.
export default function BillingForm({
  initial, parties, invoices,
}: {
  initial: BillingDoc & { id?: number }
  parties: Party[]
  invoices: { number: string; name: string; balance: number }[]
}) {
  const router = useRouter()
  const [d, setD] = useState(initial)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const cfg = DOC_TYPES[d.type]
  const t = totals(d)

  const set = <K extends keyof BillingDoc>(k: K, v: BillingDoc[K]) => setD(p => ({ ...p, [k]: v }))
  const setParty = (k: keyof Party, v: string) => setD(p => ({ ...p, party: { ...p.party, [k]: v } }))
  const setLine = (i: number, k: keyof Line, v: string) =>
    setD(p => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: k === 'desc' || k === 'uom' ? v : Number(v) } : l)) }))

  const pickParty = (name: string) => {
    const found = parties.find(p => p.name === name)
    setD(p => ({ ...p, party: found ? { ...found } : { ...p.party, name } }))
  }
  const pickInvoice = (num: string) => {
    const inv = invoices.find(i => i.number === num)
    setD(p => ({ ...p, refNo: num, party: inv && !p.party.name ? { ...(parties.find(x => x.name === inv.name) ?? p.party) } : p.party }))
  }

  const save = (issue: boolean) =>
    start(async () => {
      setErr('')
      if (issue && !confirm(`Issue this ${cfg.label}? Once issued it can't be edited — only cancelled or adjusted by a credit/debit note.`)) return
      try {
        const res = await fetch('/api/billing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save', ...d, issue }),
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
            <datalist id="bf-parties">{parties.map(p => <option key={p.name} value={p.name} />)}</datalist>
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

      {err ? <p className="bf-err">{err}</p> : null}
      <div className="btnrow">
        <button type="button" className="btn ghost" disabled={pending} onClick={() => save(false)}>Save draft</button>
        <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>Issue {cfg.label}</button>
      </div>
    </div>
  )
}
