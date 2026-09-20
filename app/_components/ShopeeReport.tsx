'use client'

import { useState, useTransition } from 'react'

// "Shopee report" button on the Head of Sales card. Read-only — it totals rows
// and shows the answer. Nothing is written, so there's nothing to approve.

type Report = {
  ok: boolean
  label?: string
  orders?: number
  gross?: number
  net?: number
  fees?: number
  partial?: boolean
  message: string
}

const rm = (n: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(n)

export default function ShopeeReport() {
  const [pending, start] = useTransition()
  const [data, setData] = useState<Report | null>(null)
  const [month, setMonth] = useState('')

  async function run() {
    try {
      const res = await fetch('/api/agents/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: 'shopee', month }),
      })
      const body = await res.json().catch(() => null)
      setData(body || { ok: false, message: `The server answered HTTP ${res.status}.` })
    } catch (e) {
      setData({ ok: false, message: `Couldn't reach the server (${String((e as Error)?.message || e)}).` })
    }
  }

  return (
    <div className="tt-sync">
      <input
        type="text"
        value={month}
        onChange={e => setMonth(e.target.value)}
        placeholder="month (blank = last full month)"
        aria-label="Which month to report"
        style={{ marginRight: 8, padding: '6px 8px' }}
      />
      <button type="button" className="btn sync" disabled={pending} onClick={() => start(run)}>
        {pending ? 'Adding it up…' : '🛍️ Shopee report'}
      </button>

      {!pending && data && !data.ok && (
        <span className="cap" role="status"> ⚠️ {data.message}</span>
      )}

      {!pending && data?.ok && (
        <div className="cap" role="status" style={{ marginTop: 6 }}>
          {data.orders === 0 ? (
            <>No Shopee orders found for <b>{data.label}</b>. That export may not be imported yet.</>
          ) : (
            <>
              <b>Shopee — {data.label}</b>{data.partial ? ' (month still running)' : ''}<br />
              Orders: <b>{data.orders}</b><br />
              Buyers paid: <b>{rm(data.gross || 0)}</b><br />
              You received: <b>{rm(data.net || 0)}</b><br />
              Shopee fees: {rm(data.fees || 0)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
