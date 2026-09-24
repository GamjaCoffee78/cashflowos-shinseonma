import { NextResponse } from 'next/server'
import { authorizeUrl, tiktokShopConfigured, serviceIdSet } from '@/lib/tiktok-shop'

// Step 1 of linking a TikTok shop: send the seller to TikTok to say yes.
// TikTok bounces back to /api/tiktok/callback with ?code=.
//
// The redirect is configured on the app in TikTok Partner Center, not passed
// here — so it must be set to <this app>/api/tiktok/callback there.
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!tiktokShopConfigured) {
    return NextResponse.json(
      { ok: false, message: 'Add TIKTOK_APP_KEY and TIKTOK_APP_SECRET in Vercel → Settings → Environment Variables, then redeploy.' },
      { status: 400 },
    )
  }
  if (!serviceIdSet) {
    return NextResponse.json(
      { ok: false, message: 'Add TIKTOK_SERVICE_ID (Partner Center → your app) in Vercel, then redeploy.' },
      { status: 400 },
    )
  }
  return NextResponse.redirect(authorizeUrl())
}
