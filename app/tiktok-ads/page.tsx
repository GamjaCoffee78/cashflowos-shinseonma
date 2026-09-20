// 👉 TikTok Ads 🎯 — how the ad account is doing, from the `tiktok_ads` rows the
// daily cron stores (one per day, see lib/tiktok-ads.ts). Reads the ONE
// `records` table like every other tab; no live API call happens here.
import { getRecords } from '@/lib/records'
import { tiktokDays, tiktokConfigured } from '@/lib/tiktok-ads'
import AdsTab from '@/app/_components/AdsTab'
import SyncNow from '@/app/_components/SyncNow'
import { syncTikTokNow } from './actions'

export const dynamic = 'force-dynamic'
// The 90-day backfill behind the Sync now button can take a while.
export const maxDuration = 60

export default async function TikTokAds() {
  const days = tiktokDays(await getRecords())
  return (
    <AdsTab
      title="TikTok Ads 🎯"
      caption="Okmaya Official on TikTok Ads — synced every morning with the brief."
      days={days}
      toolbar={tiktokConfigured && <SyncNow action={syncTikTokNow} label="🎯 Sync now" hint="Asking TikTok — the first run pulls 90 days, give it a moment." />}
      empty={
        tiktokConfigured ? (
          <>No TikTok days synced yet — press <b>Sync now</b> above to pull the last 90 days, or wait for the 8:15am run.</>
        ) : (
          <>
            TikTok isn&apos;t wired yet. Add <code>COMPOSIO_API_KEY</code> to Vercel (the Composio project where TikTok Ads is linked),
            redeploy, and the next morning run fills this tab. See <code>abang/config.ts → tiktokAds</code>.
          </>
        )
      }
    />
  )
}
