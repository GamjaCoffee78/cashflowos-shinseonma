'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { emptyItem, money, type Item, type ItemSuggestion } from '@/lib/billing-shared'

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// The Items list: add / edit / delete, plus "From your sales" to add the
// products found in Shopee / TikTok orders in one go.
export default function ItemsManager({ items, suggestions }: { items: Item[]; suggestions: ItemSuggestion[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [edit, setEdit] = useState<Item | null>(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggestions.map(s => s.name)))

  const run = (body: object, after?: () => void) => start(async () => {
    const r = await post(body)
    setMsg(r.message)
    if (r.ok) { after?.(); router.refresh() }
  })
  const set = (k: keyof Item, v: string) => setEdit(e => e && ({ ...e, [k]: k === 'price' || k === 'cost' ? Number(v) : v }))
  const toggle = (name: string) => setPicked(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n })

  const needle = q.trim().toLowerCase()
  const shown = items.filter(i => !needle || `${i.code} ${i.name}`.toLowerCase().includes(needle))

  return (
    <div className="bc">
      <div className="bl-filter">
        <input className="bl-input" style={{ marginLeft: 0 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" />
        <button type="button" className="btn" onClick={() => { setMsg(''); setEdit(emptyItem()) }}>+ New item</button>
      </div>
      {msg ? <p className="bl-msg" style={{ textAlign: 'left' }}>{msg}</p> : null}

      {edit ? (
        <section className="bf-card bc-form">
          <h3>{edit.id ? `Edit ${edit.name}` : 'New item'}</h3>
          <div className="bf-grid bf">
            <label>Code (optional)<input value={edit.code} onChange={e => set('code', e.target.value)} placeholder="e.g. LB-A" /></label>
            <label className="bf-wide">Name<input value={edit.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Lunch Box Set A" /></label>
            <label>Unit<input value={edit.uom} onChange={e => set('uom', e.target.value)} placeholder="PKT / CTN / BTL / UNIT" /></label>
            <label>Selling price (RM)<input type="number" step="0.01" min={0} value={edit.price} onChange={e => set('price', e.target.value)} /></label>
            <label>Cost price (RM, not printed)<input type="number" step="0.01" min={0} value={edit.cost} onChange={e => set('cost', e.target.value)} /></label>
            <label className="bf-wide">Notes (not printed)<input value={edit.notes} onChange={e => set('notes', e.target.value)} /></label>
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={pending} onClick={() => run({ action: 'item_save', ...edit }, () => setEdit(null))}>Save item</button>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <p className="cap">{items.length ? 'No match.' : 'No items saved yet — add one, or pick from your sales below.'}</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Item</th><th>Unit</th><th>Price</th><th>Margin</th><th /></tr></thead>
          <tbody>
            {shown.map(i => (
              <tr key={i.id}>
                <td data-label="Item">{i.code ? <small className="bl-dim">{i.code} · </small> : null}<b>{i.name}</b></td>
                <td data-label="Unit">{i.uom}</td>
                <td data-label="Price">{money(i.price)}</td>
                <td data-label="Margin">{i.cost > 0 && i.price > 0 ? `${Math.round((1 - i.cost / i.price) * 100)}%` : '—'}</td>
                <td data-label="">
                  <span className="bc-acts">
                    <button type="button" className="btn ghost" onClick={() => { setMsg(''); setEdit({ ...i }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                    <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => confirm(`Delete ${i.name}? Documents already made are not affected.`) && run({ action: 'item_delete', id: i.id })}>🗑 Delete</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {suggestions.length ? (
        <section className="bf-card" style={{ marginTop: 20 }}>
          <h3>From your sales — {suggestions.length} product{suggestions.length === 1 ? '' : 's'} not saved yet</h3>
          <p className="cap" style={{ margin: '0 0 10px' }}>Found in your Shopee / TikTok orders. The price is the latest selling price there; you can edit each one after adding.</p>
          <div className="btnrow" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={pending || picked.size === 0} onClick={() => run({
              action: 'items_import',
              items: suggestions.filter(s => picked.has(s.name)).map(s => ({ name: s.name, uom: 'UNIT', price: s.currency === 'MYR' ? s.price : 0, notes: `From ${s.from}` })),
            })}>Add {picked.size} selected</button>
            <button type="button" className="btn ghost" onClick={() => setPicked(new Set(suggestions.map(s => s.name)))}>Select all</button>
            <button type="button" className="btn ghost" onClick={() => setPicked(new Set())}>Select none</button>
          </div>
          <table className="tbl">
            <thead><tr><th /><th>Product</th><th>Latest price</th><th>Sold</th><th>Where</th></tr></thead>
            <tbody>
              {suggestions.map(s => (
                <tr key={s.name} onClick={() => toggle(s.name)} style={{ cursor: 'pointer' }}>
                  <td data-label=""><input type="checkbox" checked={picked.has(s.name)} readOnly /></td>
                  <td data-label="Product">{s.name}</td>
                  <td data-label="Latest price">{s.currency === 'MYR' ? money(s.price) : `${s.currency} ${s.price.toFixed(2)} (set RM price after)`}</td>
                  <td data-label="Sold">{s.sold.toLocaleString()}</td>
                  <td data-label="Where">{s.from}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  )
}
