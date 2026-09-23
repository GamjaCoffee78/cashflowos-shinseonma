import { NextResponse } from 'next/server'
import { activeSheetsAccount } from '@/lib/google-sheets'

// Where Composio sends you back after Google's "Allow" screen.
export const dynamic = 'force-dynamic'

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font:16px/1.6 system-ui;padding:40px;max-width:34rem;margin:auto;background:#FAF7F2;color:#211C16">` +
      `<h1 style="font-size:20px">${title}</h1>${body}` +
      `<p><a href="/" style="color:#BE5C3B">← Back to the app</a></p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

export async function GET() {
  const id = await activeSheetsAccount().catch(() => null)
  return id
    ? page('✅ Google Sheets is linked', `<p>Connection <code>${id}</code> is active. Go back and press <b>🔄 Sync now</b> — the Owner sheet line should turn green.</p>`)
    : page('⚠️ Not linked yet', '<p>Composio doesn’t show an active Google Sheets connection. <a href="/api/google/connect?again=1">Try again</a> and press <b>Allow</b> on Google’s screen.</p>')
}
