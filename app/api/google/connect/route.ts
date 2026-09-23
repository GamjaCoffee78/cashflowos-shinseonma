import { NextResponse } from 'next/server'
import { sheetsConfigured, activeSheetsAccount, sheetsConnectLink } from '@/lib/google-sheets'

// Link Google Sheets for the Owner sheet sync in one click: sends you to
// Google's "Allow" screen (through Composio) and back to /api/google/connected.
// No ca_ id to copy — the sync finds the new connection by itself.
//
// Behind the passcode gate like every page (proxy.ts).
export const dynamic = 'force-dynamic'

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font:16px/1.6 system-ui;padding:40px;max-width:34rem;margin:auto;background:#FAF7F2;color:#211C16">` +
      `<h1 style="font-size:20px">${title}</h1>${body}` +
      `<p><a href="/" style="color:#BE5C3B">← Back to the app</a></p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

export async function GET(req: Request) {
  if (!sheetsConfigured) return page('Composio isn’t configured', '<p>Add <code>COMPOSIO_API_KEY</code> in Vercel, then redeploy.</p>')
  const url = new URL(req.url)
  try {
    // Already linked? Don't make a second connection unless asked (?again=1).
    if (!url.searchParams.get('again')) {
      const existing = await activeSheetsAccount().catch(() => null)
      if (existing) {
        return page(
          '✅ Google Sheets is already linked',
          `<p>Connection <code>${existing}</code> is active. Go back and press <b>🔄 Sync now</b>.</p>` +
            `<p>Still getting a Google error? <a href="/api/google/connect?again=1">Link again</a> — sign in as the Google account that owns the sheet.</p>`,
        )
      }
    }
    return NextResponse.redirect(await sheetsConnectLink(`${url.origin}/api/google/connected`))
  } catch (e) {
    return page('⚠️ That didn’t work', `<p>${String((e as Error)?.message || e).slice(0, 300)}</p>`)
  }
}
