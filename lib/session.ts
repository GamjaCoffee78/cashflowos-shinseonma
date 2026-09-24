// The session cookie — minted by the login routes, checked by proxy.ts.
//
// Two lock modes, picked from env:
//   • GOOGLE  — GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set. Only people whose
//     Google email is in ALLOWED_EMAILS get in. The passcode is switched OFF.
//   • PASSCODE — only APP_PASSCODE set. The old shared-code lock.
//   • neither → no lock (the app stays open, as before).
//
// Every cookie is SIGNED and checked on every request. (Before this file the
// proxy only checked that a `cfo_session` cookie EXISTED, so any value got in.)
//
// Uses Web Crypto, not node:crypto, so the same code runs in proxy.ts and in
// route handlers whatever runtime Next picks for them.

export const SESSION_COOKIE = 'cfo_session'
export const SESSION_DAYS = 14
// Holds the one-time Google `state` + PKCE verifier for the 10 minutes of sign-in.
export const OAUTH_COOKIE = 'cfo_oauth'

const enc = new TextEncoder()

export function googleConfig() {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) return null
  // AUTH_SECRET signs the cookies. Optional: falls back to the client secret so
  // setup is one variable shorter. Rotating either logs everyone out — by design.
  const secret = (process.env.AUTH_SECRET ?? '').trim() || clientSecret
  return { clientId, clientSecret, secret }
}

// The callback URL Google redirects back to. It must be listed EXACTLY under
// "Authorised redirect URIs" in Google Cloud. AUTH_URL pins it (e.g. a custom
// domain); otherwise it's whatever host the request came in on.
export function callbackUrl(req: { nextUrl: { origin: string } }) {
  const base = (process.env.AUTH_URL ?? '').trim().replace(/\/+$/, '') || req.nextUrl.origin
  return `${base}/api/auth/google/callback`
}

export function passcode() {
  return (process.env.APP_PASSCODE ?? '').trim()
}

export type LockMode = 'google' | 'passcode' | 'open'
export function lockMode(): LockMode {
  if (googleConfig()) return 'google'
  if (passcode()) return 'passcode'
  return 'open'
}

// ALLOWED_EMAILS: comma-separated. `boss@gmail.com` allows one person;
// `@okmaya.com` allows a whole Google Workspace domain. Empty = nobody (fail closed).
export function isAllowedEmail(email: string) {
  const e = email.trim().toLowerCase()
  if (!e.includes('@')) return false
  const domain = e.slice(e.lastIndexOf('@'))
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .some(entry => (entry.startsWith('@') ? entry === domain : entry === e))
}

// ---- small crypto helpers ----

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256b64url(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))))
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time string compare (both sides are hex digests of equal length).
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---- Google sessions: `g.<payload>.<hmac>` ----

export async function mintGoogleSession(email: string, secret: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400
  const payload = b64url(enc.encode(JSON.stringify({ email: email.toLowerCase(), exp })))
  return `g.${payload}.${await hmacHex(secret, `g.${payload}`)}`
}

// Returns the signed-in email, or null. Re-checks ALLOWED_EMAILS every time, so
// removing someone from the list locks them out on their next click.
export async function readGoogleSession(token: string | undefined, secret: string) {
  if (!token) return null
  const [tag, payload, sig] = token.split('.')
  if (tag !== 'g' || !payload || !sig) return null
  if (!safeEqual(sig, await hmacHex(secret, `g.${payload}`))) return null
  try {
    const { email, exp } = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)))
    if (typeof email !== 'string' || typeof exp !== 'number') return null
    if (exp < Date.now() / 1000) return null
    return isAllowedEmail(email) ? email : null
  } catch {
    return null
  }
}

// ---- Passcode sessions: `<nonce>.<HMAC(nonce, APP_PASSCODE)>` ----
// Same format /api/login has always minted, so existing cookies keep working.

export async function mintPasscodeSession(code: string) {
  const nonce = crypto.randomUUID()
  return `${nonce}.${await hmacHex(code, nonce)}`
}

export async function checkPasscodeSession(token: string | undefined, code: string) {
  if (!token) return false
  const [nonce, sig] = token.split('.')
  if (!nonce || !sig) return false
  return safeEqual(sig, await hmacHex(code, nonce))
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}
