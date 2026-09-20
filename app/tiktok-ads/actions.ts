'use server'

import { revalidatePath } from 'next/cache'
import { syncTikTokAds } from '@/lib/tiktok-ads'

// "Sync now" — the on-demand twin of the ⓪ step in the daily cron.
//
// Same syncTikTokAds() the cron calls, and nothing else: no brief, no Telegram,
// no agent sweep. It runs on the server, so it uses the Vercel environment's
// COMPOSIO_API_KEY + Supabase keys — you never need those on your laptop.
//
// Reachable only through the TikTok Ads page, which proxy.ts keeps behind the
// APP_PASSCODE cookie like every other tab.
export type SyncResult = { ok: true; message: string } | { ok: false; message: string }

export async function syncTikTokNow(): Promise<SyncResult> {
  try {
    const r: any = await syncTikTokAds()
    if (r.skipped) return { ok: false, message: `${r.skipped} — add it in Vercel → Settings → Environment Variables, then redeploy.` }

    revalidatePath('/tiktok-ads')
    const moved = r.inserted + r.updated
    if (!moved) return { ok: true, message: `TikTok returned no days for ${r.from} → ${r.to}. Nothing to store.` }
    return {
      ok: true,
      message: `${r.from} → ${r.to}: ${r.inserted} day(s) added, ${r.updated} refreshed.`,
    }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e).slice(0, 300) }
  }
}
