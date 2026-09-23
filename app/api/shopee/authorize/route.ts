import { NextResponse } from 'next/server'
import { authorizeUrl, shopeeConfigured } from '@/lib/shopee'

// Step 1 of linking a Shopee shop: send the shopkeeper to Shopee to say yes.
// Shopee bounces back to /api/shopee/callback with ?code=&shop_id=.
//
// Behind the passcode gate like every page (proxy.ts), so a stranger can't
// start an authorisation against this app.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!shopeeConfigured) {
    return NextResponse.json(
      { ok: false, message: 'Add SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY in Vercel → Settings → Environment Variables, then redeploy.' },
      { status: 400 },
    )
  }
  // The redirect must match what's registered on the Shopee app exactly.
  const redirect = `${new URL(req.url).origin}/api/shopee/callback`
  return NextResponse.redirect(authorizeUrl(redirect))
}
