// scripts/sync-sheet.mts — the owner sheet (okmaya_owner_v5_fix) → your records.
//
//   npm run sync:sheet -- --dry-run     show what WOULD change, write nothing
//   npm run sync:sheet                  do it
//
// Same code the 🔄 Sync now button runs, so a dry run here tells you exactly
// what the button will do. Run the dry run FIRST after any change to the
// sheet's layout: it prints how many figures matched rows you already have,
// and the sync refuses to write at all if too few match (writing them would
// double every number on the Dashboard).
import { syncOwnerSheet } from '../lib/owner-sheet'

const dryRun = process.argv.slice(2).includes('--dry-run')

const r = await syncOwnerSheet({ dryRun })
if (r.skipped) {
  console.log(`\n⚠️  Skipped: ${r.skipped}\n`)
  process.exit(0)
}
if (r.blocked) {
  console.log(`\n⛔ Nothing was written.\n   ${r.blocked}\n`)
  process.exit(0)
}
console.log(
  `\n${dryRun ? '👀 Dry run' : '✅ Synced'} — ${r.from} → ${r.to}\n` +
    `   ${r.cells} figure(s) in the sheet\n` +
    `   ${r.unchanged} unchanged · ${r.updated} ${dryRun ? 'would be refreshed' : 'refreshed'} · ${r.inserted} ${dryRun ? 'would be added' : 'added'}\n` +
    `   ${r.missing} stored row(s) the sheet no longer mentions (never deleted)\n`,
)
