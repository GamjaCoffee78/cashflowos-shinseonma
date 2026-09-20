'use server'

import { revalidatePath } from 'next/cache'
import { syncAll, type SyncAllResult } from '@/lib/sync-all'

// The server half of the header's 🔄 button. It runs on the server, so it uses
// the Vercel environment's COMPOSIO_API_KEY + Supabase keys — no secret ever
// reaches the browser, and you never need those on your laptop.
//
// Reachable only from inside the app, which proxy.ts keeps behind the
// APP_PASSCODE cookie like every other tab.
export type { SyncAllResult }

export async function syncEverything(): Promise<SyncAllResult> {
  const result = await syncAll()
  // Drop every cached tab, not just the one you're standing on, so Dashboard,
  // Cash In, TikTok Ads and the rest all agree the moment the button finishes.
  revalidatePath('/', 'layout')
  return result
}
