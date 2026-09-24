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
//    Then it TIDIES: for every month whose tab was read, an item the sheet no
//    longer has (the old .xlsx import, or a task since reworded or removed) is
//    ARCHIVED — moved to category 'production_archived' by explicit id, never
//    deleted, so it can be put back. Items added in the app are never archived,
//    and a month whose tab parsed to nothing is left alone. An item deleted in
//    the app becomes '<category>_deleted' and is never re-added from the sheet.
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

const HEADER = ['Calendar', 'Date', 'Task', 'Status', 'Done on', 'Moved from', 'Added in app', 'Last change']
// The categories the app can edit, and what the App updates tab calls them.
export const EDITABLE: Record<string, string> = {
  production: 'Production',
  social_plan: 'Social',
  events_other: 'Events / Others',
  content_idea: 'Content idea',
}
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
      .select('title, status, due_date, category, meta')
      .in('category', Object.keys(EDITABLE))
      .order('due_date', { ascending: true })
      .limit(5000)
    if (error) throw new Error(error.message)
    const rows = (data ?? [])
      .filter((r: any) => r.meta?.source === 'app' || r.status === 'done' || (r.meta?.moved_from ?? []).length)
      .map((r: any) => {
        const moved = (r.meta?.moved_from ?? []) as { date: string; at: string }[]
        const last = [r.meta?.done_at, moved[moved.length - 1]?.at, r.meta?.created_at].filter(Boolean).sort().pop()
        return [
          EDITABLE[r.category] ?? r.category,
          day(r.due_date),
          r.title,
          r.status === 'done' ? 'Done' : r.status === 'dropped' ? 'Dropped' : r.category === 'content_idea' ? 'Idea' : 'Planned',
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
    const range = encodeURIComponent(`'${tab}'!A:H`)
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
// Any tab whose name ENDS in a month and year: "Brand Timeline Oct 26",
// "Production Oct 2026", "October 26"… (the team renames tabs; the month is what matters).
const TAB = /(?:^|[\s\-_])(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s\-_']*(\d{2}|\d{4})\s*$/i
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const COL0 = 3 // column D

// "Brand Timeline Oct 26" → "2026-10"
export function tabMonth(title: string): string | null {
  const m = TAB.exec(title)
  if (!m) return null
  const mo = MONTHS[m[1].toLowerCase().slice(0, 3)]
  if (!mo) return null
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return `${y}-${String(mo).padStart(2, '0')}`
}

// One block of one month tab → [{ date, title, channel? }]. Pure, so it can be
// tested alone. `label` finds the block's name in columns A–C ("PRODUCTION
// TIMELINE"); `cont` lets a block keep going under a second side label (the
// social block is "SOCIAL CONTENT CALENDAR" then "SOCIAL" down the side);
// `channel` reads column C (IGF / IGR / IGST / REELS) for each task row.
export function parseBlock(
  grid: string[][], month: string, label: RegExp, opts: { cont?: RegExp; channel?: boolean } = {},
): { date: string; title: string; channel?: string }[] {
  const cell = (r: number, c: number) => String(grid[r]?.[c] ?? '').trim()
  const isHeader = (r: number) => DOW.every((d, i) => cell(r, COL0 + i).toUpperCase() === d)
  const at = grid.findIndex(row => row.slice(0, COL0).some(v => label.test(String(v ?? ''))))
  if (at < 0) return []
  // The block starts at the Mon–Sun header at or above the label (the label is a
  // merged cell, so its text sits in the block's first row or its middle).
  let start = -1
  for (let r = at; r >= 0; r--) if (isHeader(r)) { start = r; break }
  if (start < 0) return []
  // …and ends at the next header, or where column A names a different block.
  let end = grid.length
  for (let r = start + 1; r < grid.length; r++) {
    const a = cell(r, 0)
    if (isHeader(r) || (r > at && a && !label.test(a) && !opts.cont?.test(a))) { end = r; break }
  }
  const out: { date: string; title: string; channel?: string }[] = []
  let days: (number | null)[] = Array(7).fill(null)
  for (let r = start + 1; r < end; r++) {
    const vals = DOW.map((_, i) => cell(r, COL0 + i))
    const isDateRow = vals.some(v => /^\d{1,2}$/.test(v)) && vals.every(v => v === '' || /^\d{1,2}$/.test(v))
    if (isDateRow) {
      days = vals.map(v => (/^\d{1,2}$/.test(v) ? Number(v) : null))
      continue
    }
    const channel = opts.channel ? cell(r, 2).toUpperCase() : undefined
    vals.forEach((v, i) => {
      const d = days[i]
      if (!v || !d || d > 31) return
      out.push({
        date: `${month}-${String(d).padStart(2, '0')}`,
        title: v.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim(),
        ...(channel ? { channel } : {}),
      })
    })
  }
  return out
}

export const parseProductionGrid = (grid: string[][], month: string) => parseBlock(grid, month, /production\s+timeline/i)

// The social block lists one post per channel row; fold the same post on the
// same day into ONE item, "[IGR/IGST/REELS] Sundubu boiling video".
export function parseSocialGrid(grid: string[][], month: string) {
  const byKey = new Map<string, { date: string; text: string; channels: string[] }>()
  for (const it of parseBlock(grid, month, /social\s+content\s+calendar/i, { cont: /^social\b/i, channel: true })) {
    const k = `${it.date}|${it.title}`
    const e = byKey.get(k) ?? { date: it.date, text: it.title, channels: [] }
    if (it.channel && !e.channels.includes(it.channel)) e.channels.push(it.channel)
    byKey.set(k, e)
  }
  return [...byKey.values()].map(e => ({ date: e.date, title: e.channels.length ? `[${e.channels.join('/')}] ${e.text}` : e.text }))
}

export const parseEventsGrid = (grid: string[][], month: string) => parseBlock(grid, month, /events\s*\/\s*others/i)

// The three calendars the app reads from each month tab, and where each lands.
const KINDS = [
  { category: 'production', source: 'sheet_production', parse: parseProductionGrid },
  { category: 'social_plan', source: 'sheet_social', parse: parseSocialGrid },
  { category: 'events_other', source: 'sheet_events', parse: parseEventsGrid },
] as const

// Same task, whatever the spacing, punctuation or case.
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')
// The key an item is matched on: its day + its text. For social posts the
// channel tag is left out, so "[IGR/REELS] x" and "[REELS/IGR] x" are one post.
const keyOf = (category: string, date: string, title: string) =>
  `${date}|${norm(category === 'social_plan' ? title.replace(/^\s*\[[^\]]*\]\s*/, '') : title)}`

export async function syncProductionFromSheet(opts: { monthsBack?: number } = {}) {
  // Default: every month tab, so the tidy-up covers the whole sheet.
  if (!productionSheetConfigured()) return { skipped: 'the production sheet isn\u2019t connected (abang/config.ts → productionSheet)' as const }
  if (!supabaseConfigured) return { skipped: 'Supabase not configured' as const }
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`

  // Which month tabs exist — only recent and future ones are read.
  const info = await proxy('GET', base, undefined, { fields: 'sheets.properties.title' })
  const now = new Date()
  const from = opts.monthsBack == null ? '0000-00' : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - opts.monthsBack, 1)).toISOString().slice(0, 7)
  const tabs = ((info?.sheets ?? []) as any[])
    .map(s => String(s?.properties?.title ?? ''))
    .map(title => ({ title, month: tabMonth(title) }))
    .filter((t): t is { title: string; month: string } => !!t.month && t.month >= from)

  const grids: { tab: string; month: string; grid: string[][] }[] = []
  for (let i = 0; i < tabs.length; i += 6) {
    const got = await Promise.all(tabs.slice(i, i + 6).map(async t => {
      const g = await proxy('GET', `${base}/values/${encodeURIComponent(`'${t.title}'!A1:J600`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
      return { tab: t.title, month: t.month, grid: ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? ''))) }
    }))
    grids.push(...got)
  }

  const totals = { fetched: 0, inserted: 0, archived: 0 }
  for (const kind of KINDS) {
    const items = grids.flatMap(g => kind.parse(g.grid, g.month).map(x => ({ ...x, tab: g.tab })))
    const r = await reconcile(kind.category, kind.source, items)
    totals.fetched += items.length
    totals.inserted += r.inserted
    totals.archived += r.archived
  }
  const months = tabs.map(t => t.month).sort()
  return { ...totals, updated: 0, tabs: tabs.length, from: (months[0] ?? '') + '-01', to: months[months.length - 1] ?? '' }
}

