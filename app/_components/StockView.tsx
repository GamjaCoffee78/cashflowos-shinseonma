'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { StockCount, StockBatch, StockProduct } from '@/lib/stock-sheet'

// The Stock tab: a summary strip, then one card per product with its expiry
// batches. ✏️ edits a batch's expiry + qty; "＋ Add product" adds a row. Every
// save POSTs to /api/stock, which writes the Google Sheet.

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
function parseExp(exp: string): { y: number; m: number } | null {
  const x = /^([A-Za-z]{3})[-\s/]?(\d{2}|\d{4})$/.exec(exp.trim())
  if (!x) return null
  const m = MON.indexOf(x[1].toLowerCase())
  if (m < 0) return null
  return { y: x[2].length === 2 ? 2000 + Number(x[2]) : Number(x[2]), m }
}
function monthsLeft(exp: string): number | null {
  const p = parseExp(exp)
  if (!p) return null
  const now = new Date()
  return (p.y - now.getFullYear()) * 12 + (p.m - now.getMonth())
}
const toMonthInput = (exp: string) => { const p = parseExp(exp); return p ? `${p.y}-${String(p.m + 1).padStart(2, '0')}` : '' }
const fmt = (n: number) => n.toLocaleString('en-MY')

type Tone = 'ok' | 'soon' | 'urgent' | 'none'
function tone(b: StockBatch): Tone {
  const left = monthsLeft(b.expiry)
  if (left === null || !(b.qty && b.qty > 0)) return 'none'
  return left <= 3 ? 'urgent' : left <= 6 ? 'soon' : 'ok'
}
const TONE: Record<Tone, { bg: string; fg: string; label: string }> = {
  ok: { bg: 'rgba(75,122,90,.12)', fg: 'var(--sage)', label: '' },
  soon: { bg: 'rgba(182,128,42,.15)', fg: 'var(--honey)', label: 'within 6 months' },
  urgent: { bg: 'rgba(194,48,42,.12)', fg: 'var(--rust)', label: 'within 3 months' },
  none: { bg: 'var(--paper)', fg: 'var(--ink-soft)', label: '' },
}

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch('/api/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await r.json().catch(() => null)) ?? { ok: false, message: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

function BatchRow({ b }: { b: StockBatch }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [exp, setExp] = useState(toMonthInput(b.expiry))
  const [qty, setQty] = useState(b.rawQty.replace(/,/g, ''))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const t = TONE[tone(b)]
  const empty = !(b.qty && b.qty > 0)

  async function save() {
    setBusy(true); setMsg('')
    const change: any = { action: 'edit', row: b.row, expected: { expiry: b.rawExpiry, qty: b.rawQty }, qty }
    if (exp !== toMonthInput(b.expiry)) change.expiry = exp
    const res = await post(change)
    setBusy(false)
    if (res.ok) { setEditing(false); start(() => router.refresh()) } else setMsg(res.message)
  }

  if (editing) {
    return (
      <li className="stk-batch stk-editing">
        <label>Expiry<input type="month" value={exp} onChange={e => setExp(e.target.value)} /></label>
        <label>Qty<input type="number" min={0} inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} /></label>
        <div className="stk-actions">
          <button className="btn" onClick={save} disabled={busy || pending}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn ghost" onClick={() => { setEditing(false); setExp(toMonthInput(b.expiry)); setQty(b.rawQty.replace(/,/g, '')); setMsg('') }}>Cancel</button>
        </div>
        {msg ? <p className="stk-err">{msg}</p> : null}
      </li>
    )
  }
  return (
    <li className={`stk-batch${empty ? ' stk-empty' : ''}`}>
      <span className="stk-exp" style={{ background: t.bg, color: t.fg }} title={t.label ? `Expires ${t.label}` : undefined}>
        {b.expiry || 'No expiry'}
      </span>
      <span className="stk-qty">{b.qty === null ? '—' : fmt(b.qty)}</span>
      <button className="stk-edit" onClick={() => setEditing(true)} aria-label="Edit expiry and quantity">✏️</button>
    </li>
  )
}

function ProductCard({ p }: { p: StockProduct }) {
  const worst = p.batches.map(tone).find(x => x === 'urgent') ?? p.batches.map(tone).find(x => x === 'soon')
  return (
    <article className="stk-card">
      <header>
        <div>
          <span className="stk-no">{p.no || '•'}</span>
          <h3>{p.name}</h3>
        </div>
        {worst ? <span className="stk-flag" style={{ color: TONE[worst].fg }}>⚠️ expiring</span> : null}
      </header>
      <div className="stk-total">
        <b>{fmt(p.total)}</b> <span>units</span>
      </div>
      <ul>{p.batches.map(b => <BatchRow key={b.row} b={b} />)}</ul>
    </article>
  )
}

