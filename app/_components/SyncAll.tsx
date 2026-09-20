'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { SyncAllResult } from '@/lib/sync-all'
import PrivateEyes from './PrivateEyes'

// 🔄 Sync now — the one button that refreshes the whole app.
//
// Sits in the header of every tab (app/layout.tsx). One press pulls the live
// sources (TikTok Ads today) and makes every tab re-read the database, then
// router.refresh() repaints the page you're standing on with the new numbers.
//
// It never sends a Telegram message and never creates a proposal — it only
// fetches and refreshes, so it's always safe to press twice.
//
// It POSTs to /api/sync like the per-tab buttons do. NOT a server action:
// those were answering with bare 500s on the live deployment, which showed the
// user a blank error page instead of what went wrong.
//
// Hidden on /login: that page renders inside this same layout but nobody there
// has passed the passcode yet, so the button would have nothing to sync.
export default function SyncAll() {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<SyncAllResult | null>(null)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const path = usePathname()

  const [failed, setFailed] = useState('')

  const run = () =>
    start(async () => {
      setFailed('')
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'all' }),
        })
        const body = await res.json().catch(() => null)
        if (!body?.steps) {
          setFailed(`The server answered HTTP ${res.status} with no details.`)
          return
        }
        setResult(body as SyncAllResult)
        setOpen(true)
        router.refresh()
      } catch (e) {
        setFailed(`Couldn't reach the server (${String((e as Error)?.message || e)}).`)
      }
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
      <PrivateEyes />
      <span className="cap" role="status" aria-live="polite">
        {pending
          ? 'Pulling your latest numbers — the first TikTok run fetches 90 days, give it a moment.'
          : failed
            ? `⚠️ ${failed}`
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
