'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

// Hover (or tap) a calendar chip → a card with the WHOLE item: full text,
// channels / customer tag, day and status. Positioned `fixed` from the chip's
// own box, because the calendar cells clip anything that overflows them.
// Tap / click pins the card open with ✓ Done and 🗑 Delete, so an item can be
// handled straight from the calendar (same /api/production actions as the list).
export default function ChipPop({
  children, title, tag, when, status, id, done,
}: {
  id?: number           // with an id, the pinned card shows Done / Delete
  done?: boolean
  children: ReactNode   // the chip itself
  title: string
  tag: string | null
  when: string
  status: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [box, setBox] = useState<DOMRect | null>(null)
  const [pinned, setPinned] = useState(false)
  const [err, setErr] = useState('')
  const show = (e: { currentTarget: HTMLElement }) => setBox(e.currentTarget.getBoundingClientRect())
  const hide = () => { if (!pinned) setBox(null) }
  const close = () => { setPinned(false); setBox(null); setErr('') }
  // A pinned card closes on a click anywhere else on the page.
  useEffect(() => {
    if (!pinned) return
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.pt-pop') && !t.closest('.pt-pop-anchor')) close()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [pinned])
  const act = (body: object) => start(async () => {
    try {
      const res = await fetch('/api/production', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      const r = await res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }))
      if (!r.ok) return setErr(r.message)
      if (String(r.message).includes('⚠️')) alert(r.message)
      close()
      router.refresh()
    } catch (e) { setErr(String((e as Error)?.message || e)) }
  })

  // Below the chip, unless it would run off the bottom of the screen.
  const W = 300
  const H = id ? 220 : 160
  const style = box
    ? {
        left: Math.max(8, Math.min(box.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 8)),
        ...(typeof window !== 'undefined' && box.bottom + H > window.innerHeight
          ? { bottom: window.innerHeight - box.top + 6 }
          : { top: box.bottom + 6 }),
        width: W,
      }
    : undefined

  return (
    <span
      className="pt-pop-anchor"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={e => {
        if ((e.target as HTMLElement).closest('.pt-pop')) return
        if (pinned) return close()
        show(e); setPinned(true)
      }}
    >
      {children}
      {/* Drawn on <body>, not inside the day cell: a faded (past) cell would
          fade the card too and let the next days show through it. */}
      {box && typeof document !== 'undefined' ? createPortal(
        <span className={`pt-pop${pinned ? ' pinned' : ''}`} role={pinned ? "dialog" : "tooltip"} style={style}>
          {tag ? <span className="pt-pop-tag">{tag}</span> : null}
          <span className="pt-pop-title">{title}</span>
          <span className="pt-pop-meta">{when} · {status}</span>
          {id && pinned ? (
            <span className="pt-pop-acts">
              <button type="button" className="pt-btn" disabled={pending} onClick={() => act({ action: done ? 'undo' : 'done' })}>{done ? '↺ Not done' : '✓ Done'}</button>
              <button type="button" className="pt-btn pt-del" disabled={pending} onClick={() => confirm(`Delete "${title}"?\n\nIt is also removed from the Google Sheet calendar.`) && act({ action: 'delete' })}>🗑 Delete</button>
              <button type="button" className="pt-btn" onClick={close}>Close</button>
            </span>
          ) : id && !pinned ? <span className="pt-pop-hint">Tap to Done or Delete</span> : null}
          {err ? <span className="pt-pop-meta" role="alert">⚠️ {err}</span> : null}
        </span>,
        document.body,
      ) : null}
    </span>
  )
}
