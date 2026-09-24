import { NextResponse, type NextRequest } from 'next/server'
import {
  SESSION_COOKIE, SESSION_DAYS, googleConfig, isAllowedEmail, mintGoogleSession, b64urlDecode, cookieOptions,
  OAUTH_COOKIE, callbackUrl,
} from '@/lib/session'

// Step 2 of "Sign in with Google": Google sends the visitor back here with a
// one-time code. We swap it for an ID token, check WHO it is, and only mint the
// session cookie if their email is on ALLOWED_EMAILS.
//
// The ID token comes straight from Google's token endpoint over HTTPS, using our
// client secret, so per OpenID Connect (Core §3.1.3.7) its claims can be trusted
// without re-verifying Google's signature. We still check iss / aud / exp.

function fail(req: NextRequest, reason: string, email?: string) {
  const url = new URL('/login', req.url)
  url.searchParams.set('error', reason)
  if (email) url.searchParams.set('email', email)
  const res = NextResponse.redirect(url)
  res.cookies.delete(OAUTH_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const google = googleConfig()
  if (!google) return fail(req, 'not_configured')

  const params = req.nextUrl.searchParams
  if (params.get('error')) return fail(req, 'cancelled')          // they closed / denied the Google screen

  const [state, verifier] = (req.cookies.get(OAUTH_COOKIE)?.value ?? '').split('.')
  const code = params.get('code')
  if (!state || !verifier || !code || params.get('state') !== state) return fail(req, 'expired')

  let idToken: string | undefined
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: callbackUrl(req),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
      cache: 'no-store',
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) console.error('google token exchange failed', r.status, body?.error, body?.error_description)
    idToken = body?.id_token
  } catch (e) {
    console.error('google token exchange threw', e)
  }
  if (!idToken) return fail(req, 'google_error')

  let claims: { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean }
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken.split('.')[1] ?? '')))
  } catch {
    return fail(req, 'google_error')
  }

  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  const fresh = typeof claims.exp === 'number' && claims.exp > Date.now() / 1000
  if (!issOk || claims.aud !== google.clientId || !fresh) return fail(req, 'google_error')

  const email = (claims.email ?? '').toLowerCase()
  if (!email || claims.email_verified !== true || !isAllowedEmail(email)) {
    console.warn('sign-in refused for', email || '(no email)')
    return fail(req, 'not_allowed', email)
  }

  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.delete(OAUTH_COOKIE)
  res.cookies.set(SESSION_COOKIE, await mintGoogleSession(email, google.secret), {
    ...cookieOptions,
    maxAge: SESSION_DAYS * 86400,
  })
  return res
}
