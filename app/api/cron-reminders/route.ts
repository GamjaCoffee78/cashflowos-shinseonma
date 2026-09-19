import { getRecords, todayISO, todayWeekday, BUSINESS_TZ, type Rec } from '@/lib/records'
import { sendMessage } from '@/lib/telegram'

// 🔒 Don't edit — this keeps your robot safe.
// THE SECOND daily cron (Vercel Hobby allows 2 — this is the reserved slot).
// It runs EARLY (08:00 in your business timezone) and does exactly ONE thing:
//   texts you the tasks that are due TODAY, before the day starts.
//
// Why a separate cron from /api/cron-daily: the morning brief runs at 09:00 local
// and is about the whole business (funnel + money + what needs your YES). A
// reminder about a 09:00 appointment has to arrive BEFORE it, so it gets its own,
// earlier slot. This route is READ-ONLY: it creates no proposals, spends no AI
// credit, executes nothing. It only reads `records` and sends a message.
//
// AUTH FAILS CLOSED: same Bearer as the daily cron. No CRON_SECRET set ⇒ 401 to
// everyone. Vercel Cron sends the header automatically once the env var is set.

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Who gets the reminder: the team ids if set, else OWNER_CHAT_ID. None = no-op.
// (Mirrors the daily cron's recipients() — the locked brief file stays untouched.)
function recipients(): string[] {
  const team = (process.env.TELEGRAM_TEAM_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
  const list = team.length
    ? team
    : ([process.env.OWNER_CHAT_ID?.trim()].filter(Boolean) as string[])
  return Array.from(new Set(list))
}

const isDone = (r: Rec) => (r.status || '').toLowerCase() === 'done'

export async function GET(req: Request) {
  // ---- FAIL-CLOSED Bearer. Unset secret ⇒ 401 (never open). ----
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  // todayISO() is timezone-aware (Asia/Kuala_Lumpur by default), so at 00:00 UTC
  // — 08:00 local — "today" is already the new local day, not yesterday.
  const today = todayISO()
  const rows = await getRecords()

  const tasks = rows.filter((r) => r.category === 'task' && !isDone(r))
  const dueToday = tasks.filter((r) => r.due_date === today)
  const overdue = tasks.filter((r) => !!r.due_date && r.due_date! < today)

  // Nothing on today: stay quiet. A reminder bot that pings you on empty days
  // is a reminder bot you learn to ignore.
  if (dueToday.length === 0) {
    return Response.json({ ok: true, sent: 0, due_today: 0, overdue: overdue.length, quiet: true })
  }

  const to = recipients()
  const text = buildReminder(dueToday, overdue)
  const sends = await Promise.allSettled(to.map((id) => sendMessage(id, text)))
  const sent = sends.filter((r) => r.status === 'fulfilled').length

  return Response.json({
    ok: true,
    sent,
    recipients: to.length,
    due_today: dueToday.length,
    overdue: overdue.length,
  })
}

// The reminder text. Deterministic, no AI key needed — a reminder that depends on
// an API key is a reminder that silently stops working the day the credit runs out.
function buildReminder(dueToday: Rec[], overdue: Rec[]): string {
  const line = (r: Rec) => {
    // meta.time ("9:00am") and meta.with ("Kingsley") are optional garnish — a task
    // added with neither still reads fine.
    const at = r.meta?.time ? `<b>${esc(String(r.meta.time))}</b> · ` : ''
    const who = r.meta?.with ? ` · with ${esc(String(r.meta.with))}` : ''
    const where = r.meta?.location ? ` · ${esc(String(r.meta.location))}` : ''
    return `• ${at}${esc(r.title)}${who}${where}`
  }

  let msg =
    `⏰ <b>Today — ${todayWeekday()}</b>\n` +
    `<i>Your 8am heads-up (${BUSINESS_TZ}).</i>\n\n` +
    dueToday.map(line).join('\n')

  if (overdue.length) {
    msg += `\n\n🔴 <b>${overdue.length}</b> still overdue:\n${overdue.slice(0, 3).map(line).join('\n')}`
    if (overdue.length > 3) msg += `\n…and ${overdue.length - 3} more`
  }

  return msg
}

// Task titles are user data, and this message is sent with parse_mode HTML — an
// unescaped "<" in a title would break the send (or worse, inject markup).
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
