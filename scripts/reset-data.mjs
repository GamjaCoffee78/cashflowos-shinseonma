// scripts/reset-data.mjs — wipe the demo data (or everything) before real data goes in.
//
//   npm run reset:data -- --yes
//
// Deletes EVERY row in: records, agent_actions, agent_runs, bot_memory.
// It does NOT touch your Vault files (storage) or your tables' structure.
// Refuses to run without --yes, so a stray keypress can't empty your business.
// THIS CANNOT BE UNDONE — export first if there's anything you want to keep.

const url = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v\d+$/i, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!url || !key || /YOUR-PROJECT|placeholder/i.test(url) || /placeholder/i.test(key)) {
  console.error('\n⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren\'t set in .env. Nothing was deleted.\n')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.error(
    '\n⚠️  This empties records, agent_actions, agent_runs and bot_memory — and cannot be undone.\n' +
    '   If you mean it:  npm run reset:data -- --yes\n'
  )
  process.exit(1)
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }

// PostgREST refuses a DELETE with no filter (on purpose), so match on each
// table's primary key: "id >= 0", or "chat_id is not null" for bot_memory
// (group chat ids are negative).
const TABLES = { agent_runs: 'id=gte.0', agent_actions: 'id=gte.0', bot_memory: 'chat_id=not.is.null', records: 'id=gte.0' }
for (const [table, filter] of Object.entries(TABLES)) {
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`⚠️  ${table}: Supabase said no (HTTP ${res.status}) — ${body.slice(0, 200)}`)
      continue
    }
    const range = res.headers.get('content-range') || ''
    const n = range.split('/')[1]
    console.log(`🧹 ${table}: ${n && n !== '*' ? n : 'all'} row(s) deleted`)
  } catch (e) {
    console.error(`⚠️  ${table}: couldn't reach Supabase (${e.message})`)
  }
}
console.log('\nDone. Your tables are empty and ready for real data.\n')
