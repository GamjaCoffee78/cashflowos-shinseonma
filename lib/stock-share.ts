import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// 📦 The stock-only share link: /share/stock/<sig>. Whoever has it can open the
// Stock page with full rights on it (edit, add batches, add products, undo) — nothing
// else in the app (no menu, no money, no other tab; proxy.ts only lets /share/*
// through, and every other path still needs the login).
//
// One link for everyone you share with. To switch it off and make a new one,
// set STOCK_SHARE_VERSION in Vercel to a new value (2, 3, …) and redeploy —
// the old link stops working at once. STOCK_SHARE_VERSION=off disables sharing.
// Rotating AUTH_SECRET also retires it (same secret as lib/billing-share.ts).
function secret() {
  return (process.env.AUTH_SECRET ?? '').trim() || (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
}
const version = () => (process.env.STOCK_SHARE_VERSION ?? '1').trim() || '1'
const hmac = (s: string) => createHmac('sha256', secret()).update(s).digest('hex')

export function stockShareToken(): string | null {
  if (!secret() || version() === 'off') return null
  return hmac(`stock-share.v${version()}`).slice(0, 32)
}

export function checkStockShareToken(token: string): boolean {
  const want = stockShareToken()
  if (!want || !/^[0-9a-f]{32}$/.test(token)) return false
  return timingSafeEqual(Buffer.from(want), Buffer.from(token))
}

// Undo payloads round-trip through the browser, so they're signed: only an
// undo this server handed out can be replayed (never a made-up "delete row").
export const signUndo = (payload: string) => hmac(`stock-undo.${payload}`).slice(0, 32)
export function checkUndoSig(payload: string, sig: string): boolean {
  if (!secret() || !/^[0-9a-f]{32}$/.test(String(sig))) return false
  return timingSafeEqual(Buffer.from(signUndo(payload)), Buffer.from(sig))
}
