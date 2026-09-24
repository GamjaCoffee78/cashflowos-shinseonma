// scripts/sync-shopee.mts — pull Shopee orders into `records` from your laptop.
//
//   npm run sync:shopee -- --dry-run      # show what Shopee returns, write nothing
//   npm run sync:shopee                   # sync the last week of orders
//   npm run sync:shopee -- --days 30      # a longer window
//
// The daily cron does exactly this every morning; this is for checking the
// wiring. Needs SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY (+ Supabase keys unless
// --dry-run) in .env, and a shop authorised through /api/shopee/authorize.
import { syncShopee } from '../lib/shopee'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const di = args.indexOf('--days')
const days = di >= 0 ? Number(args[di + 1]) : undefined

const r: any = await syncShopee({ days, dryRun })
if (typeof r.skipped === 'string') {
  console.error(`\n⚠️  Skipped: ${r.skipped}\n`)
  process.exit(1)
}
console.log(`\n🛍️  Shopee ${dryRun ? '(DRY RUN) ' : ''}${r.from} → ${r.to}: ${r.fetched} order(s) from ${r.shops} shop(s), ${r.cancelled} cancelled/unpaid skipped`)
if (dryRun) for (const line of r.sample ?? []) console.log(`   ${line}`)
else console.log(`   ✅ ${r.inserted} added · ${r.updated} refreshed (category shopee_order)\n`)
