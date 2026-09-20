'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// The "Run now" button on an AI Employees card, for heads that are on-demand
// (manualOnly) rather than woken by the daily cron. POSTs to /api/agents/run,
// which creates PROPOSALS only — it can't execute or send anything, so the
// worst a stray press can do is put a draft in front of you.

export default function RunAgent({ agentKey, label }: { agentKey: string; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function run() {
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: agentKey }),
      })
      const body = await res.json().catch(() => null)
      if (!body) return setResult({ ok: false, message: `The server answered HTTP ${res.status}.` })
      setResult(body)
      if (body.ok) router.refresh()
    } catch (e) {
      setResult({ ok: false, message: `Couldn't reach the server (${String((e as Error)?.message || e)}).` })
    }
  }

  return (
    <div className="tt-sync">
      <button type="button" className="btn sync" disabled={pending} onClick={() => start(run)}>
        {pending ? 'Reading your leads…' : `▶️ ${label}`}
      </button>
      {!pending && result && (
        <span className="cap" role="status"> {result.ok ? '✅' : '⚠️'} {result.message}</span>
      )}
    </div>
  )
}
