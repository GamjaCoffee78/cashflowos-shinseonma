import { NextResponse } from 'next/server'

// Why is TikTok refusing us? The app key and service id are not secrets — they
// travel in plain URLs — so they are shown in full; the secret is reported only
// by shape. "invalid client_key" almost always means one of these three holds
// the wrong value, or a stray space came along with a paste.
export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.TIKTOK_APP_KEY ?? ''
  const secret = process.env.TIKTOK_APP_SECRET ?? ''
  const service = process.env.TIKTOK_SERVICE_ID ?? ''
  return NextResponse.json({
    app_key: key.trim() || null,
    app_key_had_whitespace: key !== key.trim(),
    service_id: service.trim() || null,
    service_id_had_whitespace: service !== service.trim(),
    app_secret_length: secret.trim().length,          // a real one is 40+ chars
    app_secret_had_whitespace: secret !== secret.trim(),
    app_secret_looks_like_key: secret.trim() === key.trim(),
  })
}
