import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { stockSheetConfigured, updateStockLine, addStockProduct, addStockBatch, undoStock, type Done } from '@/lib/stock-sheet'

// Stock tab → Google Sheet (lib/stock-sheet.ts). Gated by the login cookie
// like every route (proxy.ts).
//   { action: 'edit', row, expiry?, qty?, expected: { expiry, qty } }
//   { action: 'add', name, expiry, qty }
//   { action: 'undo', undo } — reverse the save that returned `undo`
//   { action: 'add_batch', row (product's first row), expiry, qty }
export const dynamic = 'force-dynamic'

const reply = (ok: boolean, message: string, status = 200, undo?: Done['undo']) => NextResponse.json({ ok, message, undo }, { status })
function parseQty(v: unknown): number | null | 'bad' {
  const s = String(v ?? '').replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 ? n : 'bad'
}

export async function POST(req: Request) {
  if (!stockSheetConfigured()) return reply(false, 'Stock sheet not connected.', 400)
  const body = await req.json().catch(() => ({}))
  try {
    if (body?.action === 'undo') {
      const msg = await undoStock(body?.undo)
      revalidatePath('/stock')
      return reply(true, msg)
    }
    if (body?.action === 'add') {
      const name = String(body?.name ?? '').trim().slice(0, 120)
      const qty = parseQty(body?.qty)
      if (!name) return reply(false, 'Give the product a name.', 400)
      if (qty === 'bad' || qty === null) return reply(false, 'Quantity must be a whole number (0 or more).', 400)
      const d = await addStockProduct(name, String(body?.expiry ?? ''), qty)
      revalidatePath('/stock')
      return reply(true, `Added to the sheet: ${d.message}`, 200, d.undo)
    }
    const row = Number(body?.row)
    if (!Number.isInteger(row) || row < 2) return reply(false, 'Which line?', 400)
    if (body?.action === 'add_batch') {
      const qty = parseQty(body?.qty)
      if (qty === 'bad' || qty === null) return reply(false, 'Quantity must be a whole number (0 or more).', 400)
      const d = await addStockBatch(row, String(body?.expiry ?? ''), qty)
      revalidatePath('/stock')
      return reply(true, `Added to the sheet: ${d.message}`, 200, d.undo)
    }
    const change: { expiry?: string; qty?: number | null } = {}
    if (body?.expiry !== undefined) change.expiry = String(body.expiry)
    if (body?.qty !== undefined) {
      const q = parseQty(body.qty)
      if (q === 'bad') return reply(false, 'Quantity must be a whole number (0 or more).', 400)
      change.qty = q
    }
    const d = await updateStockLine(row, change, {
      expiry: String(body?.expected?.expiry ?? ''),
      qty: String(body?.expected?.qty ?? ''),
    })
    revalidatePath('/stock')
    return reply(true, `Saved to the sheet: ${d.message}`, 200, d.undo)
  } catch (e) {
    return reply(false, String((e as Error)?.message || e), 409)
  }
}
