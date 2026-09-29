import { ABANG } from '@/abang/config'

// 📦 Stock count ⇄ "OMYG STOCK COUNT_2026" (ABANG.stockSheet).
//
// The SHEET is the only store: nothing is copied into Supabase, so an edit made
// in the sheet shows on the Stock tab the next time it loads, and an edit made
// on the Stock tab is written straight into the sheet cell.
//
// Layout (tab "OMY GROUP"): row 1 = headers, row 2 = "AS OF dd/mm/yyyy".
// From column C, each count is a block of three columns: EXPIRY DATE · QTY ·
// TOTAL. Product NO. / name are merged down over their expiry-batch rows, so the
// API only returns them on the first row — they are carried down here.
//
// WRITES, all in the LATEST block only (today I–K):
//  • edit a line → its EXPIRY DATE and/or QTY cell, only if both still hold what
//    the person saw (so two people can't silently overwrite each other);
//  • add a product → one new row after the last stock line (NO., name, expiry,
//    qty, total). Existing TOTAL cells and older counts are never written.

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

export const stockSheetConfigured = () =>
  !!process.env.COMPOSIO_API_KEY?.trim() && !!ABANG.stockSheet.composioAccount && !!ABANG.stockSheet.spreadsheetId

async function proxy(method: 'GET' | 'POST' | 'PUT', endpoint: string, body?: unknown, query: Record<string, string> = {}) {
  const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.COMPOSIO_API_KEY!.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected_account_id: ABANG.stockSheet.composioAccount,
      method,
      endpoint,
      ...(body !== undefined ? { body } : {}),
      parameters: Object.entries(query).map(([name, value]) => ({ name, value, type: 'query' })),
    }),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  const out: any = await res.json().catch(() => ({}))
  const g = out?.data
  const err = out?.error?.message || out?.error || g?.error?.message
  if (!res.ok || err) {
    const msg = String(err || `HTTP ${res.status}`)
    if (/insufficient|scope|permission|forbidden|403|not found|404/i.test(msg)) {
      throw new Error(`Google refused (${msg.slice(0, 80)}). Share the stock sheet as Editor with the Google account linked in Composio.`)
    }
    throw new Error(msg.slice(0, 200))
  }
  return g
}

const base = () => `${SHEETS}/${encodeURIComponent(ABANG.stockSheet.spreadsheetId)}`
const colL = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)))
const cellA1 = (col: number, row: number) => `'${ABANG.stockSheet.tab}'!${colL(col)}${row + 1}`

export type StockBatch = {
  row: number          // 0-based sheet row
  expiry: string       // "Apr-2028" or '' (latest block's EXPIRY DATE cell)
  qty: number | null   // latest block's QTY cell
  rawExpiry: string    // both cells exactly as read (for the overwrite check)
  rawQty: string
}
export type StockProduct = { no: string; name: string; total: number; batches: StockBatch[] }
export type StockCount = { asOf: string; products: StockProduct[]; lastRow: number; cols: { exp: number; qty: number; total: number } }

