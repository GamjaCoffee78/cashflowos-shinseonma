import { ABANG } from '@/abang/config'

// Google Sheets → this app, through the SAME Composio proxy the Calendar sync
// uses. One job only: hand back the cells of a tab as rows of strings.
//
// READ-ONLY. Nothing here ever writes to a Google Sheet.
// Secrets: COMPOSIO_API_KEY only (server-only, from Vercel env). The
// spreadsheet id and the connected-account id are plain settings in
// abang/config.ts — ids, not secrets.
export const sheetsConfigured = !!process.env.COMPOSIO_API_KEY?.trim()

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')

// A1 range covering the whole of the first tab when no tab is named. Wide
// enough for a 28-month tracker plus its TOTAL / FY columns, tall enough for
// every line item, and cheap: Google only returns the cells that exist.
const WHOLE_TAB = 'A1:AZ400'

// Ask Google for one tab, FORMATTED as a person sees it: "Sep-24" stays
// "Sep-24" instead of arriving as a date serial, and "97,965.00" arrives as
// that string, which parseAmount() below turns back into a number. One render
// option for the whole grid keeps the parser honest about what it received.
export async function fetchSheetValues(spreadsheetId: string, tab = ''): Promise<string[][]> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const account = await sheetsAccount()
  const range = tab ? `${tab}!${WHOLE_TAB}` : WHOLE_TAB

  const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected_account_id: account,
      method: 'GET',
      endpoint: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      parameters: [
        { name: 'valueRenderOption', value: 'FORMATTED_VALUE', type: 'query' },
        { name: 'majorDimension', value: 'ROWS', type: 'query' },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  })
  const body: any = await res.json().catch(() => ({}))
  const g = body?.data
  if (!res.ok || body?.error || g?.error) {
    const msg = String(body?.error?.message || g?.error?.message || `HTTP ${res.status}`)
    // The most likely first-run failure by far: the linked Google account was
    // connected for Calendar only, so Sheets comes back 403 insufficient scope.
    // Say what to do instead of leaving a bare Google error on screen.
    if (/insufficient|scope|permission|forbidden|403/i.test(msg)) {
      throw new Error(
        `Google refused: ${msg.slice(0, 120)}. The linked Google account needs spreadsheets.readonly — ` +
          'open /api/google/connect in this app, sign in to Google and press Allow, then press Sync again.',
      )
    }
    throw new Error(`Composio/Google said no: ${msg.slice(0, 200)}`)
  }
  const values = g?.values
  if (!Array.isArray(values)) throw new Error('Google returned no cells for that tab.')
  return values.map((row: any[]) => (row ?? []).map(c => String(c ?? '')))
}

// ---- Which Composio connection reads the sheet ----
// 1. ABANG.ownerSheet.composioAccount, if someone typed one in.
// 2. Otherwise an ACTIVE Google Sheets connection in the Composio project —
//    the one /api/google/connect creates — so nobody has to copy a ca_ id.
// 3. Otherwise the Calendar connection (which usually lacks Sheets scope, and
//    then the error above tells you to open /api/google/connect).
async function composio(path: string, init: RequestInit = {}): Promise<any> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const res = await fetch(`${COMPOSIO_URL}${path}`, {
    ...init,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000),
  })
  const body: any = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) {
    const msg = body?.error?.message || body?.message || body?.error || `HTTP ${res.status}`
    throw new Error(`Composio said no (${path.split('?')[0]}): ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`)
  }
  return body
}

export async function activeSheetsAccount(): Promise<string | null> {
  const body = await composio('/api/v3/connected_accounts?toolkit_slugs=googlesheets&statuses=ACTIVE&limit=20')
  const items: any[] = Array.isArray(body?.items) ? body.items : []
  const hit = items.find(a => String(a?.status || '').toUpperCase() === 'ACTIVE' && a?.id) || items.find(a => a?.id)
  return hit ? String(hit.id) : null
}

async function sheetsAccount(): Promise<string> {
  if (ABANG.ownerSheet.composioAccount) return ABANG.ownerSheet.composioAccount
  try {
    const found = await activeSheetsAccount()
    if (found) return found
  } catch {
    // Listing failed — fall through to the Calendar connection; the Sheets call
    // itself will then report what's wrong.
  }
  return ABANG.calendar.composioAccount
}

// Start linking Google Sheets: find (or create) a Composio-managed Google Sheets
// auth config, then ask Composio for a one-time link that sends the person to
// Google's own "Allow" screen and back to `callbackUrl`.
export async function sheetsConnectLink(callbackUrl: string): Promise<string> {
  const configs = await composio('/api/v3/auth_configs?toolkit_slug=googlesheets&limit=20')
  let authConfigId: string | undefined = (Array.isArray(configs?.items) ? configs.items : []).find((c: any) => c?.id)?.id
  if (!authConfigId) {
    const made = await composio('/api/v3/auth_configs', {
      method: 'POST',
      body: JSON.stringify({ toolkit: { slug: 'googlesheets' }, auth_config: { type: 'use_composio_managed_auth' } }),
    })
    authConfigId = made?.auth_config?.id || made?.id
  }
  if (!authConfigId) throw new Error('Composio did not return a Google Sheets auth config id.')
  const link = await composio('/api/v3/connected_accounts/link', {
    method: 'POST',
    body: JSON.stringify({ auth_config_id: authConfigId, user_id: 'okmaya-owner-sheet', callback_url: callbackUrl }),
  })
  const url = link?.redirect_url || link?.redirectUrl
  if (!url) throw new Error('Composio did not return a sign-in link.')
  return String(url)
}

// "97,965.00" → 97965 · "RM 1,200" → 1200 · "" / "-" / "n/a" → null.
// null means "no figure here", which is NOT the same as a real 0.00 cell.
export function parseAmount(cell: string): number | null {
  const s = String(cell ?? '').replace(/[^\d.\-]/g, '')
  if (!s || s === '-' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// "Sep-24" → "2024-09-01". Anything that isn't a month header → null, which is
// how the parser tells a month column apart from TOTAL / FY2025 / blank ones.
export function monthHeaderToDate(header: string): string | null {
  const m = /^([A-Za-z]{3})[-\s/]?(\d{2}|\d{4})$/.exec(String(header ?? '').trim())
  if (!m) return null
  const mi = MONTHS.indexOf(m[1].toLowerCase())
  if (mi < 0) return null
  const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return `${yy}-${String(mi + 1).padStart(2, '0')}-01`
}

// The reverse, for matching a row already in the database back to its cell.
export const monthOf = (iso: string) => String(iso ?? '').slice(0, 7)
