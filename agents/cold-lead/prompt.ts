// 🎯 SUGGEST — the words the Head of Sales drafts.
//
// Voice (the owner's answer): warm + casual Malaysian English. Short enough to
// send as-is, low-pressure, never a hard close. This is a DRAFT — it lands in
// Telegram with Approve/Reject and on the Approvals tab. A human presses send.

import type { Rec } from '@/lib/records'
import { rm } from '@/lib/records'
import { lastTouch, daysQuiet } from './definition'

// Their first name — "Aisyah Rahman — 3 tier cake" → "Aisyah". Leads get typed
// in fast and messy, so strip anything after a dash/comma/bracket first.
function firstName(title: string): string {
  const clean = (title || '').split(/[—\-,(|]/)[0].trim()
  return clean.split(/\s+/)[0] || 'there'
}

// What they were last talking about, if the row records it. Used to make the
// nudge specific — a specific draft is one you can send without editing.
function topic(row: Rec): string {
  const t = row.meta?.topic || row.meta?.interest || row.meta?.product || row.meta?.note
  return typeof t === 'string' && t.trim() ? t.trim() : ''
}

export function suggest(row: Rec): string {
  const today = new Date().toISOString().slice(0, 10)
  const name = firstName(row.title)
  const quiet = daysQuiet(row, today)
  const about = topic(row)
  const value = row.amount > 0 ? rm(row.amount) : null

  // The message itself — this is the bit that gets copied into WhatsApp/DM.
  const message =
    `Hi ${name}! 😊 Just checking in` +
    (about ? ` on the ${about}` : '') +
    ` — still keen ah? No rush at all, just didn't want to leave you hanging. ` +
    `Any questions, just let me know and I'll sort it out for you!`

  // The wrapper the human reads before deciding. Context above, draft below.
  return (
    `🎯 ${row.title}${value ? ` · ${value}` : ''}\n` +
    `Quiet ${quiet} days (last touch ${lastTouch(row) || 'unknown'}` +
    `${row.status ? `, stage: ${row.status}` : ''})\n\n` +
    `— draft to send —\n${message}\n\n` +
    `You press send — I never message a lead myself.`
  )
}
