'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// The buttons on the Production Timeline. Each POSTs to /api/production and
// refreshes the page. (A plain route, not a server action — see SyncNow.tsx.)
async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// ✓ Done / Undo, and 📅 Move to another date — one row's controls.
export function ItemActions({ id, done, date }: { id: number; done: boolean; date: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [moving, setMoving] = useState(false)
  const [newDate, setNewDate] = useState(date)
  const [err, setErr] = useState('')

  const run = (body: object) =>
    start(async () => {
      const r = await post(body)
      if (!r.ok) return setErr(r.message)
      setErr('')
      setMoving(false)
      router.refresh()
    })

  return (
    <span className="pt-act">
      <button
        type="button"
        className={`pt-btn${done ? ' on' : ''}`}
        disabled={pending}
        onClick={() => run({ action: done ? 'undo' : 'done', id })}
        title={done ? 'Mark as not done' : 'Mark as done'}
      >
        {done ? '✓ Done' : '✓ Mark done'}
      </button>
      {!done && !moving ? (
        <button type="button" className="pt-btn" disabled={pending} onClick={() => setMoving(true)}>
          📅 Move
        </button>
      ) : null}
      {moving ? (
        <span className="pt-move">
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} aria-label="New date" />
          <button type="button" className="pt-btn on" disabled={pending || !newDate} onClick={() => run({ action: 'move', id, date: newDate })}>
            Save
          </button>
          <button type="button" className="pt-btn" onClick={() => setMoving(false)}>Cancel</button>
        </span>
      ) : null}
      {pending ? <span className="cap"> saving…</span> : null}
      {err ? <span className="cap" role="alert"> ⚠️ {err}</span> : null}
    </span>
  )
}

// ＋ New task — a name and a date.
export function AddTask({ defaultDate }: { defaultDate: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [msg, setMsg] = useState('')

  if (!open) {
    return (
      <button type="button" className="btn sync" onClick={() => setOpen(true)}>＋ New task</button>
    )
  }
  return (
    <form
      className="pt-add"
      onSubmit={e => {
        e.preventDefault()
        start(async () => {
          const r = await post({ action: 'add', title, date })
          if (!r.ok) return setMsg(r.message)
          setMsg('')
          setTitle('')
          setOpen(false)
          router.push(`/production?m=${date.slice(0, 7)}`)
          router.refresh()
        })
      }}
    >
      <input
        type="text"
        placeholder="e.g. [FM Order] Pack 200 tofu paste"
        value={title}
        onChange={e => setTitle(e.target.value)}
        aria-label="Task"
        autoFocus
        required
      />
      <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" required />
      <button type="submit" className="btn sync" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      {msg ? <span className="cap" role="alert">⚠️ {msg}</span> : null}
    </form>
  )
}
