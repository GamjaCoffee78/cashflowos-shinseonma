import 'server-only'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { stockSheetConfigured, updateStockLine, addStockProduct, addStockBatch, undoStock, type Done, type Undo } from '@/lib/stock-sheet'
import { signUndo, checkUndoSig } from '@/lib/stock-share'

// The one handler behind both /api/stock (the team, logged in) and
// /share/stock/<token>/save (the stock-only share link).
//   { action: 'edit', row, expiry?, qty?, expected: { expiry, qty } }
//   { action: 'add_batch', row (product's first row), expiry, qty }
//   { action: 'add', name, expiry, qty }            — if allowAddProduct
//   { action: 'undo', undo }                         — reverse a save; the undo
//     must carry the signature this server gave it.
export type SignedUndo = Undo & { sig: string }

const reply = (ok: boolean, message: string, status = 200, undo?: Done['undo']) => {
  const signed = undo ? { ...undo, sig: signUndo(JSON.stringify(undo)) } : undefined
  return NextResponse.json({ ok, message, undo: signed }, { status })
}
function parseQty(v: unknown): number | null | 'bad' {
  const s = String(v ?? '').replace(/,/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 ? n : 'bad'
}

export async function handleStock(req: Request, opts: { allowAddProduct: boolean; paths: string[] }) {
  if (!stockSheetConfigured()) return reply(false, 'Stock sheet not connected.', 400)
  const body = await req.json().catch(() => ({}))
  const refresh = () => opts.paths.forEach(p => revalidatePath(p))
  try {
    if (body?.action === 'undo') {
      const { sig, ...undo } = (body?.undo ?? {}) as SignedUndo
      if (!checkUndoSig(JSON.stringify(undo), sig)) return reply(false, 'That undo is no longer valid.', 400)
      const msg = await undoStock(undo as Undo)
      refresh()
      return reply(true, msg)
    }
    if (body?.action === 'add') {
      if (!opts.allowAddProduct) return reply(false, 'Adding products is not allowed from this link.', 403)
      const name = String(body?.name ?? '').trim().slice(0, 120)
      const qty = parseQty(body?.qty)
      if (!name) return reply(false, 'Give the product a name.', 400)
      if (qty === 'bad' || qty === null) return reply(false, 'Quantity must be a whole number (0 or more).', 400)
      const d = await addStockProduct(name, String(body?.expiry ?? ''), qty)
      refresh()
      return reply(true, `Added to the sheet: ${d.message}`, 200, d.undo)
    }
    const row = Number(body?.row)
    if (!Number.isInteger(row) || row < 2) return reply(false, 'Which line?', 400)
    if (body?.action === 'add_batch') {
      const qty = parseQty(body?.qty)
      if (qty === 'bad' || qty === null) return reply(false, 'Quantity must be a whole number (0 or more).', 400)
      const d = await addStockBatch(row, String(body?.expiry ?? ''), qty)
      refresh()
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
    refresh()
    return reply(true, `Saved to the sheet: ${d.message}`, 200, d.undo)
  } catch (e) {
    return reply(false, String((e as Error)?.message || e), 409)
  }
}
