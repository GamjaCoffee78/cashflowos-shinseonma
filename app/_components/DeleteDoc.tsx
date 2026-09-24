'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

// The 🗑 on a row of the Billing list. Same rules as the document page:
// drafts delete after a confirm, issued documents ask for their number.
export default function DeleteDoc({ id, number, draft }: { id: number; number: string; draft: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" className="bl-del" title={`Delete ${number}`} aria-label={`Delete ${number}`} disabled={pending} onClick={() => {
      const ok = draft
        ? confirm(`Delete draft ${number}? This can't be undone.`)
        : prompt(`Delete ${number} for good? This can't be undone.\n\nType ${number} to confirm:`)?.trim().toUpperCase() === number
      if (!ok) return
      start(async () => {
        const res = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) })
        const r = await res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }))
        if (!r.ok) alert(r.message)
        router.refresh()
      })
    }}>🗑</button>
  )
}
