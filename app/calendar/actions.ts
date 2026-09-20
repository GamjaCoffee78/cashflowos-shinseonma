'use server'

import { revalidatePath } from 'next/cache'
import { syncCalendar } from '@/lib/calendar'
import type { SyncResult } from '@/app/_components/SyncNow'

// "Sync now" for the Calendar tab — the same read-only copy the cron makes.
export async function syncCalendarNow(): Promise<SyncResult> {
  try {
    const r: any = await syncCalendar()
    if (r.skipped) return { ok: false, message: `${r.skipped} — add it in Vercel → Settings → Environment Variables, then redeploy.` }
    revalidatePath('/calendar')
    return { ok: true, message: `${r.from} → ${r.to}: ${r.fetched} event(s) from Google — ${r.inserted} added, ${r.updated} refreshed, ${r.cancelled} cancelled.` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e).slice(0, 300) }
  }
}
