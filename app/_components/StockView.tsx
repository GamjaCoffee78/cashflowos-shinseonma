'use client'

import { createContext, useContext, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { StockCount, StockBatch, StockProduct, Undo } from '@/lib/stock-sheet'

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

// Alert thresholds (owners' choice, 2026-09-29): a product under LOW_STOCK units
// in total, and a batch expiring in under EXPIRY_MONTHS months.
const LOW_STOCK = 1000
const EXPIRY_MONTHS = 8
type Tone = 'ok' | 'soon' | 'urgent' | 'none'
function tone(b: StockBatch): Tone {
  const left = monthsLeft(b.expiry)
  if (left === null || !(b.qty && b.qty > 0)) return 'none'
  return left <= 3 ? 'urgent' : left < EXPIRY_MONTHS ? 'soon' : 'ok'
}
const TONE: Record<Tone, { bg: string; fg: string; label: string }> = {
  ok: { bg: 'rgba(75,122,90,.12)', fg: 'var(--sage)', label: '' },
  soon: { bg: 'rgba(182,128,42,.15)', fg: 'var(--honey)', label: `in under ${EXPIRY_MONTHS} months` },
  urgent: { bg: 'rgba(194,48,42,.12)', fg: 'var(--rust)', label: 'within 3 months' },
  none: { bg: 'var(--paper)', fg: 'var(--ink-soft)', label: '' },
}

// After every save, the bar at the bottom says what was saved and offers ↩ Undo.
type Saved = (message: string, undo?: Undo) => void
const SavedCtx = createContext<Saved>(() => {})
// Where saves go: /api/stock for the team, /share/stock/<token>/save for the share link.
let ENDPOINT = '/api/stock'

async function post(body: object): Promise<{ ok: boolean; message: string; undo?: Undo }> {
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await r.json().catch(() => null)) ?? { ok: false, message: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

function BatchRow({ b }: { b: StockBatch }) {
  const saved = useContext(SavedCtx)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [exp, setExp] = useState(toMonthInput(b.expiry))
  const [qty, setQty] = useState(b.rawQty.replace(/,/g, ''))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const t = TONE[tone(b)]

  async function save() {
    setBusy(true); setMsg('')
    const change: any = { action: 'edit', row: b.row, expected: { expiry: b.rawExpiry, qty: b.rawQty }, qty }
    if (exp !== toMonthInput(b.expiry)) change.expiry = exp
    const res = await post(change)
    setBusy(false)
    if (res.ok) { saved(res.message, res.undo); setEditing(false); start(() => router.refresh()) } else setMsg(res.message)
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
    <li className="stk-batch">
      <span className="stk-exp" style={{ background: t.bg, color: t.fg }} title={t.label ? `Expires ${t.label}` : undefined}>
        {b.expiry || 'No expiry'}
      </span>
      <span className="stk-qty">{b.qty === null ? '—' : fmt(b.qty)}</span>
      <button className="stk-edit" onClick={() => setEditing(true)} aria-label="Edit expiry and quantity">✏️</button>
    </li>
  )
}

function AddBatch({ row }: { row: number }) {
  const saved = useContext(SavedCtx)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [exp, setExp] = useState('')
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true); setMsg('')
    const res = await post({ action: 'add_batch', row, expiry: exp, qty })
    setBusy(false)
    if (res.ok) { saved(res.message, res.undo); setOpen(false); setExp(''); setQty(''); start(() => router.refresh()) } else setMsg(res.message)
  }

  if (!open) return <button className="stk-addbatch" onClick={() => setOpen(true)}>＋ Add expiry &amp; qty</button>
  return (
    <div className="stk-batch stk-editing">
      <label>Expiry<input type="month" value={exp} onChange={e => setExp(e.target.value)} autoFocus /></label>
      <label>Qty<input type="number" min={0} inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }} /></label>
      <div className="stk-actions">
        <button className="btn" onClick={save} disabled={busy || pending || !exp || qty === ''}>{busy ? 'Adding…' : 'Add'}</button>
        <button className="btn ghost" onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
      </div>
      {msg ? <p className="stk-err">{msg}</p> : null}
    </div>
  )
}

