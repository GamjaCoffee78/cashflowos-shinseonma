import { NextResponse } from 'next/server'
import { exchangeCode, saveAuth, shopInfo, shopeeConfigured } from '@/lib/shopee'

// Step 2: Shopee sends the shopkeeper back here with a one-time code. We trade
// it for the access + refresh tokens and store them in `shopee_auth`, then send
// them to the Ecomm tab. The code is single-use and dies in minutes.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font:16px/1.6 system-ui;padding:40px;max-width:34rem;margin:auto;background:#FAF7F2;color:#211C16">` +
      `<h1 style="font-size:20px">${title}</h1>${body}` +
      `<p><a href="/ecomm" style="color:#BE5C3B">← Back to the app</a></p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const shopId = Number(url.searchParams.get('shop_id'))
  if (!shopeeConfigured) return page('Shopee isn’t configured', '<p>Add <code>SHOPEE_PARTNER_ID</code> and <code>SHOPEE_PARTNER_KEY</code> in Vercel, then redeploy.</p>')
  if (!code || !shopId) return page('Something came back empty', '<p>Shopee didn’t send a code and a shop id. Start again from <a href="/api/shopee/authorize">the authorise link</a>.</p>')

  try {
    const auth = await exchangeCode(code, shopId)
    // Ask Shopee which shop this is — the region decides which tab it feeds.
    const info = await shopInfo(shopId, auth.access_token)
    await saveAuth(auth, info)
    const region = (info.region || '').toUpperCase()
    return page(
      '✅ Shopee is linked',
      `<p><b>${info.shop_name || `Shop ${shopId}`}</b>${region ? ` (${region})` : ''} is authorised. Its orders now sync every morning with the brief — or press <b>Sync now</b> on the ` +
        `${region ? `Shopee ${region}` : 'Shopee'} tab.</p>` +
        `<p>Linking a second shop? Open this authorise link again while signed in to that shop's Seller Centre.</p>`,
    )
  } catch (e) {
    return page('⚠️ That didn’t work', `<p>${String((e as Error)?.message || e).slice(0, 300)}</p><p>Try <a href="/api/shopee/authorize">authorising again</a> — the code Shopee sends is single-use and expires quickly.</p>`)
  }
}
