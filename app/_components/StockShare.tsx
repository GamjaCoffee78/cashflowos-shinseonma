'use client'

import { useState } from 'react'

// The "share with someone outside" box at the top of the Stock tab: one button
// that copies the stock-only link (lib/stock-share.ts).
export default function StockShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  if (!url) {
    return (
      <p className="cap" style={{ color: 'var(--rust)' }}>
        🔗 Share link unavailable: the app has no signing secret. Add <code>AUTH_SECRET</code> in Vercel → Settings → Environment Variables, then redeploy.
      </p>
    )
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copy this link:', url); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', margin: '12px 0 4px' }}>
      <span style={{ fontWeight: 600 }}>🔗 Share this page with someone outside</span>
      <button className="btn" onClick={copy}>{copied ? '✓ Link copied — paste it in WhatsApp' : 'Copy link'}</button>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open it</a>
      <small style={{ width: '100%', color: 'var(--ink-soft)' }}>They can open only this Stock page — no login, no other tabs — and edit it fully.</small>
    </div>
  )
}
