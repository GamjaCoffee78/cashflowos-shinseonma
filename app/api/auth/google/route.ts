import { NextResponse, type NextRequest } from 'next/server'
import { googleConfig, randomToken, sha256b64url, cookieOptions, OAUTH_COOKIE, callbackUrl } from '@/lib/session'

// Step 1 of "Sign in with Google": send the visitor to Google's account picker.
// A one-time `state` (stops forged callbacks) and a PKCE verifier (stops a stolen
// code being redeemed elsewhere) ride along in a short-lived cookie.

export async function GET(req: NextRequest) {
  const google = googleConfig()
  if (!google) return NextResponse.redirect(new URL('/login', req.url))

  const state = randomToken()
  const verifier = randomToken()

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.searchParams.set('client_id', google.clientId)
  auth.searchParams.set('redirect_uri', callbackUrl(req))
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('scope', 'openid email')
  auth.searchParams.set('state', state)
  auth.searchParams.set('code_challenge', await sha256b64url(verifier))
  auth.searchParams.set('code_challenge_method', 'S256')
  auth.searchParams.set('prompt', 'select_account')

  const res = NextResponse.redirect(auth)
  res.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, { ...cookieOptions, maxAge: 600 })
  return res
}
