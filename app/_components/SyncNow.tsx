'use client'

import { useState, useTransition } from 'react'

// The "Sync now" button, shared by the tabs that copy an outside source into
// `records` (TikTok Ads, Meta Ads, Calendar). Pass the tab's server action;
// it runs on the server with Vercel's keys, so nothing is needed on a laptop.
export type SyncResult = { ok: true; message: string } | { ok: false; message: string }

export default function SyncNow({
  action,
  label,
  hint,
}: {
  action: () => Promise<SyncResult>
  label: string          // "🎯 Sync now"
  hint: string           // shown while it runs
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<SyncResult | null>(null)

  return (
    <div className="tt-sync">
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setResult(await action()))}>
        {pending ? 'Syncing…' : label}
      </button>
      {pending && <span className="cap"> {hint}</span>}
      {!pending && result && (
        <span className="cap" role="status"> {result.ok ? '✅' : '⚠️'} {result.message}</span>
      )}
    </div>
  )
}
