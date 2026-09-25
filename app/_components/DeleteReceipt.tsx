'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

// 🗑 on a Cash Out row the Telegram bot filed. Confirm, then /api/receipts.
export default function DeleteReceipt({ id, title }: { id: number; title: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" className="bl-del" title="Delete this receipt" aria-label={`Delete ${title}`} disabled={pending} onClick={() => {
      if (!confirm(`Delete "${title}"?\n\nIt was filed from a Telegram receipt. The row and its stored receipt are removed — this can't be undone.`)) return
      start(async () => {
        const res = await fetch('/api/receipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) })
        const r = await res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }))
        if (!r.ok) alert(r.message)
        router.refresh()
      })
    }}>🗑</button>
  )
}