// Bring one category in line with the sheet: add what's new, archive what the
// sheet no longer has (months that parsed only; app-added items never).
async function reconcile(category: string, source: string, items: { date: string; title: string; tab: string }[]) {
  // What the app already has, keyed by task + ORIGINAL date.
  const { data: all, error } = await supabase.from('records').select('id, title, due_date, meta, category')
    .in('category', [category, `${category}_deleted`]).limit(10000)
  if (error) throw new Error(error.message)
  // Items deleted in the app still count as "have", so Sync never re-adds them.
  const data = ((all ?? []) as any[]).filter(r => r.category === category)
  const have = new Set<string>()
  for (const r of (all ?? []) as any[]) {
    const orig = r.meta?.moved_from?.[0]?.date ?? r.due_date
    have.add(keyOf(category, orig, r.title || ''))
    if (r.meta?.sheet_key) have.add(r.meta.sheet_key)
  }

  const seen = new Set<string>()
  const toInsert = []
  for (const it of items) {
    const key = keyOf(category, it.date, it.title)
    if (!norm(it.title) || have.has(key) || seen.has(key)) continue
    seen.add(key)
    toInsert.push({
      title: it.title.slice(0, 300),
      status: 'planned',
      amount: 0,
      category,
      due_date: it.date,
      notes: `[NEW] Okmaya Project WIP — ${it.tab}`,
      meta: { source, month: it.date.slice(0, 7), sheet_key: key, tab: it.tab },
    })
  }
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('records').insert(toInsert.slice(i, i + 500))
    if (error) throw new Error(`insert failed: ${error.message}`)
  }

  const sheetKeys = new Set(items.map(it => keyOf(category, it.date, it.title)))
  const readMonths = new Set(items.map(it => it.date.slice(0, 7)))
  const stale = ((data ?? []) as any[]).filter(r => {
    if (r.meta?.source === 'app') return false
    const orig: string = r.meta?.moved_from?.[0]?.date ?? r.due_date ?? ''
    if (!readMonths.has(orig.slice(0, 7))) return false
    return !sheetKeys.has(keyOf(category, orig, r.title || '')) && !(r.meta?.sheet_key && sheetKeys.has(r.meta.sheet_key))
  })
  // By explicit id, 100 at a time, never deleted: '<category>_archived'.
  const ids = stale.map(r => r.id as number)
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase
      .from('records')
      .update({ category: `${category}_archived` })
      .in('id', ids.slice(i, i + 100))
      .eq('category', category)
    if (error) throw new Error(`archive failed: ${error.message}`)
  }
  return { inserted: toInsert.length, archived: stale.length }
}

