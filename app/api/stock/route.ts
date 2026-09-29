import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { stockSheetConfigured, writeStockQty } from '@/lib/stock-sheet'

// Stock tab → Google Sheet. POST { row, qty, expected } writes ONE QTY cell of
// the latest count (lib/stock-sheet.ts). Gated by the login cookie like every
// route (proxy.ts).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!stockSheetConfigured()) return NextResponse.json({ ok: false, message: 'Stock sheet not connected.' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const row = Number(body?.row)
  const s = String(body?.qty ?? '').trim()
  const qty = s === '' ? null : Number(s)
  if (!Number.isInteger(row) || row < 2) return NextResponse.json({ ok: false, message: 'Which line?' }, { status: 400 })
  if (qty !== null && (!Number.isFinite(qty) || qty < 0)) return NextResponse.json({ ok: false, message: 'Enter a number (0 or more).' }, { status: 400 })
  try {
    const msg = await writeStockQty(row, qty, String(body?.expected ?? ''))
    revalidatePath('/stock')
    return NextResponse.json({ ok: true, message: `Saved to sheet: ${msg}` })
  } catch (e) {
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 409 })
  }
}
