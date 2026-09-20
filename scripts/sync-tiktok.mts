// scripts/sync-tiktok.mts — pull TikTok Ads days into `records` from your laptop.
//
//   npm run sync:tiktok -- --dry-run        # show what TikTok returns, write nothing
//   npm run sync:tiktok                     # sync (first run backfills 90 days)
//   npm run sync:tiktok -- --days 30        # re-pull a specific window
//
// The daily cron does exactly this every morning; this is for the first backfill
// and for checking the wiring. Needs COMPOSIO_API_KEY (+ Supabase keys unless
// --dry-run) in .env.
import { syncTikTokAds } from '../lib/tiktok-ads'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const di = args.indexOf('--days')
const days = di >= 0 ? Number(args[di + 1]) : undefined

const r: any = await syncTikTokAds({ days, dryRun })
if (r.skipped) {
  console.error(`\n⚠️  Skipped: ${r.skipped}. Add it to .env and try again.\n`)
  process.exit(1)
}
console.log(`\n🎯 TikTok Ads ${dryRun ? '(DRY RUN) ' : ''}${r.from} → ${r.to}: ${r.fetched} day(s) from TikTok`)
if (dryRun) {
  for (const d of r.rows.slice(-10)) console.log(`   ${d.date}  RM${d.spend.toFixed(2)}  ${d.impressions} imp  ${d.clicks} clicks  CTR ${d.ctr}%`)
  if (r.rows.length > 10) console.log(`   … and ${r.rows.length - 10} earlier day(s)`)
} else {
  console.log(`   ✅ ${r.inserted} inserted · ${r.updated} updated in records (category tiktok_ads)\n`)
}