function AddProduct() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [exp, setExp] = useState('')
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true); setMsg('')
    const res = await post({ action: 'add', name, expiry: exp, qty })
    setBusy(false)
    if (res.ok) { setOpen(false); setName(''); setExp(''); setQty(''); start(() => router.refresh()) } else setMsg(res.message)
  }

  if (!open) {
    return <button className="stk-card stk-add" onClick={() => setOpen(true)}><span>＋</span>Add product</button>
  }
  return (
    <article className="stk-card stk-addform">
      <h3>New product</h3>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kimchi Paste 200g" autoFocus /></label>
      <label>Expiry<input type="month" value={exp} onChange={e => setExp(e.target.value)} /></label>
      <label>Qty<input type="number" min={0} inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></label>
      <div className="stk-actions">
        <button className="btn" onClick={save} disabled={busy || pending || !name.trim() || qty === ''}>{busy ? 'Adding…' : 'Add to sheet'}</button>
        <button className="btn ghost" onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
      </div>
      {msg ? <p className="stk-err">{msg}</p> : null}
    </article>
  )
}

export default function StockView({ data }: { data: StockCount }) {
  const all = data.products.flatMap(p => p.batches)
  const units = data.products.reduce((s, p) => s + p.total, 0)
  const expiring = all.filter(b => tone(b) === 'urgent' || tone(b) === 'soon')
  const out = data.products.filter(p => p.total === 0).length
  return (
    <>
      <style>{CSS}</style>
      <section className="stk-stats">
        <div><span>Total units</span><b>{fmt(units)}</b></div>
        <div><span>Products</span><b>{data.products.length}</b></div>
        <div><span>Expiring ≤ 6 months</span><b style={{ color: expiring.length ? 'var(--honey)' : undefined }}>{fmt(expiring.reduce((s, b) => s + (b.qty ?? 0), 0))}</b><small>{expiring.length} batch{expiring.length === 1 ? '' : 'es'}</small></div>
        <div><span>Out of stock</span><b style={{ color: out ? 'var(--rust)' : undefined }}>{out}</b><small>product{out === 1 ? '' : 's'}</small></div>
      </section>
      <section className="stk-grid">
        {data.products.map(p => <ProductCard key={p.batches[0].row} p={p} />)}
        <AddProduct />
      </section>
    </>
  )
}

const CSS = `
.stk-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 14px 0 20px; }
.stk-stats > div { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.stk-stats span { font-size: 12px; color: var(--ink-soft); font-weight: 600; }
.stk-stats b { font-size: 26px; font-variant-numeric: tabular-nums; color: var(--ink); }
.stk-stats small { font-size: 12px; color: var(--ink-faint); }
.stk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.stk-card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.stk-card header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.stk-card header > div { display: flex; gap: 10px; align-items: center; }
.stk-no { flex: none; width: 26px; height: 26px; border-radius: 999px; background: var(--clay-tint); color: var(--clay); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.stk-card h3 { margin: 0; font-size: 15px; line-height: 1.3; color: var(--ink); }
.stk-flag { font-size: 12px; font-weight: 600; white-space: nowrap; }
.stk-total b { font-size: 30px; font-variant-numeric: tabular-nums; color: var(--ink); }
.stk-total span { font-size: 13px; color: var(--ink-soft); }
.stk-card ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.stk-batch { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.stk-batch:last-child { border-bottom: none; }
.stk-empty { opacity: .5; }
.stk-exp { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.stk-qty { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums; }
.stk-edit { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; opacity: .6; }
.stk-edit:hover { opacity: 1; }
.stk-editing { flex-wrap: wrap; background: var(--paper); border-radius: 10px; padding: 10px; }
.stk-card label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ink-soft); flex: 1; min-width: 110px; }
.stk-card input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
.stk-actions { display: flex; gap: 8px; width: 100%; }
.stk-err { color: var(--rust); font-size: 12px; margin: 0; width: 100%; }
.stk-add { border: 2px dashed var(--line); background: transparent; align-items: center; justify-content: center; min-height: 160px; cursor: pointer; font: inherit; font-weight: 600; color: var(--clay); }
.stk-add span { font-size: 28px; }
.stk-add:hover { background: var(--clay-tint); }
@media (max-width: 700px) { .stk-stats { grid-template-columns: repeat(2, 1fr); } .stk-stats b { font-size: 22px; } }
`
