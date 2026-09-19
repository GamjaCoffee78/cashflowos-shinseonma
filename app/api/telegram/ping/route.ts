import { ABANG, abangName } from '@/abang/config'

// Is the robot awake? A one-call health check.
//
// Hits Telegram directly (not lib/telegram's sendMessage, which swallows errors)
// so the JSON it returns tells you WHICH recipient got it and WHY one didn't.
// It reads nothing from the database and writes nothing — it only says hello.
//
// AUTH FAILS CLOSED, same Bearer as the daily cron: no CRON_SECRET set ⇒ 401 to
// everyone. This endpoint can make the bot speak, so it is never open.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/telegram/ping
//
// Optional ?text=... replaces the default greeting (handy for testing a real
// message). Keep it short — it goes straight to your Telegram.

export const dynamic = 'force-dynamic'
export const maxDuration = 15

// Who receives the ping: the team ids, or OWNER_CHAT_ID as the solo fallback.
// Same rule the daily brief uses, so a green ping means the brief can land too.
function recipients(): string[] {
  // A chat list pinned in code (abang/config.ts → briefChatIds) wins outright.
  // That is how the owner moves the brief off their private chat and onto a
  // team group without touching Vercel. Empty = fall through to the env vars.
  const pinned = ABANG.briefChatIds
    .map((s) => String(s).trim())
    .filter((s) => /^-?\d+$/.test(s))
  const team = (process.env.TELEGRAM_TEAM_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
  const list = pinned.length
    ? pinned
    : team.length
      ? team
      : ([process.env.OWNER_CHAT_ID?.trim()].filter(Boolean) as string[])
  // Plus anyone listed in code (abang/config.ts) — the deputy's way in.
  const extra = ABANG.briefRecipients.map((s) => String(s).trim()).filter((s) => /^-?\d+$/.test(s))
  return Array.from(new Set([...list, ...extra]))
}

export async function GET(req: Request) {
  // ---- FAIL-CLOSED Bearer. Unset secret ⇒ 401 (never open). ----
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) {
    return Response.json(
      { ok: false, reason: 'TELEGRAM_BOT_TOKEN is not set — the bot has no voice yet.' },
      { status: 503 },
    )
  }

  const chats = recipients()
  if (!chats.length) {
    return Response.json(
      { ok: false, reason: 'No recipients — set TELEGRAM_TEAM_CHAT_IDS or OWNER_CHAT_ID.' },
      { status: 503 },
    )
  }

  const custom = new URL(req.url).searchParams.get('text')?.trim()
  const stamp = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const text = custom || `${abangName} here — awake and listening. (${stamp} MYT)`

  // One send per recipient; one slow chat must not hide the others' results.
  const sent = await Promise.all(
    chats.map(async (chat_id) => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
        })
        const body = await res.json().catch(() => ({} as any))
        return body?.ok
          ? { chat_id, ok: true }
          : { chat_id, ok: false, error: body?.description || `HTTP ${res.status}` }
      } catch (e) {
        return { chat_id, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )

  const allOk = sent.every((r) => r.ok)
  return Response.json({ ok: allOk, text, sent }, { status: allOk ? 200 : 502 })
}