// ---- ③ Next month's tab ------------------------------------------------------
//
// From the 20th, if next month's "Brand Timeline Mmm YY" tab doesn't exist yet,
// copy the latest month tab (so it keeps the team's layout and colours), put
// the new month's day numbers into every Mon–Sun block and blank the task
// cells. Runs from the 08:15 cron; does nothing on the other days or when the
// tab is already there, so it is safe to run daily.
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Monday-first weeks of a month: [[null,null,null,1,2,3,4], …]
function weeksOf(month: string): (number | null)[][] {
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const out = []
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
  return out
}

const colL = (c: number) => String.fromCharCode(65 + c)

export async function ensureNextMonthTab(today: string, opts: { fromDay?: number } = {}) {
  if (!productionSheetConfigured()) return { skipped: 'production sheet not connected' }
  if (Number(today.slice(8, 10)) < (opts.fromDay ?? 20)) return { skipped: 'not yet — runs from the 20th' }
  const [y, m] = today.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`

  const info = await proxy('GET', base, undefined, { fields: 'sheets.properties(sheetId,title,index)' })
  const tabs = ((info?.sheets ?? []) as any[]).map(s => s.properties).map((p: any) => ({ id: p.sheetId, title: String(p.title), index: p.index, month: tabMonth(String(p.title)) }))
  const existing = tabs.find(t => t.month === next)
  if (existing) return { skipped: `${existing.title} already exists` }
  const src = tabs.filter(t => t.month && t.month < next).sort((a, b) => (a.month! < b.month! ? 1 : -1))[0]
  if (!src) return { skipped: 'no month tab to copy' }
  // Same naming as the tab it copies: "Brand Timeline Oct 26" → "… Nov 26".
  const prefix = src.title.replace(TAB, '').trim()
  const title = `${prefix ? prefix + ' ' : ''}${SHORT[Number(next.slice(5)) - 1]} ${next.slice(2, 4)}`

  const dup = await proxy('POST', `${base}:batchUpdate`, {
    requests: [{ duplicateSheet: { sourceSheetId: src.id, insertSheetIndex: src.index + 1, newSheetName: title } }],
  })
  if (!dup) throw new Error('copy failed')

  const g = await proxy('GET', `${base}/values/${encodeURIComponent(`'${title}'!A1:J400`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
  const grid = ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? '').trim()))
  const cell = (r: number, c: number) => grid[r]?.[c] ?? ''
  const isHeader = (r: number) => DOW.every((d, i) => cell(r, COL0 + i).toUpperCase() === d)
  const isDateRow = (r: number) => {
    const v = DOW.map((_, i) => cell(r, COL0 + i))
    return v.some(x => /^\d{1,2}$/.test(x)) && v.every(x => x === '' || /^\d{1,2}$/.test(x))
  }

  // Every block: from a Mon–Sun header to the next one. The first block may sit
  // above the first header (its date rows start the tab), so start at row 0.
  const heads = grid.map((_, r) => r).filter(isHeader)
  const bounds = [0, ...heads, grid.length]
  const weeks = weeksOf(next)
  const data: { range: string; values: string[][] }[] = []
  let short = 0
  for (let b = 0; b < bounds.length - 1; b++) {
    const dateRows = [] as number[]
    for (let r = bounds[b]; r < bounds[b + 1]; r++) if (isDateRow(r)) dateRows.push(r)
    if (!dateRows.length) continue
    if (dateRows.length < weeks.length) short = Math.max(short, weeks.length - dateRows.length)
    for (let r = dateRows[0]; r < bounds[b + 1]; r++) {
      if (isHeader(r)) continue
      const k = dateRows.indexOf(r)
      const row = k >= 0
        ? (weeks[k] ?? Array(7).fill(null)).map(d => (d ? String(d) : ''))
        : Array(7).fill('')
      data.push({ range: `'${title}'!${colL(COL0)}${r + 1}:${colL(COL0 + 6)}${r + 1}`, values: [row] })
    }
  }
  if (data.length) await proxy('POST', `${base}/values:batchUpdate`, { valueInputOption: 'RAW', data })
  return {
    created: title,
    copiedFrom: src.title,
    ...(short ? { warning: `${title} needs ${short} more week row(s) than ${src.title} has — add them by hand` } : {}),
  }
}

