import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { SESSION_COOKIE, googleConfig, mintPasscodeSession, cookieOptions } from '@/lib/session'

// 🔒 Don't edit — this keeps your robot safe.
// Checks the passcode and, on success, hands back an opaque session cookie.
//
// Two safety details worth knowing:
//  1) TIMING-SAFE compare. We hash BOTH the submitted code and APP_PASSCODE to
//     fixed 32-byte SHA-256 digests, then crypto.timingSafeEqual them. Hashing
//     first guarantees equal length (timingSafeEqual throws on length mismatch)
//     AND means the comparison time never leaks the passcode's length.
//  2) The cookie is NEVER the raw passcode. It's `nonce.HMAC(nonce)` — an opaque
//     token signed with your passcode as the server secret. Nobody can read your
//     passcode out of it, and it can't be forged without the secret.

export const runtime = 'nodejs'   // needs Node crypto, not the edge runtime

export async function POST(req: Request) {
  // Google sign-in is on → the shared passcode no longer opens anything.
  if (googleConfig()) {
    return NextResponse.json({ ok: false, reason: 'google_only' }, { status: 403 })
  }

  const passcode = (process.env.APP_PASSCODE ?? '').trim()

  // No passcode configured → nothing to check. Tell the client calmly; the app
  // isn't gated in this state anyway (see proxy.ts).
  if (!passcode) {
    return NextResponse.json({ ok: false, reason: 'no_passcode_set' }, { status: 200 })
  }

  // Accept either JSON {passcode} or a posted form field, so the login page can be
  // simple. Never throw on a malformed body — just treat it as an empty attempt.
  let submitted = ''
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => null)
      if (body && typeof body.passcode === 'string') submitted = body.passcode
    } else {
      const form = await req.formData().catch(() => null)
      const v = form?.get('passcode')
      if (typeof v === 'string') submitted = v
    }
  } catch {
    submitted = ''
  }

  const a = crypto.createHash('sha256').update(submitted.trim()).digest()
  const b = crypto.createHash('sha256').update(passcode).digest()
  const ok = crypto.timingSafeEqual(a, b)

  if (!ok) {
    return NextResponse.json({ ok: false, reason: 'wrong_passcode' }, { status: 401 })
  }

  // Mint the opaque cookie: nonce + HMAC(nonce, passcode). proxy.ts re-checks
  // the signature on every request (lib/session.ts).
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await mintPasscodeSession(passcode), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
