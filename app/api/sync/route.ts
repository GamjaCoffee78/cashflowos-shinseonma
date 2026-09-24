import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { syncAll } from '@/lib/sync-all'
import { syncTikTokAds } from '@/lib/tiktok-ads'
import { syncMetaAds } from '@/lib/meta-ads'
import { syncCalendar } from '@/lib/calendar'
import { syncShopee } from '@/lib/shopee'
import { syncTikTokShop } from '@/lib/tiktok-shop'

// The "Sync now" endpoint behind every button: POST { source } → runs the
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
  shopee: { run: (o?: any) => syncShopee(o), unit: 'order(s)', label: 'Shopee' },
  tiktok_shop: { run: (o?: any) => syncTikTokShop(o), unit: 'order(s)', label: 'TikTok Shop' },
} as const

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  // source:'all' is the header button — every source in one press, one line per
  // source in the answer. Each step is independent, so a source that is not
  // configured (or that fails) never stops the rest.
  if (body?.source === 'all') {
    const result = await syncAll()
    // Drop every cached tab, not just the one the button was pressed on, so the
    // whole app agrees the moment the sync finishes.
    revalidatePath('/', 'layout')
    return NextResponse.json(result)
  }

  const source = SOURCES[body?.source as keyof typeof SOURCES]
  if (!source) return NextResponse.json({ ok: false, message: 'Unknown source.' }, { status: 400 })
  try {
    const region = typeof body?.region === 'string' ? body.region : undefined
    // `days` lets a one-off deeper pull be asked for (a backfill, or re-reading
    // rows after a formatting fix). Bounded, so nobody can ask for a year and
    // time the function out.
    // Up to ~2.5 years back, so history can be walked; each request still has to
    // finish inside the 60s, which is what `until` is for.
    const days = Number.isFinite(Number(body?.days)) ? Math.min(Math.max(Number(body.days), 1), 900) : undefined
    const until = Number.isFinite(Number(body?.until)) ? Math.min(Math.max(Number(body.until), 0), 899) : undefined
    const opts = { ...(region ? { region } : {}), ...(days ? { days } : {}), ...(until ? { until } : {}) }
    const r: any = await (source.run as (o?: any) => Promise<any>)(Object.keys(opts).length ? opts : undefined)
    if (typeof r.skipped === 'string') {
      return NextResponse.json({ ok: false, message: `${r.skipped} — add it in Vercel → Settings → Environment Variables, then redeploy.` })
    }
    const parts = [`${r.inserted} added`, `${r.updated} refreshed`]
    if (typeof r.cancelled === 'number') parts.push(`${r.cancelled} cancelled`)
    if (r.netAdded) parts.push(`payout found for ${r.netAdded}`)
    if (r.netTried && !r.netAdded && !r.netError) parts.push(`Shopee returned no payout for ${r.netTried} checked`)
    if (r.netError) parts.push(`Shopee refused the payout lookup: ${r.netError}`)
    if (typeof r.addrWithState === 'number' && r.fetched) {
      parts.push(r.addrWithState ? `state found for ${r.addrWithState}` : `no state from Shopee (${r.addrOrders} addresses; fields sent: ${r.addrFields || 'none'})`)
    }
    return NextResponse.json({
      ok: true,
      message: `${r.from} → ${r.to}: ${r.fetched} ${source.unit} from ${source.label} — ${parts.join(', ')}.`,
    })
  } catch (e) {
    console.error(`[CFO] sync ${body?.source} failed:`, e)
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e).slice(0, 300) })
  }
}
