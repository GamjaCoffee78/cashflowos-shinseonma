import { NextResponse } from 'next/server'
import { handleStock } from '@/lib/stock-api'
import { checkStockShareToken } from '@/lib/stock-share'

// The stock-only share link's save button (lib/stock-share.ts). Public path
// (proxy.ts lets /share/* through), so the token is checked on every request.
// Full rights on the stock page (the owners chose this 2026-09-29): edit, add
// expiry batches, add products, undo.
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!checkStockShareToken(token)) return NextResponse.json({ ok: false, message: 'This link is no longer valid.' }, { status: 403 })
  return handleStock(req, { allowAddProduct: true, paths: ['/stock', `/share/stock/${token}`] })
}
