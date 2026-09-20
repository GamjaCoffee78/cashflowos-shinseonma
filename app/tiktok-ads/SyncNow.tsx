'use client'

import { useState, useTransition } from 'react'
import { syncTikTokNow, type SyncResult } from './actions'

// The "Sync now" button. Pulls TikTok days into `records` on demand instead of
// waiting for the 8:15am run. The first press backfills 90 days and can take
// half a minute; later presses only refresh the last few days.
export default function SyncNow() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<SyncResult | null>(null)

  return (
    <div className="tt-sync">
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => start(async () => setResult(await syncTikTokNow()))}
      >
        {pending ? 'Syncing…' : '🎯 Sync now'}
      </button>
      {pending && <span className="cap"> Asking TikTok — the first run pulls 90 days, give it a moment.</span>}
      {!pending && result && (
        <span className="cap" role="status"> {result.ok ? '✅' : '⚠️'} {result.message}</span>
      )}
    </div>
  )
}
