'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { StockCount, StockBatch } from '@/lib/stock-sheet'

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// "Dec-2026" → months from now (negative = expired). null if not a date.
function monthsLeft(exp: string): number | null {
  const m = /^([A-Za-z]{3})[-\s/]?(\d{2}|\d{4})$/.exec(exp.trim())
  if (!m) return null
  const mi = MON.indexOf(m[1].toLowerCase())
  if (mi < 0) return null
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  const now = new Date()
  return (y - now.getFullYear()) * 12 + (mi - now.getMonth())
}

function Qty({ b }: { b: StockBatch }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(b.raw.replace(/,/g, ''))
  const [msg, setMsg] = useState('')

  async function save() {
    setMsg('')
    const res = await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row: b.row, qty: val, expected: b.raw }),
    }).then(r => r.json()).catch(e => ({ ok: false, message: String(e) }))
    setMsg(res.message)
    if (res.ok) { setEditing(false); start(() => router.refresh()) }
  }

  if (!editing) {
    return (
      <button className="btn-link" onClick={() => setEditing(true)} title="Edit — saves into the sheet" style={{ fontWeight: 600 }}>
        {b.qty === null ? '—' : b.qty.toLocaleString()} ✏️
        {msg ? <small style={{ display: 'block', fontWeight: 400 }}>{msg}</small> : null}
      </button>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="number" min={0} inputMode="numeric" value={val} autoFocus onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} style={{ width: 90 }} />
      <button onClick={save} disabled={pending}>Save</button>
      <button onClick={() => { setEditing(false); setVal(b.raw.replace(/,/g, '')); setMsg('') }}>Cancel</button>
      {msg ? <small style={{ width: '100%' }}>{msg}</small> : null}
    </span>
  )
}

export default function StockView({ data }: { data: StockCount }) {
  const prev = data.asOf.length > 1 ? data.asOf.length - 2 : -1
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Product</th>
            <th style={{ textAlign: 'left' }}>Expiry</th>
            <th style={{ textAlign: 'right' }}>Qty ({data.latest})</th>
            {prev >= 0 ? <th style={{ textAlign: 'right' }}>Change vs {data.asOf[prev]}</th> : null}
            <th style={{ textAlign: 'right' }}>Product total</th>
          </tr>
        </thead>
        <tbody>
          {data.products.map(p => p.batches.map((b, i) => {
            const left = monthsLeft(b.expiry)
            const warn = left !== null && (b.qty ?? 0) > 0 && left <= 3
            const before = prev >= 0 ? b.history[prev]?.qty : null
            const diff = before !== null && before !== undefined && b.qty !== null ? b.qty - before : null
            return (
              <tr key={b.row} style={i === 0 ? { borderTop: '1px solid var(--line, #ddd)' } : undefined}>
                <td>{i === 0 ? <b>{p.no ? `${p.no}. ` : ''}{p.name}</b> : null}</td>
                <td>{b.expiry || '—'}{warn ? <span title="Expires within 3 months"> ⚠️</span> : null}</td>
                <td style={{ textAlign: 'right' }}><Qty b={b} /></td>
                {prev >= 0 ? <td style={{ textAlign: 'right', opacity: 0.75 }}>{diff === null ? '' : diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}</td> : null}
                <td style={{ textAlign: 'right' }}>{i === 0 ? <b>{p.total.toLocaleString()}</b> : null}</td>
              </tr>
            )
          }))}
        </tbody>
      </table>
    </div>
  )
}
