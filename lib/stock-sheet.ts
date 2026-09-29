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
// WRITES: only a QTY cell of the LATEST block, one cell per request, and only if
// the cell still holds the value the person saw (so two people can't silently
// overwrite each other). TOTAL columns and older counts are never touched.

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

export const stockSheetConfigured = () =>
  !!process.env.COMPOSIO_API_KEY?.trim() && !!ABANG.stockSheet.composioAccount && !!ABANG.stockSheet.spreadsheetId

async function proxy(method: 'GET' | 'PUT', endpoint: string, body?: unknown, query: Record<string, string> = {}) {
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
  expiry: string       // "Apr-2028" or ''
  qty: number | null   // latest count
  cell: string         // A1 of the latest QTY cell
  raw: string          // the cell exactly as read (for the overwrite check)
  history: { asOf: string; qty: number | null }[]
}
export type StockProduct = { no: string; name: string; total: number; batches: StockBatch[] }
export type StockCount = { asOf: string[]; latest: string; products: StockProduct[] }

const num = (s: string) => {
  const t = String(s ?? '').replace(/[^\d.\-]/g, '')
  if (!t || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function parseStockGrid(grid: string[][]): StockCount {
  const h = grid[0] ?? [], d = grid[1] ?? []
  // One block per QTY header that sits right after an EXPIRY DATE header.
  const blocks: { exp: number; qty: number; asOf: string }[] = []
  for (let c = 1; c < h.length; c++) {
    if (/^qty$/i.test((h[c] ?? '').trim()) && /expiry/i.test(h[c - 1] ?? '')) {
      const asOf = (d[c - 1] || d[c] || '').replace(/^\s*as\s+of\s*/i, '').trim()
      blocks.push({ exp: c - 1, qty: c, asOf })
    }
  }
  if (!blocks.length) throw new Error('Could not find the EXPIRY DATE / QTY columns in the stock sheet.')
  const last = blocks[blocks.length - 1]

  const products: StockProduct[] = []
  let cur: StockProduct | null = null
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    const no = (row[0] ?? '').trim(), name = (row[1] ?? '').trim()
    if (name) {
      cur = { no, name, total: 0, batches: [] }
      products.push(cur)
    } else if (no || !cur) {
      if (!row.slice(2).some(v => (v ?? '').trim())) cur = null
      continue
    }
    const anyCell = blocks.some(b => (row[b.exp] ?? '').trim() || (row[b.qty] ?? '').trim())
    if (!anyCell) { if (!name) cur = null; continue }
    const expiry = [...blocks].reverse().map(b => (row[b.exp] ?? '').trim()).find(Boolean) ?? ''
    const raw = (row[last.qty] ?? '').trim()
    const qty = num(raw)
    cur!.batches.push({
      row: r, expiry, qty, raw, cell: cellA1(last.qty, r),
      history: blocks.map(b => ({ asOf: b.asOf, qty: num(row[b.qty] ?? '') })),
    })
    cur!.total += qty ?? 0
  }
  return { asOf: blocks.map(b => b.asOf), latest: last.asOf, products: products.filter(p => p.batches.length) }
}

export async function readStock(): Promise<StockCount> {
  const g = await proxy('GET', `${base()}/values/${encodeURIComponent(`'${ABANG.stockSheet.tab}'!A1:AZ200`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
  const grid = ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? '')))
  return parseStockGrid(grid)
}

// Write one latest-block QTY cell. `expected` is the value the person saw.
export async function writeStockQty(row: number, qty: number | null, expected: string): Promise<string> {
  const now = await readStock()
  const batch = now.products.flatMap(p => p.batches.map(b => ({ ...b, name: p.name }))).find(b => b.row === row)
  if (!batch) throw new Error('That row is no longer a stock line in the sheet — reload the page.')
  if (batch.raw !== String(expected ?? '').trim()) {
    throw new Error(`Someone changed this in the sheet (now ${batch.raw || 'blank'}). Reload the page and try again.`)
  }
  await proxy('PUT', `${base()}/values/${encodeURIComponent(batch.cell)}`, { values: [[qty === null ? '' : qty]] }, { valueInputOption: 'USER_ENTERED' })
  return `${batch.name}${batch.expiry ? ` (${batch.expiry})` : ''} → ${qty ?? 'blank'}`
}
