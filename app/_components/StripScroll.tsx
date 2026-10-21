'use client'
// ‹ › buttons that slide the month row sideways — a mouse wheel can't, and
// Macs hide the scrollbar. The row itself stays a server-rendered <nav>.
import { useRef, type ReactNode } from 'react'

export default function StripScroll({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const go = (dir: number) => {
    const el = box.current?.querySelector('nav')
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
  }
  return (
    <div className="pt-strip" ref={box}>
      <button type="button" className="pt-strip-btn" onClick={() => go(-1)} aria-label="Earlier months">‹</button>
      {children}
      <button type="button" className="pt-strip-btn" onClick={() => go(1)} aria-label="Later months">›</button>
    </div>
  )
}
