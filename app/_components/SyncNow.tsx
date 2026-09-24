'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

// The "Sync now" button, shared by the tabs that copy an outside source into
// `records` (TikTok Ads, Meta Ads, Calendar). It POSTs to /api/sync, which
// runs the pull on the server with Vercel's keys and answers in plain JSON,
// then refreshes the page so the new rows show. (A plain route, not a server
// action — server actions were returning bare 500s on the live deployment.)
export type SyncResult = { ok: boolean; message: string }

export default function SyncNow({
  source,
  label,
  hint,
  region,
}: {
  source: 'tiktok' | 'meta' | 'calendar' | 'shopee' | 'tiktok_shop'
  label: ReactNode       // "🎯 Sync now", or an icon + text
  hint: string           // shown while it runs
  region?: string        // Shopee: sync only this shop
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<SyncResult | null>(null)

  async function run() {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, region }),
      })
      const body = await res.json().catch(() => null)
      if (!body) return setResult({ ok: false, message: `The server answered HTTP ${res.status} with no details.` })
      setResult(body)
      if (body.ok) router.refresh()
    } catch (e) {
      setResult({ ok: false, message: `Couldn't reach the server (${String((e as Error)?.message || e)}).` })
    }
  }

  return (
    <div className="tt-sync">
      <button type="button" className="btn sync" disabled={pending} onClick={() => start(run)}>
        {pending ? 'Syncing…' : label}
      </button>
      {pending && <span className="cap"> {hint}</span>}
      {!pending && result && (
        <span className="cap" role="status"> {result.ok ? '✅' : '⚠️'} {result.message}</span>
      )}
    </div>
  )
}
