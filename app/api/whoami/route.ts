import { NextResponse } from 'next/server'

// What IP does this deployment call the outside world from?
//
// Shopee's Open Platform console demands at least one IP under "APP IP Address
// Management" (even with the whitelist switched OFF), so we answer with the
// real egress IP instead of a made-up one. On Vercel's Hobby plan that IP is
// not stable — which is exactly why the whitelist stays disabled.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ip = (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) })).text()).trim()
    return NextResponse.json({ egress_ip: ip })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 502 })
  }
}
