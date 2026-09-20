// Send ONE message, right now, to the same people the morning brief reaches.
// For the off-schedule pings the daily cron can't cover ("where is everyone?").
//
// Usage:  npm run broadcast -- "Your message. <b>HTML</b> allowed."
//         npm run broadcast -- --dry "Preview only, sends nothing."
//
// Reads TELEGRAM_BOT_TOKEN, TELEGRAM_TEAM_CHAT_IDS and OWNER_CHAT_ID from .env
// (via --env-file), exactly like the cron does. It only SENDS — it never touches
// the database, so it can't disturb the other owner's data.
const args = process.argv.slice(2)
const dry = args[0] === '--dry'
const text = (dry ? args[1] : args[0])?.trim()
const token = process.env.TELEGRAM_BOT_TOKEN?.trim()

if (!text) {
  console.error('Usage: npm run broadcast -- "your message"   (add --dry to preview)')
  process.exit(1)
}

// Same recipient rule as app/api/cron-daily: the team list, or the owner alone.
const team = (process.env.TELEGRAM_TEAM_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => /^-?\d+$/.test(s))
const to = team.length ? team : [process.env.OWNER_CHAT_ID?.trim()].filter(Boolean)

if (!to.length) {
  console.error('No recipients: set TELEGRAM_TEAM_CHAT_IDS or OWNER_CHAT_ID in .env.')
  process.exit(1)
}

console.log(`${dry ? '🔍 DRY RUN — would send' : '📤 Sending'} to ${to.length} chat(s):\n\n${text}\n`)
if (dry) process.exit(0)

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env — fill it in first.')
  process.exit(1)
}

let sent = 0
for (const chat_id of to) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (body.ok) sent++
  else console.error(`❌ ${chat_id}: ${body.description || res.status}`)
}
console.log(`✅ Sent to ${sent}/${to.length}.`)
