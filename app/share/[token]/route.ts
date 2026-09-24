import { createElement } from 'react'
import { getDoc } from '@/lib/billing'
import { readShareToken } from '@/lib/billing-share'
import { COMPANY, DOC_TYPES } from '@/lib/billing-shared'
import DocSheet from '@/app/_components/DocSheet'

// The page a customer or supplier opens from a WhatsApp / email link. It is a
// standalone HTML page (no sidebar, no login) showing ONE document, checked by
// the signed token (lib/billing-share.ts). proxy.ts lets /share/* through.

export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = readShareToken(token)
  const doc = id ? await getDoc(id) : null
  if (!doc) return new Response('This link is not valid. Please ask Okmaya for a new one.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

  // Loaded at runtime: Next forbids a static react-dom/server import in app/.
  const { renderToStaticMarkup } = await import('react-dom/server')
  const sheet = renderToStaticMarkup(createElement(DocSheet, { doc })).replace(/<link[^>]*doc-print\.css[^>]*>/, '')
  const title = esc(`${DOC_TYPES[doc.type].label} ${doc.number} · ${COMPANY.name}`)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title>
<meta property="og:title" content="${title}">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/doc-print.css">
<style>
body{margin:0;background:#F4EDE2;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:18px 16px 40px}
.bar{display:flex;justify-content:flex-end;margin-bottom:12px}
.bar button{background:#1E4C96;color:#fff;border:0;border-radius:12px;padding:10px 16px;font:600 14px system-ui;cursor:pointer}
@media print{.bar{display:none}.wrap{padding:0}body{background:#fff}}
</style></head><body><div class="wrap">
<div class="bar"><button onclick="window.print()">Download / Print PDF</button></div>
${sheet}
</div></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } })
}
