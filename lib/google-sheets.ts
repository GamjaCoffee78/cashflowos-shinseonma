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
  const account = ABANG.ownerSheet.composioAccount || ABANG.calendar.composioAccount
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
          're-link Google in your Composio project with Sheets read access, then press Sync again.',
      )
    }
    throw new Error(`Composio/Google said no: ${msg.slice(0, 200)}`)
  }
  const values = g?.values
  if (!Array.isArray(values)) throw new Error('Google returned no cells for that tab.')
  return values.map((row: any[]) => (row ?? []).map(c => String(c ?? '')))
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
