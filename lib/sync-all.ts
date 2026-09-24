import { supabase, supabaseConfigured } from './supabase'
import { syncTikTokAds, tiktokConfigured } from './tiktok-ads'
import { syncMetaAds, metaConfigured } from './meta-ads'
import { syncShopee, shopeeConfigured } from './shopee'
import { syncTikTokShop, tiktokShopConfigured } from './tiktok-shop'
import { syncCalendar, calendarConfigured } from './calendar'
import { syncOwnerSheet, ownerSheetConfigured } from './owner-sheet'
import { syncProductionFromSheet, productionSheetConfigured } from './production-sheet'

// ONE-CLICK SYNC — what the 🔄 button in the header runs.
//
// It is the on-demand twin of the ⓪ step in the daily cron: the same three
// syncs the cron runs, and nothing else. No brief, no Telegram, no agent
// sweep — pressing it can never message the team or create a proposal.
//
// "All my data" means the two different kinds of data this app holds:
//   ① PULLED sources — the ones with a live API behind them: TikTok Ads, Meta
//      Ads and Google Calendar. Add a new puller to STEPS below and the button
//      picks it up with no UI change.
//   ② The OWNER SHEET — the Google Sheet the Dashboard's money comes from. It
//      is reconciled, not re-imported: a changed cell updates its row, a new
//      cell adds one, and nothing is ever added twice. See lib/owner-sheet.ts.
//   ③ PUSHED sources — Shopee, production, Instagram. Those
//      arrive through `scripts/import*.mjs` from a file on a laptop; there is
//      no API to ask, so the button can't re-pull them. What it CAN do is make
//      every tab re-read the database, which is what surfaces a row a script
//      (or the other owner's session, or Abang in Telegram) added since the
//      page was opened. That's the "Your records" step.
//
// Every step is independent: one failing source never stops the others, and the
// caller gets one line per step, so the user can see WHICH part is unhappy.
export type SyncStep = { key: string; label: string; ok: boolean; message: string }
export type SyncAllResult = { ok: boolean; at: string; steps: SyncStep[] }

// One outside source: what to call, and what to say when its key isn't set.
type Source = {
  key: string
  label: string
  configured: boolean
  missing: string          // the env var a beginner has to add in Vercel
  run: () => Promise<any>
}

const STEPS: Source[] = [
  { key: 'tiktok_ads', label: 'TikTok Ads', configured: tiktokConfigured, missing: 'COMPOSIO_API_KEY', run: () => syncTikTokAds() },
  { key: 'meta_ads', label: 'Meta Ads', configured: metaConfigured, missing: 'META_ADS_TOKEN', run: () => syncMetaAds() },
  { key: 'calendar', label: 'Calendar', configured: calendarConfigured, missing: 'COMPOSIO_API_KEY', run: () => syncCalendar() },
  { key: 'shopee', label: 'Shopee orders', configured: shopeeConfigured, missing: 'SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY', run: () => syncShopee({ netBudgetMs: 8_000 }) },
  { key: 'tiktok_shop', label: 'TikTok Shop orders', configured: tiktokShopConfigured, missing: 'TIKTOK_APP_KEY / TIKTOK_APP_SECRET', run: () => syncTikTokShop() },
  { key: 'production_sheet', label: 'Production sheet', configured: productionSheetConfigured(), missing: 'productionSheet.composioAccount (abang/config.ts)', run: () => syncProductionFromSheet() },
  { key: 'owner_sheet', label: 'Owner sheet', configured: ownerSheetConfigured, missing: 'COMPOSIO_API_KEY', run: () => syncOwnerSheet() },
]

// Turn any of the three sync results into one plain sentence. They all share the
// same shape: { skipped } when a key is missing, else { from, to, inserted,
// updated, cancelled? }.
function describe(r: any): string {
  if (typeof r?.skipped === 'string') return `Skipped — ${r.skipped}.`
  // The owner sheet's guard: it read the sheet fine but refused to write,
  // because writing would have doubled the Dashboard. Say exactly why.
  if (r?.blocked) return `Nothing written — ${r.blocked}`
  const inserted = Number(r?.inserted || 0)
  const updated = Number(r?.updated || 0)
  const cancelled = Number(r?.cancelled || 0)
  const span = r?.from && r?.to ? `${r.from} → ${r.to}: ` : ''
  let tail = Number(r?.missing || 0)
    ? ` ${r.missing} stored row(s) are no longer in the sheet — left alone, nothing is ever deleted.`
    : ''
  if (r?.netAdded) tail += ` Payout (after fees) found for ${r.netAdded} order(s).`
  if (r?.netTried && !r?.netAdded && !r?.netError) tail += ` Shopee returned no payout for ${r.netTried} order(s) checked.`
  if (r?.netError) tail += ` Shopee refused the payout lookup: ${r.netError}`
  if (!inserted && !updated && !cancelled) return `${span}nothing new, already up to date.${tail}`
  const bits = [`${inserted} added`, `${updated} refreshed`]
  if (cancelled) bits.push(`${cancelled} cancelled`)
  return `${span}${bits.join(', ')}.${tail}`
}

async function runSource(s: Source): Promise<SyncStep> {
  if (!s.configured) {
    return {
      key: s.key,
      label: s.label,
      ok: true,
      message: `Skipped — ${s.missing} isn’t set, so there’s nothing to ask. Add it in Vercel → Settings → Environment Variables, then redeploy.`,
    }
  }
  try {
    return { key: s.key, label: s.label, ok: true, message: describe(await s.run()) }
  } catch (e) {
    return { key: s.key, label: s.label, ok: false, message: String((e as Error)?.message || e).slice(0, 220) }
  }
}

// ② The database itself — proves the read path works and says how much is there,
//    so "synced" never quietly means "read zero rows".
async function recordsStep(): Promise<SyncStep> {
  if (!supabaseConfigured) {
    return { key: 'records', label: 'Your records', ok: false, message: 'Supabase isn’t connected yet — see the banner above.' }
  }
  try {
    const { count, error } = await supabase.from('records').select('id', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    return {
      key: 'records',
      label: 'Your records',
      ok: true,
      message: `${(count ?? 0).toLocaleString('en-MY')} rows re-read — every tab now shows the latest.`,
    }
  } catch (e) {
    return { key: 'records', label: 'Your records', ok: false, message: String((e as Error)?.message || e).slice(0, 220) }
  }
}

export async function syncAll(): Promise<SyncAllResult> {
  // In parallel: three outside sources that don't touch each other, then the
  // row count last so it reflects whatever they just wrote.
  const sources = await Promise.all(STEPS.map(runSource))
  const steps = [...sources, await recordsStep()]
  return { ok: steps.every(s => s.ok), at: new Date().toISOString(), steps }
}
