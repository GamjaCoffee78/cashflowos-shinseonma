// 👉 Meta Ads 📘 — Facebook + Instagram ads, from the `meta_ads` rows the daily
// cron stores (one per day, see lib/meta-ads.ts). Reads the ONE `records`
// table like every other tab; no live API call happens here.
import { getRecords } from '@/lib/records'
import { metaDays, metaConfigured } from '@/lib/meta-ads'
import AdsTab from '@/app/_components/AdsTab'
import SyncNow from '@/app/_components/SyncNow'
import { syncMetaNow } from './actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function MetaAds() {
  const days = metaDays(await getRecords())
  return (
    <AdsTab
      title="Meta Ads 📘"
      caption="Okmaya on Facebook + Instagram ads — synced every morning with the brief."
      days={days}
      toolbar={metaConfigured && <SyncNow action={syncMetaNow} label="📘 Sync now" hint="Asking Meta — the first run pulls 90 days, give it a moment." />}
      empty={
        metaConfigured ? (
          <>No Meta days synced yet — press <b>Sync now</b> above to pull the last 90 days, or wait for the 8:15am run.</>
        ) : (
          <>
            Meta isn&apos;t wired yet. Add <code>META_ADS_TOKEN</code> to Vercel (a System User token with <code>ads_read</code>),
            redeploy, and the next morning run fills this tab. The ad account is set in <code>abang/config.ts → metaAds</code>.
          </>
        )
      }
    />
  )
}
