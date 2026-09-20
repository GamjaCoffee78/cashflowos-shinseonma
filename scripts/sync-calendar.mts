// scripts/sync-calendar.mts — pull Google Calendar events into `records` from your laptop.
//
//   npm run sync:calendar -- --dry-run        # show what Google returns, write nothing
//   npm run sync:calendar                     # sync (past 14 → next 60 days)
//
// The daily cron does exactly this every morning; this is for the first backfill
// and for checking the wiring. Needs COMPOSIO_API_KEY (+ Supabase keys unless
// --dry-run) in .env.
import { syncCalendar } from '../lib/calendar'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const r: any = await syncCalendar({ dryRun })
if (r.skipped) {
  console.error(`\n⚠️  Skipped: ${r.skipped}. Add it to .env and try again.\n`)
  process.exit(1)
}
console.log(`\n📅 Calendar ${dryRun ? '(DRY RUN) ' : ''}${r.from} → ${r.to}: ${r.fetched} event(s) from Google`)
if (dryRun) {
  for (const e of r.rows.slice(0, 15)) console.log(`   ${e.date}  ${e.allDay ? 'all day' : e.start.slice(11, 16)}  ${e.title}${e.location ? ' @ ' + e.location : ''}`)
  if (r.rows.length > 15) console.log(`   … and ${r.rows.length - 15} more`)
} else {
  console.log(`   ✅ ${r.inserted} inserted · ${r.updated} updated · ${r.cancelled} marked cancelled (category event)\n`)
}