// ---- ④ App → the month calendars themselves ----------------------------------
//
// So the sheet and the app say the same thing, every change made in the app is
// also made in the right month tab's calendar block:
//   • add      → the task text goes into the first empty cell under its day
//                (social: into the rows of its channels, e.g. [IGR/REELS])
//   • move     → the cell at the old day is emptied, the text goes under the new day
//   • done     → the cell gets a strikethrough; undo removes it
// Only the one cell is written. If the month tab or a free cell can't be found,
// nothing is written and the answer says so (the app keeps the change either way).
const BLOCKS: Record<string, { label: RegExp; cont?: RegExp; channel?: boolean }> = {
  production: { label: /production\s+timeline/i },
  social_plan: { label: /social\s+content\s+calendar/i, cont: /^social\b/i, channel: true },
  events_other: { label: /events\s*\/\s*others/i },
}

type Found = { tab: string; sheetId: number; grid: string[][]; start: number; end: number }

async function monthBlock(category: string, month: string): Promise<Found | string> {
  const spec = BLOCKS[category]
  if (!spec) return 'no calendar for this item'
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`
  const info = await proxy('GET', base, undefined, { fields: 'sheets.properties(sheetId,title)' })
  const tab = ((info?.sheets ?? []) as any[]).map(s => s.properties).find((p: any) => tabMonth(String(p.title)) === month)
  if (!tab) return `no month tab for ${month} in the sheet`
  const g = await proxy('GET', `${base}/values/${encodeURIComponent(`'${tab.title}'!A1:J600`)}`, undefined, { valueRenderOption: 'FORMATTED_VALUE' })
  const grid = ((g?.values ?? []) as any[][]).map(row => (row ?? []).map(c => String(c ?? '').trim()))
  const cell = (r: number, c: number) => grid[r]?.[c] ?? ''
  const isHeader = (r: number) => DOW.every((d, i) => cell(r, COL0 + i).toUpperCase() === d)
  const at = grid.findIndex(row => row.slice(0, COL0).some(v => spec.label.test(v)))
  if (at < 0) return `no ${category.replace('_', ' ')} block in ${tab.title}`
  let start = -1
  for (let r = at; r >= 0; r--) if (isHeader(r)) { start = r; break }
  if (start < 0) return `can't read the calendar in ${tab.title}`
  let end = grid.length
  for (let r = start + 1; r < grid.length; r++) {
    const a = cell(r, 0)
    if (isHeader(r) || (r > at && a && !spec.label.test(a) && !spec.cont?.test(a))) { end = r; break }
  }
  return { tab: String(tab.title), sheetId: Number(tab.sheetId), grid, start, end }
}