function ProductCard({ p }: { p: StockProduct & { row0: number } }) {
  const worst = p.batches.map(tone).find(x => x === 'urgent') ?? p.batches.map(tone).find(x => x === 'soon')
  const low = p.total < LOW_STOCK
  return (
    <article className={`stk-card${low ? ' stk-low' : worst ? ' stk-warn' : ''}`}>
      <header>
        <div>
          <span className="stk-no">{p.no || '•'}</span>
          <h3>{p.name}</h3>
        </div>
        <div className="stk-flags">
          {low ? <span className="stk-flag stk-flag-low">Low stock</span> : null}
          {worst ? <span className="stk-flag" style={{ background: TONE[worst].bg, color: TONE[worst].fg }}>Expiring soon</span> : null}
        </div>
      </header>
      <div className="stk-total">
        <b style={low ? { color: 'var(--rust)' } : undefined}>{fmt(p.total)}</b> <span>units{low ? ` · below ${fmt(LOW_STOCK)}` : ''}</span>
      </div>
      <ul>{p.batches.map(b => <BatchRow key={b.row} b={b} />)}</ul>
      <AddBatch row={p.row0} />
    </article>
  )
}

function AddProduct() {
  const saved = useContext(SavedCtx)
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
    if (res.ok) { saved(res.message, res.undo); setOpen(false); setName(''); setExp(''); setQty(''); start(() => router.refresh()) } else setMsg(res.message)
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

function UndoBar({ note, onClose }: { note: { message: string; undo?: Undo }; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(note.message)
  const [undo, setUndo] = useState(note.undo)
  async function doUndo() {
    if (!undo) return
    setBusy(true)
    const res = await post({ action: 'undo', undo })
    setBusy(false)
    setMsg(res.message)
    if (res.ok) { setUndo(undefined); start(() => router.refresh()) }
  }
  return (
    <div className="stk-toast" role="status">
      <span>{msg}</span>
      {undo ? <button className="btn" onClick={doUndo} disabled={busy || pending}>{busy ? 'Undoing…' : '↩ Undo'}</button> : null}
      <button className="stk-x" onClick={onClose} aria-label="Close">✕</button>
    </div>
  )
}

export default function StockView({ data, endpoint = '/api/stock', canAddProduct = true }: { data: StockCount; endpoint?: string; canAddProduct?: boolean }) {
  ENDPOINT = endpoint
  const [note, setNote] = useState<{ id: number; message: string; undo?: Undo } | null>(null)
  const saved: Saved = (message, undo) => setNote({ id: Date.now(), message, undo })
  // Only lines with stock are shown: blank and 0 quantities are hidden, and a
  // product with nothing left is hidden too. (They stay in the sheet.) row0 is
  // the product's first sheet row, which "add expiry" uses to find it.
  const products = data.products
    .map(p => ({ ...p, row0: p.batches[0].row, batches: p.batches.filter(b => (b.qty ?? 0) > 0) }))
    .filter(p => p.batches.length)
  const all = products.flatMap(p => p.batches)
  const units = products.reduce((s, p) => s + p.total, 0)
  const expiring = all.filter(b => tone(b) === 'urgent' || tone(b) === 'soon')
  const low = products.filter(p => p.total < LOW_STOCK)
  const expiringLines = products.flatMap(p => p.batches.filter(b => tone(b) === 'urgent' || tone(b) === 'soon').map(b => ({ p, b })))
  return (
    <SavedCtx.Provider value={saved}>
      <style>{CSS}</style>
      <section className="stk-stats">
        <div><span>Total units</span><b>{fmt(units)}</b></div>
        <div><span>Products in stock</span><b>{products.length}</b></div>
        <div><span>Expiring &lt; {EXPIRY_MONTHS} months</span><b style={{ color: expiring.length ? 'var(--honey)' : undefined }}>{fmt(expiring.reduce((s, b) => s + (b.qty ?? 0), 0))}</b><small>{expiring.length} batch{expiring.length === 1 ? '' : 'es'}</small></div>
        <div><span>Low stock (&lt; {fmt(LOW_STOCK)})</span><b style={{ color: low.length ? 'var(--rust)' : undefined }}>{low.length}</b><small>product{low.length === 1 ? '' : 's'}</small></div>
      </section>
      {low.length || expiringLines.length ? (
        <section className="stk-remind" role="alert">
          <b>🔔 Needs attention</b>
          <ul>
            {low.map(p => <li key={`l${p.row0}`}><span className="stk-dot" style={{ background: 'var(--rust)' }} />{p.name} — only <b>{fmt(p.total)}</b> left (below {fmt(LOW_STOCK)})</li>)}
            {expiringLines.map(({ p, b }) => <li key={`e${b.row}`}><span className="stk-dot" style={{ background: TONE[tone(b)].fg }} />{p.name} — <b>{fmt(b.qty ?? 0)}</b> expiring {b.expiry}</li>)}
          </ul>
        </section>
      ) : (
        <p className="cap">✅ All products have {fmt(LOW_STOCK)}+ units and nothing expires within {EXPIRY_MONTHS} months.</p>
      )}
      <p className="stk-legend">
        <span><i style={{ background: 'var(--rust)' }} />Low stock (under {fmt(LOW_STOCK)}) or expiring within 3 months</span>
        <span><i style={{ background: 'var(--honey)' }} />Expiring in under {EXPIRY_MONTHS} months</span>
        <span><i style={{ background: 'var(--sage)' }} />OK</span>
      </p>
      <section className="stk-grid">
        {products.map(p => <ProductCard key={p.row0} p={p} />)}
        {canAddProduct ? <AddProduct /> : null}
      </section>
      {note ? <UndoBar key={note.id} note={note} onClose={() => setNote(null)} /> : null}
    </SavedCtx.Provider>
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
.stk-flags { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.stk-flag { font-size: 11px; font-weight: 700; white-space: nowrap; padding: 3px 8px; border-radius: 999px; }
.stk-flag-low { background: rgba(194,48,42,.12); color: var(--rust); }
.stk-low { border: 2px solid var(--rust); background: linear-gradient(180deg, rgba(194,48,42,.05), var(--card) 40%); }
.stk-warn { border: 2px solid var(--honey); }
.stk-remind { background: rgba(194,48,42,.06); border: 1px solid rgba(194,48,42,.25); border-radius: 14px; padding: 12px 16px; margin: 0 0 14px; font-size: 14px; }
.stk-remind ul { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.stk-remind li { display: flex; align-items: center; gap: 8px; }
.stk-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.stk-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--ink-soft); margin: 0 0 12px; }
.stk-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.stk-total b { font-size: 30px; font-variant-numeric: tabular-nums; color: var(--ink); }
.stk-total span { font-size: 13px; color: var(--ink-soft); }
.stk-card ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.stk-batch { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.stk-batch:last-child { border-bottom: none; }
.stk-exp { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.stk-qty { margin-left: auto; font-weight: 700; font-variant-numeric: tabular-nums; }
.stk-edit { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; opacity: .6; }
.stk-edit:hover { opacity: 1; }
.stk-editing { flex-wrap: wrap; background: var(--paper); border-radius: 10px; padding: 10px; }
.stk-card label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ink-soft); flex: 1; min-width: 110px; }
.stk-card input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
.stk-actions { display: flex; gap: 8px; width: 100%; }
.stk-err { color: var(--rust); font-size: 12px; margin: 0; width: 100%; }
.stk-addbatch { align-self: flex-start; background: none; border: none; padding: 2px 0; font: inherit; font-size: 13px; font-weight: 600; color: var(--clay); cursor: pointer; }
.stk-addbatch:hover { text-decoration: underline; }
.stk-add { border: 2px dashed var(--line); background: transparent; align-items: center; justify-content: center; min-height: 160px; cursor: pointer; font: inherit; font-weight: 600; color: var(--clay); }
.stk-add span { font-size: 28px; }
.stk-add:hover { background: var(--clay-tint); }
.stk-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 90px; z-index: 50; display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 32px); background: var(--ink); color: #FFFDF9; padding: 10px 12px 10px 16px; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.2); font-size: 14px; }
.stk-toast .btn { background: #FFFDF9; color: var(--ink); padding: 7px 12px; white-space: nowrap; }
.stk-x { background: none; border: none; color: #FFFDF9; opacity: .7; cursor: pointer; font-size: 14px; }
@media (max-width: 700px) { .stk-stats { grid-template-columns: repeat(2, 1fr); } .stk-stats b { font-size: 22px; } }
`
