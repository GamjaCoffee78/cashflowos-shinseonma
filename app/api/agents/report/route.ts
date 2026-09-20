import { NextResponse } from 'next/server'
import { getRecords } from '@/lib/records'
import { shopeeReport, formatShopeeReport, parseMonth, lastCompleteMonth } from '@/lib/shopee-report'

// The Head of Sales' READ-ONLY reports, for the AI Employees tab buttons.
//
// Deliberately separate from /api/agents/run: that one CREATES proposals a human
// must approve. This one only adds up rows and answers. It writes nothing, so
// there is nothing here to approve or undo.
//
// Gated by the APP_PASSCODE cookie — proxy.ts protects /api/agents/* like every tab.

export const dynamic = 'force-dynamic'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Telegram HTML → plain text, for the browser.
function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (String(body?.report || '') !== 'shopee') {
    return NextResponse.json({ ok: false, message: 'Unknown report.' }, { status: 400 })
  }

  const today = todayISO()
  const month = parseMonth(String(body?.month || ''), today) || lastCompleteMonth(today)
  const report = shopeeReport(await getRecords(), month, today)

  return NextResponse.json({
    ok: true,
    ...report,
    message: strip(formatShopeeReport(report)).replace(/\n+/g, ' · ').trim(),
  })
}