// The task rows under one day: [row numbers], plus the column for that day.
export function dayCells(f: Found, date: string, channels: string[] | null): { col: number; rows: number[] } | null {
  const day = Number(date.slice(8, 10))
  const cell = (r: number, c: number) => f.grid[r]?.[c] ?? ''
  const isDateRow = (r: number) => {
    const v = DOW.map((_, i) => cell(r, COL0 + i))
    return v.some(x => /^\d{1,2}$/.test(x)) && v.every(x => x === '' || /^\d{1,2}$/.test(x))
  }
  for (let r = f.start + 1; r < f.end; r++) {
    if (!isDateRow(r)) continue
    const i = DOW.findIndex((_, k) => cell(r, COL0 + k) === String(day))
    if (i < 0) continue
    const rows: number[] = []
    for (let q = r + 1; q < f.end && !isDateRow(q); q++) {
      if (channels && channels.length && !channels.includes(cell(q, 2).toUpperCase())) continue
      rows.push(q)
    }
    return { col: COL0 + i, rows }
  }
  return null
}

// "[IGR/REELS] Sundubu video" → { channels: ['IGR','REELS'], text: 'Sundubu video' }
function splitChannels(category: string, title: string): { channels: string[] | null; text: string } {
  if (category !== 'social_plan') return { channels: null, text: title }
  const m = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(title)
  if (!m) return { channels: ['IGR'], text: title }
  return { channels: m[1].split(/[\/,\s]+/).map(c => c.trim().toUpperCase()).filter(Boolean), text: m[2] }
}

async function writeCells(f: Found, cells: { row: number; col: number; value: string }[]) {
  if (!cells.length) return
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`
  await proxy('POST', `${base}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: cells.map(c => ({ range: `'${f.tab}'!${String.fromCharCode(65 + c.col)}${c.row + 1}`, values: [[c.value]] })),
  })
}

