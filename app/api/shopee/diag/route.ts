import { NextResponse } from 'next/server'
import { shopeeDiagnose } from '@/lib/shopee'

// Why is Shopee refusing us? Answers with what the deployment actually holds
// (never the key itself — only its length and shape) plus Shopee's own raw
// reply to a signed public call, which is the quickest way to tell a wrong key
// from a wrong id from a wrong host.
//
// Behind the app's sign-in like every other route.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await shopeeDiagnose())
}
