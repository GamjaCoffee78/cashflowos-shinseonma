import { lockMode } from '@/lib/session'
import PasscodeForm from './PasscodeForm'

// The lock screen. With Google sign-in configured it's one "Sign in with Google"
// button (only emails on ALLOWED_EMAILS get past it); otherwise it's the old
// passcode field. /login is EXCLUDED from the gate in proxy.ts.

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  not_allowed: "isn't on this team's list. Ask the owner to add you, then try again.",
  cancelled: 'Sign-in was cancelled. Try again whenever you like.',
  expired: 'That sign-in took too long or came from another tab. Please try again.',
  google_error: "Google didn't confirm who you are. Please try again.",
  not_configured: 'Google sign-in isn\'t set up on this deployment yet.',
}

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (lockMode() !== 'google') return <PasscodeForm />

  const { error, email } = await searchParams
  const message = error
    ? error === 'not_allowed'
      ? `${email || 'That Google account'} ${ERRORS.not_allowed}`
      : ERRORS[error] ?? ERRORS.google_error
    : ''

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 8 }}>
          <img className="logo" src="/icons/icon-192.png" alt="" width={28} height={28} style={{ borderRadius: 6, verticalAlign: '-7px' }} /> Okmaya
        </div>
        <h1 className="ph" style={{ fontSize: 18 }}>Sign in</h1>
        <p className="cap" style={{ margin: '4px 0 16px' }}>
          Team members only. Use the Google account the owner added to the list.
        </p>
        {message ? <p className="login-error" style={{ margin: '0 0 12px' }}>{message}</p> : null}
        {/* A plain link, not fetch(): the browser must follow Google's redirects itself. */}
        <a className="btn" href="/api/auth/google" style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none' }}>
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
