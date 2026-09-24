import { ABANG } from '@/abang/config'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// Production Timeline → the "App updates" tab of the team's Google Sheet.
//
// WRITES to exactly one tab (ABANG.productionSheet.tab), which the app owns: it
// is cleared and rewritten in full on every change, so it always matches the
// app and can never drift or duplicate. No other tab is ever touched.
// Through the same Composio proxy as lib/google-sheets.ts; COMPOSIO_API_KEY
// stays server-side in Vercel.

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

export const productionSheetConfigured = () =>
  !!process.env.COMPOSIO_API_KEY?.trim() && !!ABANG.productionSheet.composioAccount && !!ABANG.productionSheet.spreadsheetId

async function proxy(method: 'GET' | 'POST' | 'PUT', endpoint: string, body?: unknown, query: Record<string, string> = {}) {
  const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.COMPOSIO_API_KEY!.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected_account_id: ABANG.productionSheet.composioAccount,
      method,
      endpoint,
      ...(body !== undefined ? { body } : {}),
      parameters: Object.entries(query).map(([name, value]) => ({ name, value, type: 'query' })),
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const out: any = await res.json().catch(() => ({}))
  const g = out?.data
  const err = out?.error?.message || out?.error || g?.error?.message
  if (!res.ok || err) throw new Error(String(err || `HTTP ${res.status}`).slice(0, 200))
  return g
}

const HEADER = ['Date', 'Task', 'Status', 'Done on', 'Moved from', 'Added in app', 'Last change']
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '')

// Rewrite the tab from the database. Returns a one-line result for the button.
export async function writeProductionSheet(): Promise<{ ok: boolean; message: string }> {
  if (!productionSheetConfigured()) return { ok: false, message: 'sheet not connected yet' }
  if (!supabaseConfigured) return { ok: false, message: 'database not connected' }
  const { spreadsheetId, tab } = ABANG.productionSheet
  const base = `${SHEETS}/${encodeURIComponent(spreadsheetId)}`
  try {
    // Only items the app has touched: added here, ticked, or moved.
    const { data, error } = await supabase
      .from('records')
      .select('title, status, due_date, meta')
      .eq('category', 'production')
      .order('due_date', { ascending: true })
      .limit(5000)
    if (error) throw new Error(error.message)
    const rows = (data ?? [])
      .filter((r: any) => r.meta?.source === 'app' || r.status === 'done' || (r.meta?.moved_from ?? []).length)
      .map((r: any) => {
        const moved = (r.meta?.moved_from ?? []) as { date: string; at: string }[]
        const last = [r.meta?.done_at, moved[moved.length - 1]?.at, r.meta?.created_at].filter(Boolean).sort().pop()
        return [
          day(r.due_date),
          r.title,
          r.status === 'done' ? 'Done' : 'Planned',
          day(r.meta?.done_at),
          moved.map(m => m.date).join(' → '),
          r.meta?.source === 'app' ? 'Yes' : '',
          last ? new Date(last).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : '',
        ]
      })

    // Make the tab if it isn't there yet ("already exists" is fine).
    try {
      await proxy('POST', `${base}:batchUpdate`, { requests: [{ addSheet: { properties: { title: tab } } }] })
    } catch (e) {
      if (!/already exists/i.test(String((e as Error).message))) throw e
    }
    const range = encodeURIComponent(`'${tab}'!A:G`)
    await proxy('POST', `${base}/values/${range}:clear`, {})
    await proxy('PUT', `${base}/values/${encodeURIComponent(`'${tab}'!A1`)}`, { values: [HEADER, ...rows] }, { valueInputOption: 'RAW' })
    return { ok: true, message: `sheet updated (${rows.length} item${rows.length === 1 ? '' : 's'})` }
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    if (/insufficient|scope|permission|forbidden|403/i.test(msg)) {
      return { ok: false, message: 'Google refused — the Composio Google Sheets connection needs edit access to this sheet' }
    }
    return { ok: false, message: `sheet not updated: ${msg.slice(0, 120)}` }
  }
}
