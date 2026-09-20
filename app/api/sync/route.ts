import { NextResponse } from 'next/server'
import { syncTikTokAds } from '@/lib/tiktok-ads'
import { syncMetaAds } from '@/lib/meta-ads'
import { syncCalendar } from '@/lib/calendar'

// The "Sync now" endpoint behind each tab's button: POST { source } → runs the
// same pull the 08:15 cron does for that one source, nothing else (no brief,
// no Telegram, no agent sweep), and answers with plain JSON so the button can
// show exactly what happened. Runs on the server with Vercel's keys.
//
// Reachable only with the APP_PASSCODE cookie — proxy.ts gates /api/sync like
// every tab (it is NOT in the matcher's exclusion list, on purpose).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SOURCES = {
  tiktok: { run: syncTikTokAds, unit: 'day(s)', label: 'TikTok' },
  meta: { run: syncMetaAds, unit: 'day(s)', label: 'Meta' },
  calendar: { run: syncCalendar, unit: 'event(s)', label: 'Google Calendar' },
} as const

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const source = SOURCES[body?.source as keyof typeof SOURCES]
  if (!source) return NextResponse.json({ ok: false, message: 'Unknown source.' }, { status: 400 })
  try {
    const r: any = await source.run()
    if (r.skipped) {
      return NextResponse.json({ ok: false, message: `${r.skipped} — add it in Vercel → Settings → Environment Variables, then redeploy.` })
    }
    const parts = [`${r.inserted} added`, `${r.updated} refreshed`]
    if (typeof r.cancelled === 'number') parts.push(`${r.cancelled} cancelled`)
    return NextResponse.json({
      ok: true,
      message: `${r.from} → ${r.to}: ${r.fetched} ${source.unit} from ${source.label} — ${parts.join(', ')}.`,
    })
  } catch (e) {
    console.error(`[CFO] sync ${body?.source} failed:`, e)
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e).slice(0, 300) })
  }
}
