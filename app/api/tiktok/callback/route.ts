import { NextResponse } from 'next/server'
import { exchangeCode, authorisedShopsFrom, saveAuth, tiktokShopConfigured } from '@/lib/tiktok-shop'

// Step 2: TikTok sends the seller back with a one-time code. We trade it for
// the tokens, ask which shops it covers, and store one row per shop — the
// `cipher` is what every later shop-scoped call needs.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font:16px/1.6 system-ui;padding:40px;max-width:34rem;margin:auto;background:#FAF7F2;color:#211C16">` +
      `<h1 style="font-size:20px">${title}</h1>${body}` +
      `<p><a href="/tiktok-shop" style="color:#BE5C3B">← Back to the app</a></p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')
  if (!tiktokShopConfigured) return page('TikTok Shop isn’t configured', '<p>Add <code>TIKTOK_APP_KEY</code> and <code>TIKTOK_APP_SECRET</code> in Vercel, then redeploy.</p>')
  if (!code) return page('Something came back empty', '<p>TikTok didn’t send a code. Start again from <a href="/api/tiktok/authorize">the authorise link</a>.</p>')

  try {
    const token = await exchangeCode(code)
    const shops = await authorisedShopsFrom(token.access_token)
    if (!shops.length) {
      return page('⚠️ No shop came back', '<p>TikTok accepted the authorisation but listed no shops for this app. If the app’s permissions are still “Awaiting review”, wait for approval and try again.</p>')
    }
    await saveAuth(
      shops.map(s => ({
        shop_id: s.id,
        shop_name: s.name,
        region: s.region,
        cipher: s.cipher,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_at,
      })),
    )
    const names = shops.map(s => `${s.name || s.id}${s.region ? ` (${s.region})` : ''}`).join(', ')
    return page('✅ TikTok Shop is linked', `<p><b>${names}</b> authorised. Orders now sync every morning with the brief — or press <b>Sync now</b> on the TikTok Shop tab.</p>`)
  } catch (e) {
    return page('⚠️ That didn’t work', `<p>${String((e as Error)?.message || e).slice(0, 300)}</p><p>Try <a href="/api/tiktok/authorize">authorising again</a> — the code TikTok sends is single-use and expires quickly.</p>`)
  }
}