const num = (s: string) => {
  const t = String(s ?? '').replace(/[^\d.\-]/g, '')
  if (!t || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// Only the LATEST count block is shown or written (today: columns I–K,
// "AS OF 11/09/2026"). Older blocks are only used to tell which rows are
// stock lines, and are never written.
export function parseStockGrid(grid: string[][]): StockCount {
  const h = grid[0] ?? [], d = grid[1] ?? []
  const blocks: { exp: number; qty: number; asOf: string }[] = []
  for (let c = 1; c < h.length; c++) {
    if (/^qty$/i.test((h[c] ?? '').trim()) && /expiry/i.test(h[c - 1] ?? '')) {
      blocks.push({ exp: c - 1, qty: c, asOf: (d[c - 1] || d[c] || '').replace(/^\s*as\s+of\s*/i, '').trim() })
    }
  }
  if (!blocks.length) throw new Error('Could not find the EXPIRY DATE / QTY columns in the stock sheet.')
  const L = blocks[blocks.length - 1]

  const products: StockProduct[] = []
  let cur: StockProduct | null = null
  let lastRow = 2
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    const no = (row[0] ?? '').trim(), name = (row[1] ?? '').trim()
    if (name) {
      cur = { no, name, total: 0, batches: [] }
      products.push(cur)
    } else if (no || !cur) continue
    const anyCell = blocks.some(b => (row[b.exp] ?? '').trim() || (row[b.qty] ?? '').trim())
    if (!anyCell) { if (!name) cur = null; continue }
    const rawExpiry = (row[L.exp] ?? '').trim(), rawQty = (row[L.qty] ?? '').trim()
    const qty = num(rawQty)
    cur!.batches.push({ row: r, expiry: rawExpiry, qty, rawExpiry, rawQty })
    cur!.total += qty ?? 0
    lastRow = r
  }
  return {
    asOf: L.asOf,
    products: products.filter(p => p.batches.length),
    lastRow,
    cols: { exp: L.exp, qty: L.qty, total: L.qty + 1 },
  }
}

export async function readStock(): Promise<StockCount> {
  const g = await proxy('GET', `${base()}/values/${encodeURIComponent(`'${ABANG.stockSheet.tab}'!A1:AZ300`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
  const grid = ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? '')))
  return parseStockGrid(grid)
}

// "2028-04" (from a month picker) or "Apr-2028" → "Apr-2028".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function toExpiry(v: string): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const iso = /^(\d{4})-(\d{2})$/.exec(s)
  if (iso && +iso[2] >= 1 && +iso[2] <= 12) return `${MON[+iso[2] - 1]}-${iso[1]}`
  const m = /^([A-Za-z]{3})[-\s/]?(\d{4})$/.exec(s)
  const i = m ? MON.findIndex(x => x.toLowerCase() === m[1].toLowerCase()) : -1
  if (m && i >= 0) return `${MON[i]}-${m[2]}`
  throw new Error('Expiry must be a month, e.g. Apr-2028.')
}

// Edit one stock line: its expiry and/or quantity in the latest count.
// `expected` is what the person saw; if the sheet changed since, refuse.
export async function updateStockLine(
  row: number,
  change: { expiry?: string; qty?: number | null },
  expected: { expiry: string; qty: string },
): Promise<string> {
  const now = await readStock()
  const hit = now.products.flatMap(p => p.batches.map(b => ({ b, name: p.name }))).find(x => x.b.row === row)
  if (!hit) throw new Error('That line is no longer in the sheet — reload the page.')
  if (hit.b.rawExpiry !== String(expected.expiry ?? '').trim() || hit.b.rawQty !== String(expected.qty ?? '').trim()) {
    throw new Error('Someone changed this line in the sheet just now. Reload the page and try again.')
  }
  const data: { range: string; values: (string | number)[][] }[] = []
  if (change.expiry !== undefined) data.push({ range: cellA1(now.cols.exp, row), values: [[toExpiry(change.expiry)]] })
  if (change.qty !== undefined) data.push({ range: cellA1(now.cols.qty, row), values: [[change.qty === null ? '' : change.qty]] })
  if (!data.length) return 'Nothing to change.'
  await proxy('POST', `${base()}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data })
  return hit.name
}

// A new product: one new row straight after the last stock line, with NO.,
// name, and the latest count's expiry / qty / total. Nothing else moves.
export async function addStockProduct(name: string, expiry: string, qty: number): Promise<string> {
  const now = await readStock()
  const clean = name.trim()
  if (now.products.some(p => p.name.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" is already in the sheet.`)
  const exp = toExpiry(expiry)
  const nextNo = Math.max(0, ...now.products.map(p => Number(p.no) || 0)) + 1
  const at = now.lastRow + 1 // 0-based index of the new row
  const sheetId = await tabId()
  await proxy('POST', `${base()}:batchUpdate`, {
    requests: [{ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: at, endIndex: at + 1 }, inheritFromBefore: true } }],
  })
  await proxy('POST', `${base()}/values:batchUpdate`, {
    valueInputOption: 'USER_ENTERED',
    data: [
      { range: `'${ABANG.stockSheet.tab}'!A${at + 1}:B${at + 1}`, values: [[nextNo, clean]] },
      { range: `${cellA1(now.cols.exp, at)}:${colL(now.cols.total)}${at + 1}`, values: [[exp, qty, qty]] },
    ],
  })
  return `${nextNo}. ${clean}`
}

async function tabId(): Promise<number> {
  const g = await proxy('GET', base(), undefined, { fields: 'sheets.properties(sheetId,title)' })
  const t = (g?.sheets ?? []).find((s: any) => s?.properties?.title === ABANG.stockSheet.tab)
  if (!t) throw new Error(`Tab "${ABANG.stockSheet.tab}" not found in the stock sheet.`)
  return t.properties.sheetId
}
