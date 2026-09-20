// scripts/import-production.mjs — load the Production timeline into your records.
//
// Reads data/production-timeline.json (every dated item pulled out of the
// PRODUCTION TIMELINE grids in the shared sheet "Okmaya Project WIP.xlsx") and
// writes ONE record per item, category='production', due_date = the day it sits
// on in the sheet. That's what the /production tab reads.
//
//   npm run import:production                 (write)
//   npm run import:production -- --dry-run    (show, don't write)
//
// SAFE TO RE-RUN: an item already in the table (same title + same date, tagged
// meta.source='okmaya_project_wip') is skipped, so nothing is duplicated and
// NOTHING is ever deleted. If you'd rather paste SQL into Supabase, the same
// rows are in supabase/production-timeline.sql.

import { readFileSync } from 'node:fs'

const url = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v\d+$/i, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

const dryRun = process.argv.slice(2).includes('--dry-run')

if (!dryRun && (!url || !key || /YOUR-PROJECT|placeholder/i.test(url) || /placeholder/i.test(key))) {
  console.error(
    '\n⚠️  Your Supabase keys aren\'t set yet.\n' +
    '   Open your .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,\n' +
    '   then run this again. Nothing was imported. (Tip: add --dry-run to preview.)\n'
  )
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const SOURCE = 'okmaya_project_wip'
const items = JSON.parse(readFileSync(new URL('../data/production-timeline.json', import.meta.url), 'utf8'))
  .filter(i => i && i.date && i.title)

const rows = items.map(i => ({
  title: i.title,
  status: 'planned',
  amount: 0,
  category: 'production',
  due_date: i.date,
  notes: 'Okmaya Project WIP.xlsx - PRODUCTION TIMELINE',
  meta: { source: SOURCE, month: i.date.slice(0, 7) },
}))

const byMonth = new Map()
for (const r of rows) byMonth.set(r.meta.month, (byMonth.get(r.meta.month) ?? 0) + 1)
console.log(`\n📋 ${rows.length} production items across ${byMonth.size} months:`)
for (const [m, n] of [...byMonth.entries()].sort()) console.log(`   ${m}  ${n}`)

if (dryRun) {
  console.log('\n(dry run — nothing written)\n')
  process.exit(0)
}

// Which items are already in the table? Keyed on title + due_date.
const seen = new Set()
{
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/records?select=title,due_date&category=eq.production&meta->>source=eq.${SOURCE}&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` }, signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Supabase said no (HTTP ${res.status}) while checking existing items: ${body.slice(0, 200)}`)
    }
    const page = await res.json()
    for (const r of page) seen.add(`${r.due_date}|${r.title}`)
    if (page.length < PAGE) break
  }
}

const toInsert = rows.filter(r => !seen.has(`${r.due_date}|${r.title}`))
if (!toInsert.length) {
  console.log('\n✅ Nothing new — every item from the sheet is already in your records.\n')
  process.exit(0)
}

const BATCH = 500
let written = 0
for (let i = 0; i < toInsert.length; i += BATCH) {
  const slice = toInsert.slice(i, i + BATCH)
  try {
    const res = await fetch(`${url}/rest/v1/records`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(slice),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `\n⚠️  Supabase said no (HTTP ${res.status}) on batch ${i / BATCH + 1}. ` +
        `${written} row(s) were written before this; re-running is safe (already-imported items are skipped).\n` +
        `   ${body.slice(0, 300)}\n`,
      )
      process.exit(1)
    }
    written += slice.length
    process.stdout.write(`   … ${written}/${toInsert.length} written\r`)
  } catch (e) {
    console.error(`\n⚠️  Couldn't reach Supabase (${e.message}). ${written} row(s) written so far; re-run to continue.\n`)
    process.exit(1)
  }
}
console.log(`\n✅ Done — added ${written} production items. Open the Production tab to see them.\n`)
