'use server'

import { revalidatePath } from 'next/cache'
import { syncMetaAds } from '@/lib/meta-ads'
import type { SyncResult } from '@/app/_components/SyncNow'

// "Sync now" — the on-demand twin of the ⓪ step in the daily cron.
// Same syncMetaAds() the cron calls, and nothing else: no brief, no Telegram,
// no agent sweep. Reachable only through the Meta Ads page, which proxy.ts
// keeps behind the APP_PASSCODE cookie like every other tab.
export async function syncMetaNow(): Promise<SyncResult> {
  try {
    const r: any = await syncMetaAds()
    if (r.skipped) return { ok: false, message: `${r.skipped} — add it in Vercel → Settings → Environment Variables, then redeploy.` }
    revalidatePath('/meta-ads')
    if (!r.inserted && !r.updated) return { ok: true, message: `Meta returned no days for ${r.from} → ${r.to}. Nothing to store.` }
    return { ok: true, message: `${r.from} → ${r.to}: ${r.inserted} day(s) added, ${r.updated} refreshed.` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e).slice(0, 300) }
  }
}
