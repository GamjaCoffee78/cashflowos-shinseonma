'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { syncEverything, type SyncAllResult } from '../_actions/sync'

// 🔄 Sync now — the one button that refreshes the whole app.
//
// Sits in the header of every tab (app/layout.tsx). One press pulls the live
// sources (TikTok Ads today) and makes every tab re-read the database, then
// router.refresh() repaints the page you're standing on with the new numbers.
//
// It never sends a Telegram message and never creates a proposal — it only
// fetches and refreshes, so it's always safe to press twice.
//
// Hidden on /login: that page renders inside this same layout but nobody there
// has passed the passcode yet, so the button would have nothing to sync.
export default function SyncAll() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<SyncAllResult | null>(null)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const path = usePathname()

  const run = () =>
    start(async () => {
      const r = await syncEverything()
      setResult(r)
      setOpen(true)
      router.refresh()
    })

  if (path === '/login') return null

  const when = result
    ? new Date(result.at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="syncbar">
      <button type="button" className="btn" disabled={pending} onClick={run} aria-busy={pending}>
        {pending ? 'Syncing…' : '🔄 Sync now'}
      </button>
      <span className="cap" role="status" aria-live="polite">
        {pending
          ? 'Pulling your latest numbers — the first TikTok run fetches 90 days, give it a moment.'
          : result
            ? `${result.ok ? '✅' : '⚠️'} Synced at ${when}.`
            : 'Updates every tab in one click.'}
      </span>
      {!pending && result && (
        <button type="button" className="linkish" onClick={() => setOpen(o => !o)}>
          {open ? 'Hide details' : 'Details'}
        </button>
      )}
      {!pending && result && open && (
        <ul className="synclist">
          {result.steps.map(s => (
            <li key={s.key} className={s.ok ? '' : 'bad'}>
              <b>{s.ok ? '✅' : '⚠️'} {s.label}</b> — {s.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
