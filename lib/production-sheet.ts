import { ABANG } from '@/abang/config'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// Production Timeline ⇄ the team's Google Sheet ("[NEW] Okmaya Project WIP").
//
// ① READ (syncProductionFromSheet): every "Brand Timeline Mmm YY" tab holds a
//    month calendar; inside its PRODUCTION TIMELINE block, columns D–J are
//    Mon–Sun, orange rows carry the day numbers, and the rows under them hold
//    that day's tasks. New tasks become production rows. It never overwrites or
//    deletes: an item the app already has (same task + the date it was ORIGINALLY
//    on, so a task moved in the app isn't re-added at its old date) is skipped.
//
// ② WRITE (writeProductionSheet), below:
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

// ---- ① Sheet → app ----------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const TAB = /^\s*brand\s+timeline\s+([a-z]{3,4})\s+(\d{2}|\d{4})\s*$/i
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const COL0 = 3 // column D

// "Brand Timeline Oct 26" → "2026-10"
export function tabMonth(title: string): string | null {
  const m = TAB.exec(title)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase()]
  if (!mo) return null
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return `${y}-${String(mo).padStart(2, '0')}`
}

// One month tab's grid → [{ date, title }]. Pure, so it can be tested alone.
export function parseProductionGrid(grid: string[][], month: string): { date: string; title: string }[] {
  const cell = (r: number, c: number) => String(grid[r]?.[c] ?? '').trim()
  const isHeader = (r: number) => DOW.every((d, i) => cell(r, COL0 + i).toUpperCase() === d)
  const label = grid.findIndex(row => row.slice(0, COL0).some(v => /production\s+timeline/i.test(String(v ?? ''))))
  if (label < 0) return []
  // The block starts at the Mon–Sun header at or above the label (the label is a
  // merged cell, so its text sits in the block's first row or its middle).
  let start = -1
  for (let r = label; r >= 0; r--) if (isHeader(r)) { start = r; break }
  if (start < 0) return []
  let end = grid.length
  for (let r = start + 1; r < grid.length; r++) {
    const side = grid[r].slice(0, COL0).map(v => String(v ?? '').trim()).filter(Boolean)
    if (isHeader(r) || (r > label && side.length && !side.some(v => /production\s+timeline/i.test(v)))) { end = r; break }
  }
  const out: { date: string; title: string }[] = []
  let days: (number | null)[] = Array(7).fill(null)
  for (let r = start + 1; r < end; r++) {
    const vals = DOW.map((_, i) => cell(r, COL0 + i))
    const isDateRow = vals.some(v => /^\d{1,2}$/.test(v)) && vals.every(v => v === '' || /^\d{1,2}$/.test(v))
    if (isDateRow) {
      days = vals.map(v => (/^\d{1,2}$/.test(v) ? Number(v) : null))
      continue
    }
    vals.forEach((v, i) => {
      const d = days[i]
      if (!v || !d || d > 31) return
      out.push({ date: `${month}-${String(d).padStart(2, '0')}`, title: v.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim() })
    })
  }
  return out
}

// Same task, whatever the spacing, punctuation or case.
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')

export async function syncProductionFromSheet(opts: { monthsBack?: number } = {}) {
  if (!productionSheetConfigured()) return { skipped: 'the production sheet isn\u2019t connected (abang/config.ts → productionSheet)' as const }
  if (!supabaseConfigured) return { skipped: 'Supabase not configured' as const }
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`

  // Which month tabs exist — only recent and future ones are read.
  const info = await proxy('GET', base, undefined, { fields: 'sheets.properties.title' })
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (opts.monthsBack ?? 2), 1)).toISOString().slice(0, 7)
  const tabs = ((info?.sheets ?? []) as any[])
    .map(s => String(s?.properties?.title ?? ''))
    .map(title => ({ title, month: tabMonth(title) }))
    .filter((t): t is { title: string; month: string } => !!t.month && t.month >= from)

  const items: { date: string; title: string; tab: string }[] = []
  for (let i = 0; i < tabs.length; i += 4) {
    const got = await Promise.all(tabs.slice(i, i + 4).map(async t => {
      const g = await proxy('GET', `${base}/values/${encodeURIComponent(`'${t.title}'!A1:J400`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
      const grid = ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? '')))
      return parseProductionGrid(grid, t.month).map(x => ({ ...x, tab: t.title }))
    }))
    items.push(...got.flat())
  }

  // What the app already has, keyed by task + ORIGINAL date.
  const { data, error } = await supabase.from('records').select('title, due_date, meta').eq('category', 'production').limit(10000)
  if (error) throw new Error(error.message)
  const have = new Set<string>()
  for (const r of (data ?? []) as any[]) {
    const orig = r.meta?.moved_from?.[0]?.date ?? r.due_date
    have.add(`${orig}|${norm(r.title || '')}`)
    if (r.meta?.sheet_key) have.add(r.meta.sheet_key)
  }

  const seen = new Set<string>()
  const toInsert = []
  for (const it of items) {
    const key = `${it.date}|${norm(it.title)}`
    if (!norm(it.title) || have.has(key) || seen.has(key)) continue
    seen.add(key)
    toInsert.push({
      title: it.title.slice(0, 300),
      status: 'planned',
      amount: 0,
      category: 'production',
      due_date: it.date,
      notes: `[NEW] Okmaya Project WIP — ${it.tab}`,
      meta: { source: 'sheet_production', month: it.date.slice(0, 7), sheet_key: key, tab: it.tab },
    })
  }
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('records').insert(toInsert.slice(i, i + 500))
    if (error) throw new Error(`insert failed: ${error.message}`)
  }
  return { from: `${from}-01`, to: tabs.map(t => t.month).sort().pop() ?? from, tabs: tabs.length, fetched: items.length, inserted: toInsert.length, updated: 0 }
}
