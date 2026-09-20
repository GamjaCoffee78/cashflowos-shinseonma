// scripts/sync-meta.mts — pull Meta Ads days into `records` from your laptop.
//
//   npm run sync:meta -- --dry-run        # show what Meta returns, write nothing
//   npm run sync:meta                     # sync (first run backfills 90 days)
//   npm run sync:meta -- --days 30        # re-pull a specific window
//
// The daily cron does exactly this every morning; this is for the first backfill
// and for checking the wiring. Needs META_ADS_TOKEN (+ Supabase keys unless
// --dry-run) in .env.
import { syncMetaAds } from '../lib/meta-ads'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const di = args.indexOf('--days')
const days = di >= 0 ? Number(args[di + 1]) : undefined

const r: any = await syncMetaAds({ days, dryRun })
if (r.skipped) {
  console.error(`\n⚠️  Skipped: ${r.skipped}. Add it to .env and try again.\n`)
  process.exit(1)
}
console.log(`\n📘 Meta Ads ${dryRun ? '(DRY RUN) ' : ''}${r.from} → ${r.to}: ${r.fetched} day(s) from Meta`)
if (dryRun) {
  for (const d of r.rows.slice(-10)) console.log(`   ${d.date}  RM${d.spend.toFixed(2)}  ${d.impressions} imp  ${d.clicks} clicks  CTR ${d.ctr}%`)
  if (r.rows.length > 10) console.log(`   … and ${r.rows.length - 10} earlier day(s)`)
} else {
  console.log(`   ✅ ${r.inserted} inserted · ${r.updated} updated in records (category meta_ads)\n`)
}