async function strike(f: Found, cells: { row: number; col: number }[], on: boolean) {
  if (!cells.length) return
  const base = `${SHEETS}/${encodeURIComponent(ABANG.productionSheet.spreadsheetId)}`
  await proxy('POST', `${base}:batchUpdate`, {
    requests: cells.map(c => ({
      repeatCell: {
        range: { sheetId: f.sheetId, startRowIndex: c.row, endRowIndex: c.row + 1, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
        cell: { userEnteredFormat: { textFormat: { strikethrough: on } } },
        fields: 'userEnteredFormat.textFormat.strikethrough',
      },
    })),
  })
}

// Where a task already sits under its day (matched the same way the sync matches).
export function findTask(f: Found, date: string, category: string, title: string) {
  const { channels, text } = splitChannels(category, title)
  const d = dayCells(f, date, channels)
  if (!d) return []
  return d.rows.filter(r => norm(f.grid[r]?.[d.col] ?? '').length && norm(f.grid[r][d.col]) === norm(text)).map(row => ({ row, col: d.col }))
}

async function place(category: string, date: string, title: string): Promise<string> {
  const f = await monthBlock(category, date.slice(0, 7))
  if (typeof f === 'string') return f
  const { channels, text } = splitChannels(category, title)
  if (findTask(f, date, category, title).length) return 'already in the sheet'
  const d = dayCells(f, date, channels)
  if (!d) return `no ${date} in ${f.tab}`
  // One cell per channel row for social; the first free cell otherwise.
  const free = d.rows.filter(r => !(f.grid[r]?.[d.col] ?? ''))
  const pick = channels ? free : free.slice(0, 1)
  if (!pick.length) return `no free cell under ${date} in ${f.tab} — add a row there`
  await writeCells(f, pick.map(row => ({ row, col: d.col, value: text })))
  return `written to ${f.tab}`
}

// The one entry point the API calls after it has saved the change in the app.
export async function applyToGrid(
  change: { action: 'add' | 'move' | 'done' | 'undo' | 'edit' | 'delete'; category: string; title: string; date: string; from?: string; oldTitle?: string },
): Promise<{ ok: boolean; message: string; sheetKey?: string }> {
  if (!productionSheetConfigured() || !BLOCKS[change.category]) return { ok: true, message: '' }
  try {
    const key = keyOf(change.category, change.date, change.title)
    if (change.action === 'add') {
      const m = await place(change.category, change.date, change.title)
      return { ok: !/^no /.test(m), message: m, sheetKey: key }
    }
    if (change.action === 'edit' && change.oldTitle) {
      // New wording: same cells when the channels didn't change, else clear
      // the old ones and place the post in its new channel rows.
      const f = await monthBlock(change.category, change.date.slice(0, 7))
      if (typeof f === 'string') return { ok: false, message: f }
      const cells = findTask(f, change.date, change.category, change.oldTitle)
      const was = splitChannels(change.category, change.oldTitle)
      const now = splitChannels(change.category, change.title)
      if (cells.length && (was.channels ?? []).join('/') === (now.channels ?? []).join('/')) {
        await writeCells(f, cells.map(c => ({ ...c, value: now.text })))
        return { ok: true, message: `updated in ${f.tab}`, sheetKey: key }
      }
      await writeCells(f, cells.map(c => ({ ...c, value: '' })))
      const m = await place(change.category, change.date, change.title)
      return { ok: !/^no /.test(m), message: m, sheetKey: key }
    }
    if (change.action === 'move' && change.from) {
      const old = await monthBlock(change.category, change.from.slice(0, 7))
      if (typeof old !== 'string') {
        const cells = findTask(old, change.from, change.category, change.title)
        await writeCells(old, cells.map(c => ({ ...c, value: '' })))
        await strike(old, cells, false)
      }
      const m = await place(change.category, change.date, change.title)
      return { ok: !/^no /.test(m), message: m, sheetKey: key }
    }
    const f = await monthBlock(change.category, change.date.slice(0, 7))
    if (typeof f === 'string') return { ok: false, message: f }
    const cells = findTask(f, change.date, change.category, change.title)
    if (!cells.length) return { ok: false, message: `couldn't find it under ${change.date} in ${f.tab}` }
    if (change.action === 'delete') {
      await writeCells(f, cells.map(c => ({ ...c, value: '' })))
      await strike(f, cells, false)
      return { ok: true, message: `removed from ${f.tab}` }
    }
    await strike(f, cells, change.action === 'done')
    return { ok: true, message: change.action === 'done' ? `crossed out in ${f.tab}` : `un-crossed in ${f.tab}` }
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    return { ok: false, message: /insufficient|scope|permission|forbidden|403/i.test(msg) ? 'Google refused — the sheet connection needs edit access' : msg.slice(0, 120) }
  }
}
