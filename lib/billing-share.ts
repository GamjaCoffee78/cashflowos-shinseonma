import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// Share links for billing documents: /share/<id>-<sig>. The signature is an
// HMAC of the document id, so a link opens exactly one document and cannot be
// guessed or changed to another id. Rotating AUTH_SECRET (or the Supabase
// service key, the fallback) retires every link ever sent.
function secret() {
  return (process.env.AUTH_SECRET ?? '').trim() || (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
}

const sign = (id: number) => createHmac('sha256', secret()).update(`billing-share.${id}`).digest('hex').slice(0, 32)

export function shareToken(id: number): string | null {
  if (!secret()) return null
  return `${id}-${sign(id)}`
}

export function readShareToken(token: string): number | null {
  const m = /^(\d+)-([0-9a-f]{32})$/.exec(token)
  if (!m || !secret()) return null
  const id = Number(m[1])
  const want = Buffer.from(sign(id)), got = Buffer.from(m[2])
  return want.length === got.length && timingSafeEqual(want, got) ? id : null
}
