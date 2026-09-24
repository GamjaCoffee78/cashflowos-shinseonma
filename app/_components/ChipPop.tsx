'use client'

import { useState, type ReactNode } from 'react'

// Hover (or tap) a calendar chip → a card with the WHOLE item: full text,
// channels / customer tag, day and status. Positioned `fixed` from the chip's
// own box, because the calendar cells clip anything that overflows them.
export default function ChipPop({
  children, title, tag, when, status,
}: {
  children: ReactNode   // the chip itself
  title: string
  tag: string | null
  when: string
  status: string
}) {
  const [box, setBox] = useState<DOMRect | null>(null)
  const show = (e: { currentTarget: HTMLElement }) => setBox(e.currentTarget.getBoundingClientRect())
  const hide = () => setBox(null)

  // Below the chip, unless it would run off the bottom of the screen.
  const W = 300
  const style = box
    ? {
        left: Math.max(8, Math.min(box.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 8)),
        ...(typeof window !== 'undefined' && box.bottom + 160 > window.innerHeight
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
      onClick={e => (box ? hide() : show(e))}
    >
      {children}
      {box ? (
        <span className="pt-pop" role="tooltip" style={style}>
          {tag ? <span className="pt-pop-tag">{tag}</span> : null}
          <span className="pt-pop-title">{title}</span>
          <span className="pt-pop-meta">{when} · {status}</span>
        </span>
      ) : null}
    </span>
  )
}
