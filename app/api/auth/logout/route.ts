import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

// Sign out: drop the session cookie and go back to the lock screen.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url))
  res.cookies.delete(SESSION_COOKIE)
  return res
}
