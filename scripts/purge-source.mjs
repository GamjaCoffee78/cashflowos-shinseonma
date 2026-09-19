// 🔒 Don't edit — this keeps your re-import safe.
// scripts/purge-source.mjs — remove every row that came from ONE import source,
// so you can re-import it cleanly without doubling your numbers.
//
// Every row the importer creates is stamped with meta.source (e.g.
// "okmaya_staff_v5_fix"). This deletes rows carrying that stamp and nothing
// else — anything you typed in by hand, or that the robot filed from a receipt,
// has no such stamp and is never touched.
//
//   npm run purge:source -- okmaya_staff_v5_fix          → DRY RUN, deletes nothing
//   npm run purge:source -- okmaya_staff_v5_fix --yes    → actually deletes
//
// Typical re-import after your Google Sheet changes:
//   npm run purge:source -- okmaya_staff_v5_fix --yes
//   npm run import

const url = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v\d+$/i, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!url || !key || /YOUR-PROJECT|placeholder/i.test(url) || /placeholder/i.test(key)) {
  console.error(
    '\n⚠️  Your Supabase keys aren\'t set yet.\n' +
    '   Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Nothing was deleted.\n'
  )
  process.exit(1)
}

const args = process.argv.slice(2).filter((a) => a !== '--yes')
const APPLY = process.argv.includes('--yes')
const source = (args[0] ?? '').trim()

if (!source) {
  console.error(
    '\n⚠️  Which import source? Name it, e.g.\n' +
    '     npm run purge:source -- okmaya_staff_v5_fix\n\n' +
    '   (That\'s the "source" stamp the importer puts on every row it creates.)\n'
  )
  process.exit(1)
}

const filter = `meta->>source=eq.${encodeURIComponent(source)}`
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function call(path, init) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`)
  }
  return res
}

let rows = []
try {
  rows = await (await call(`records?select=id,title,category,amount&${filter}`)).json()
} catch (e) {
  console.error(`\n⚠️  Couldn't reach Supabase (${e.message}). Nothing was deleted.\n`)
  process.exit(1)
}

console.log(`\n🧹 Rows imported from "${source}"${APPLY ? '' : '  (DRY RUN — nothing will be deleted)'}`)

if (!rows.length) {
  console.log(`   None found. Nothing to delete — safe to run \`npm run import\`.\n`)
  process.exit(0)
}

const money = (cat) =>
  rows.filter((r) => r.category === cat).reduce((s, r) => s + Number(r.amount || 0), 0)

console.log(`   ${rows.length} row(s)`)
console.log(`   cash in  RM${money('cash_in').toLocaleString('en-MY', { minimumFractionDigits: 2 })}`)
console.log(`   cash out RM${money('cash_out').toLocaleString('en-MY', { minimumFractionDigits: 2 })}\n`)

if (!APPLY) {
  console.log('   Nothing was deleted. To go ahead:')
  console.log(`     npm run purge:source -- ${source} --yes\n`)
  process.exit(0)
}

try {
  await call(`records?${filter}`, { method: 'DELETE' })
} catch (e) {
  console.error(`\n⚠️  Delete failed (${e.message}). Safe to run again.\n`)
  process.exit(1)
}

console.log(`✅ Removed ${rows.length} row(s) from "${source}". Re-import with: npm run import\n`)
