import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, googleConfig, passcode, readGoogleSession, checkPasscodeSession } from '@/lib/session'

// 🔒 Don't edit — this keeps your robot safe.
// The login gate. In Next 16 this file is called `proxy.ts` (the old name
// `middleware.ts` is deprecated and would print scary warnings for beginners).
//
// Which lock is on depends on env (see lib/session.ts):
//   • Google sign-in (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set) — only the
//     emails in ALLOWED_EMAILS get in. The passcode is ignored in this mode.
//   • Passcode (only APP_PASSCODE set) — the shared-code lock.
//   • Neither — we DON'T gate anything, so a half-configured clone never locks
//     you out of your own HQ.
// Either way the cookie's signature is checked on every request; a made-up
// cookie value is bounced to /login.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const google = googleConfig()

  let ok: boolean
  if (google) ok = !!(await readGoogleSession(token, google.secret))
  else if (passcode()) ok = await checkPasscodeSession(token, passcode())
  else return NextResponse.next()                     // no lock installed → open door

  if (ok) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  const res = NextResponse.redirect(url)
  if (token) res.cookies.delete(SESSION_COOKIE)       // stale / forged / revoked → clear it
  return res
}

// The matcher protects every page EXCEPT the ones below, which must stay reachable
// without the cookie:
//   • /login, /api/login      — you can't log in through a locked login page
//   • /api/auth/*             — the Google sign-in redirect + callback, and sign-out
//   • /api/telegram           — Telegram's webhook (has its own secret-header guard)
//   • /api/cron-daily         — the daily cron (has its own fail-closed Bearer guard)
//   • /manifest.webmanifest   — the REAL PWA manifest (app/manifest.ts serves HERE);
//     /manifest.json          — belt-and-braces extra so install never silently breaks
//   • /icons/*, /favicon.ico, /_next/* — static assets the install/render needs
//   • /share/*, /doc-print.css — a billing document sent to a customer by link.
//     Guarded by its own signature (lib/billing-share.ts): only a link the app
//     minted opens, and only that one document.
// A single missed exclusion here = a locked webhook on class day, so this list is tested.
export const config = {
  matcher: [
    '/((?!login|api/login|api/auth|api/telegram|api/cron-daily|share/|doc-print\\.css|manifest\\.webmanifest|manifest\\.json|icons|_next|favicon\\.ico).*)',
  ],
}
