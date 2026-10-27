'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// One Halal status row's controls: 📅 a renewed certificate's new expiry, and
// the "renewal in progress" toggle. Each POSTs to /api/halal and refreshes.
async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/halal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

export default function HalalActions({ productKey, expiry, renewing }: { productKey: string; expiry: string; renewing: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(expiry)
  const [err, setErr] = useState('')

  const run = (body: object) =>
    start(async () => {
      const r = await post({ key: productKey, ...body })
      if (!r.ok) return setErr(r.message)
      setErr('')
      setEditing(false)
      router.refresh()
    })

  if (editing) {
    return (
      <span className="pt-act">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="New expiry date" autoFocus />
        <button type="button" className="pt-btn on" disabled={pending || !date} onClick={() => run({ action: 'expiry', date })}>Save</button>
        <button type="button" className="pt-btn" onClick={() => { setDate(expiry); setErr(''); setEditing(false) }}>Cancel</button>
        {pending ? <span className="cap"> saving…</span> : null}
        {err ? <span className="cap" role="alert"> ⚠️ {err}</span> : null}
      </span>
    )
  }

  return (
    <span className="pt-act">
      <button type="button" className="pt-btn" disabled={pending} onClick={() => setEditing(true)}>📅 New expiry</button>
      <button type="button" className={`pt-btn${renewing ? ' on' : ''}`} disabled={pending} onClick={() => run({ action: 'renewing', on: !renewing })}>
        {renewing ? '✓ Renewal submitted' : 'Renewal submitted?'}
      </button>
      {pending ? <span className="cap"> saving…</span> : null}
      {err ? <span className="cap" role="alert"> ⚠️ {err}</span> : null}
    </span>
  )
}
