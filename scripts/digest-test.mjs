// scripts/digest-test.mjs — fire ONLY the personal "today" digest (Calendar /
// Production Timeline / Social Calendar / Events), skipping the money brief —
// so a manual test never messages the OMY group. See abang/config.ts →
// todayBriefRecipients for who receives it.
//
//   npm run digest:test                               → hits http://localhost:3000
//   npm run digest:test -- https://your-app.vercel.app → hits your live app
//
// Reads CRON_SECRET from .env. Nothing is written to your database by this
// script itself.

const base = (
  process.argv[2] ||
  process.env.APP_URL ||
  'http://localhost:3000'
).trim().replace(/\/+$/, '')

const secret = process.env.CRON_SECRET?.trim()

if (!secret) {
  console.error(
    '\n⚠️  CRON_SECRET isn\'t set in your .env.\n' +
    '   The endpoint fails CLOSED (401 to everyone) without it. Put the SAME value\n' +
    '   in your .env and in Vercel → Settings → Environment Variables, then retry.\n'
  )
  process.exit(1)
}

console.log(`\n☀️  Firing the today-digest ONLY (no money brief, no OMY group) at ${base}/api/cron-daily?scope=digest …\n`)

let res
try {
  res = await fetch(`${base}/api/cron-daily?scope=digest`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(70000),
  })
} catch (e) {
  console.error(
    `⚠️  Couldn't reach ${base} (${e.message}).\n` +
    '   Local? Start the app first in another terminal: npm run dev\n' +
    '   Live?  Pass your Vercel URL: npm run digest:test -- https://your-app.vercel.app\n'
  )
  process.exit(1)
}

if (res.status === 401) {
  console.error('⚠️  401 forbidden — your CRON_SECRET here doesn\'t match the one the app is running with.\n')
  process.exit(1)
}

const body = await res.json().catch(() => null)

if (!res.ok || !body?.ok) {
  console.error(`⚠️  The endpoint returned HTTP ${res.status}.\n   ${JSON.stringify(body)}\n`)
  process.exit(1)
}

console.log(`   Telegram messages sent : ${body.sent} of ${body.recipients} recipient(s)\n`)

if (body.recipients === 0) {
  console.log(
    '⚠️  Nobody is in ABANG.todayBriefRecipients (abang/config.ts), so nothing was sent.\n'
  )
  process.exit(1)
}

if (body.sent === 0) {
  console.log(
    '⚠️  It tried to send but Telegram refused every message.\n' +
      '   Usually: TELEGRAM_BOT_TOKEN is wrong, or that person never pressed START\n' +
      '   in a chat with the bot (Telegram blocks bots from messaging first).\n'
  )
  process.exit(1)
}

console.log('✅ Sent — check Telegram. The OMY group was never touched by this run.\n')
