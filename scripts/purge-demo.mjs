// 🔒 Don't edit — this keeps your purge safe.
// scripts/purge-demo.mjs — delete the shipped DEMO rows, keep everything real.
//
// The old supabase/schema.sql seeded ~40 fake rows (Acme, Cendana, Lai Holdings,
// "Reel: 3 ways AI saves time", a RM269 "Office Depot" proposal…) so no tab
// looked empty on day one. Those seeds are gone from schema.sql now, but if you
// already ran the old file, they're still sitting in YOUR database.
//
// This removes exactly those rows — matched by their EXACT demo titles — and
// nothing else. Your real imported okmaya data is never touched.
//
//   npm run purge:demo          → DRY RUN. Shows what it would delete. Deletes nothing.
//   npm run purge:demo -- --yes → actually deletes them.
//
// Pure Node, no extra installs. Same .env as the rest of the app.

// ------------------------------------------------------------
// 0) Read + clean the Supabase connection (same forgiving rules as lib/supabase.ts).
// ------------------------------------------------------------
const url = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v\d+$/i, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!url || !key || /YOUR-PROJECT|placeholder/i.test(url) || /placeholder/i.test(key)) {
  console.error(
    '\n⚠️  Your Supabase keys aren\'t set yet.\n' +
    '   Open your .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,\n' +
    '   then run this again. Nothing was deleted.\n'
  )
  process.exit(1)
}

// ------------------------------------------------------------
// 1) The EXACT titles the old schema.sql seeded. Nothing else is ever matched.
//    (Kept verbatim — including the em dashes — so a real row never collides.)
// ------------------------------------------------------------
const DEMO_TITLES = [
  // cash_in
  'Payment — Acme retainer',
  'Invoice #014 — Lai Holdings',
  'Invoice #015 — Cendana',
  'Invoice #021 — Zul Hardware',
  'Invoice #022 — Nur Trading',
  'Invoice #023 — Sunrise Cafe',
  'Invoice #024 — Bina Jaya',
  // cash_out
  'Meta Ads — June',
  'Lunch meeting — client',
  'Software — Notion',
  // leads
  'Daniel Tan — Tan F&B',
  'Aisha Rahman — Acme',
  'Keith Lim — Cendana',
  'Mei Wong — cold',
  'Farah Ismail — Ismail Consulting',
  'Danial Haikal — Haikal Motors',
  'Farid Hassan — Hassan Logistics',
  'Priya Nair — Nair Dental',
  'Chong Wei Jian — CWJ Auto',
  'Rajesh Kumar — Kumar Textiles',
  'Siti Aminah — Aminah Boutique',
  // customers (Beta Trading was seeded BOTH as a lead and as a customer)
  'Beta Trading',
  'Caremetic Sdn Bhd',
  'Nurul Trading Co',
  'Zaidi Enterprises',
  // content
  'Reel: 3 ways AI saves time',
  'Case study carousel',
  'Promo ad — workshop',
  'Reel — client testimonial',
  'TikTok — quick tip video',
  'Carousel — pricing breakdown',
  // tasks
  'Follow up Keith',
  'Send July invoices',
  'Call Farah Ismail — confirm scope',
  'Prep workshop slides',
  'Quarterly review — Caremetic',
  // doc
  'SSM registration cert',
]

// The one seeded proposal, matched by its idempotency key (not by title).
const DEMO_PROPOSAL_KEY = 'seed-demo-proposal-001'

const APPLY = process.argv.includes('--yes')

// PostgREST `in.(...)` needs each value quoted, and inner quotes doubled.
const inList = (vals) => `(${vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')})`

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function call(path, init) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`)
  }
  return res
}

// ------------------------------------------------------------
// 2) LOOK FIRST. Show exactly what matches before anything is removed.
// ------------------------------------------------------------
let records = []
let proposals = []
try {
  records = await (await call(
    `records?select=id,title,category,amount&title=in.${encodeURIComponent(inList(DEMO_TITLES))}`,
  )).json()
  proposals = await (await call(
    `agent_actions?select=id,agent_key,status&idempotency_key=eq.${encodeURIComponent(DEMO_PROPOSAL_KEY)}`,
  )).json()
} catch (e) {
  console.error(
    `\n⚠️  Couldn't reach Supabase (${e.message}). Nothing was deleted.\n` +
    '   Check SUPABASE_URL is the base URL (no /rest/v1), and that the tables exist.\n'
  )
  process.exit(1)
}

const total = records.length + proposals.length

console.log(`\n🧹 Demo-row cleanup${APPLY ? '' : '  (DRY RUN — nothing will be deleted)'}`)
console.log(`   Found ${records.length} demo record(s) and ${proposals.length} demo proposal(s).\n`)

if (!total) {
  console.log('✅ Nothing to clean — no demo rows in your database. Your data is all yours.\n')
  process.exit(0)
}

for (const r of records) {
  const money = Number(r.amount) ? ` · RM${Number(r.amount).toLocaleString('en-MY')}` : ''
  console.log(`     • [${r.category}] ${r.title}${money}`)
}
for (const p of proposals) console.log(`     • [proposal] ${p.agent_key} (${p.status})`)
console.log('')

if (!APPLY) {
  console.log('   Nothing was deleted. Happy with the list above? Run it for real:')
  console.log('     npm run purge:demo -- --yes\n')
  process.exit(0)
}

// ------------------------------------------------------------
// 3) Delete — only the rows listed above.
// ------------------------------------------------------------
try {
  await call(`records?title=in.${encodeURIComponent(inList(DEMO_TITLES))}`, { method: 'DELETE' })
  await call(`agent_actions?idempotency_key=eq.${encodeURIComponent(DEMO_PROPOSAL_KEY)}`, { method: 'DELETE' })
} catch (e) {
  console.error(`\n⚠️  Delete failed (${e.message}). Some rows may remain — safe to run again.\n`)
  process.exit(1)
}

console.log(`✅ Removed ${records.length} demo record(s) and ${proposals.length} demo proposal(s).`)
console.log('   Everything left in your database is real.\n')
