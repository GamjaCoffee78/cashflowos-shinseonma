// 🔒 Don't edit — this just proves your morning brief works.
// scripts/brief-test.mjs — fire the 8am brief RIGHT NOW so you don't have to
// wait until tomorrow morning to find out whether Telegram is wired up.
//
// It calls the SAME endpoint Vercel Cron calls (/api/cron-daily) with the SAME
// Bearer token, so if this works, tomorrow at 8am works.
//
//   npm run brief:test                               → hits http://localhost:3000
//   npm run brief:test -- https://your-app.vercel.app → hits your live app
//
// Reads CRON_SECRET from .env. Nothing is written to your database by this
// script itself — the endpoint behaves exactly as it does on a real 8am run.

const base = (
  process.argv[2] ||
  process.env.APP_URL ||
  'http://localhost:3000'
).trim().replace(/\/+$/, '')

const secret = process.env.CRON_SECRET?.trim()

if (!secret) {
  console.error(
    '\n⚠️  CRON_SECRET isn\'t set in your .env.\n' +
    '   The brief endpoint fails CLOSED (401 to everyone) without it — that\'s on purpose,\n' +
    '   it can spend credit. Invent a long random string, put the SAME value in your .env\n' +
    '   and in Vercel → Settings → Environment Variables, then run this again.\n'
  )
  process.exit(1)
}

console.log(`\n☀️  Firing the morning brief at ${base}/api/cron-daily …\n`)

let res
try {
  res = await fetch(`${base}/api/cron-daily`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(70000), // the route itself may take up to 60s
  })
} catch (e) {
  console.error(
    `⚠️  Couldn't reach ${base} (${e.message}).\n` +
    '   Local? Start the app first in another terminal: npm run dev\n' +
    '   Live?  Pass your Vercel URL: npm run brief:test -- https://your-app.vercel.app\n'
  )
  process.exit(1)
}

if (res.status === 401) {
  console.error(
    '⚠️  The endpoint said 401 (forbidden).\n' +
    '   Your CRON_SECRET here doesn\'t match the one the app is running with.\n' +
    '   Make them identical in .env AND in Vercel, redeploy, then try again.\n'
  )
  process.exit(1)
}

const body = await res.json().catch(() => null)

if (!res.ok || !body?.ok) {
  console.error(`⚠️  The brief endpoint returned HTTP ${res.status}.\n   ${JSON.stringify(body)}\n`)
  process.exit(1)
}

console.log(`   Telegram messages sent : ${body.sent} of ${body.recipients} recipient(s)`)
console.log(`   Waiting on your YES    : ${body.needs_yes}`)
console.log(`   New proposals created  : ${body.proposals_created}\n`)

if (body.recipients === 0) {
  console.log(
    '⚠️  Nobody is set to receive it, so nothing was sent.\n' +
    '   Put your numeric Telegram id in OWNER_CHAT_ID (get it from @userinfobot),\n' +
    '   then run this again.\n'
  )
  process.exit(1)
}

if (body.sent === 0) {
  console.log(
    '⚠️  It tried to send but Telegram refused every message.\n' +
      '   Usually: TELEGRAM_BOT_TOKEN is wrong, or you have never pressed START in a\n' +
      '   chat with your bot (Telegram blocks bots from messaging you first).\n'
  )
  process.exit(1)
}

console.log('✅ Sent. Check Telegram — that exact message is what lands at 8:00am daily.\n')
