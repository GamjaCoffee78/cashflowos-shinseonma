import { supabase, supabaseConfigured } from './supabase'
import { ABANG } from '@/abang/config'
import { fetchSheetValues, parseAmount, monthHeaderToDate, monthOf, sheetsConfigured } from './google-sheets'

// The owner sheet (okmaya_owner_v5_fix, "Monthly Tracker") → the ONE `records`
// table. This is where the Dashboard's Cash In / Cash Out figures come from.
//
// The sheet is a MATRIX: line items down the side, months across the top. One
// cell with a figure in it = one record: title = the line item, due_date = the
// 1st of that month, amount = the cell, category = cash_in above the
// EXPENDITURE banner and cash_out below it, meta.group = the ▌ section it sits
// under (that is what the Ecomm / Sellers / Kitchen / Offline tabs read).
//
// RECONCILE, NEVER APPEND. The rows this sheet produced are already in the
// database from the first CSV import. So every sync matches what it just read
// against the rows tagged meta.source='okmaya_owner_v5_fix':
//   • same cell, same figure   → left alone
//   • same cell, new figure    → the row is UPDATED in place
//   • a cell with no row yet   → one row INSERTED
//   • a row the sheet no longer mentions → REPORTED, never deleted (CLAUDE.md)
// Re-importing this sheet blind would double every number on the Dashboard;
// matching first is what makes the button safe to press as often as you like.
export const ownerSheetConfigured = sheetsConfigured

export type SheetCell = {
  key: string          // kind|group|title|YYYY-MM — stable, and unique per cell
  kind: 'money' | 'units'
  title: string
  group: string        // the ▌ section for money · the marketplace for units
  month: string        // YYYY-MM
  date: string         // YYYY-MM-01
  amount: number       // ringgit for money · a count of items for units
  category: 'cash_in' | 'cash_out' | 'units'
}

export type OwnerSyncResult = {
  skipped?: string
  from?: string
  to?: string
  cells: number
  unchanged: number
  inserted: number
  updated: number
  missing: number      // rows in the database this sheet no longer mentions
  units?: { cells: number; inserted: number; updated: number }
  blocked?: string     // set when the guard refused to write
  dryRun?: boolean
}

// ---- 1) Read the matrix and turn it into one entry per figure. ----
export function parseMonthlyTracker(grid: string[][]): SheetCell[] {
  // The header row is the one carrying "Line Item"; the month columns are the
  // cells on it that read like "Sep-24". TOTAL / FY2025 columns don't parse as
  // a month, which is exactly how they get left out — they are sums of the
  // month columns, and importing them too would double-count.
  let labelCol = -1
  let headerRow = -1
  for (let r = 0; r < grid.length && headerRow < 0; r++) {
    const c = grid[r].findIndex(v => v.trim().toLowerCase() === 'line item')
    if (c >= 0) { labelCol = c; headerRow = r }
  }
  if (headerRow < 0) throw new Error('No "Line Item" header found — is this the Monthly Tracker tab?')

  const months: { col: number; date: string }[] = []
  grid[headerRow].forEach((v, col) => {
    const date = monthHeaderToDate(v)
    if (date) months.push({ col, date })
  })
  if (!months.length) throw new Error('No month columns (Sep-24 …) found on the header row.')

  const clean = (s: string) =>
    s.replace(/[▌▶※]/g, '')
      .replace(/\((?:auto[^)]*|owner only[^)]*)\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

  const out: SheetCell[] = []
  let category: 'cash_in' | 'cash_out' | 'units' | '' = ''
  let group = ''

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r]
    const raw = String(row[labelCol] ?? '').trim()
    if (!raw) continue
    const figures = months.map(m => String(row[m.col] ?? '').trim())
    const text = clean(raw)

    // A row with a label but no figures across the months is a heading. (A
    // merged banner arrives that way too: Google returns merged text in the
    // first cell only, so "is it repeated?" is not a test that survives.)
    if (!figures.some(Boolean)) {
      if (/^※/.test(raw) || /settlement =/i.test(text)) continue          // a note to the reader
      if (/expenditure/i.test(text)) { category = 'cash_out'; group = ''; continue }
      if (/revenue/i.test(text) && !/total|mix/i.test(text)) { category = 'cash_in'; group = ''; continue }
      if (raw.includes('▌')) {
        // A ▌ bar names the section. ONLINE CHANNELS is only an umbrella — the
        // real group follows on the next bar (▌ Shopee MY), so it sets nothing.
        if (/online channels/i.test(text)) group = ''
        else if (/offline channels/i.test(text)) group = 'Offline'
        else if (/kitchen service/i.test(text)) group = 'Kitchen Service'
        else if (/roas/i.test(text)) { category = ''; group = '' }
        else group = text
        continue
      }
      // UNITS SOLD — Shopee MY / Shopee SG / TikTok Shop. Not money: a count of
      // jars and packets, per product, per month. Kept in its own category so
      // it can never reach Cash In / Cash Out, and read by the Dashboard for
      // "units sold" and "best seller".
      const units = /units sold\s*[—–-]\s*(.+)$/i.exec(text)
      if (units) { category = 'units'; group = units[1].replace(/\(.*$/, '').trim(); continue }

      // Any other heading (PROFIT & LOSS, PROFIT DISTRIBUTION, CHANNEL REVENUE
      // MIX …) ENDS the figures. What follows it is derived from the numbers
      // above — ratios, percentages, partner payouts the sheet itself marks
      // "does not affect P&L". Importing any of it would put things that are
      // not money into Cash In / Cash Out.
      category = ''
      group = ''
      continue
    }

    // ▶ marks a subtotal, ▶▶ a grand total. Skip both, and treat them as the
    // end of their section so the next plain line can't inherit a stale group —
    // or, for ▶▶, a stale category.
    if (raw.includes('▶')) {
      group = ''
      if (raw.includes('▶▶')) category = ''
      continue
    }
    if (!category || !text) continue

    for (let i = 0; i < months.length; i++) {
      const amount = parseAmount(figures[i])
      if (amount === null || amount === 0) continue     // blank and 0.00 are not records
      const kind = category === 'units' ? 'units' : 'money'
      out.push({
        key: `${kind === 'units' ? 'units|' : ''}${group}|${text}|${monthOf(months[i].date)}`,
        kind,
        title: text,
        group,
        month: monthOf(months[i].date),
        date: months[i].date,
        amount,
        category,
      })
    }
  }
  return out
}

// ---- 2) Reconcile against the rows this sheet already owns. ----
type DbRow = { id: number; title: string; amount: number; due_date: string; category: string; meta: any }

const keyOf = (r: DbRow) =>
  String(r.meta?.cell || `${String(r.meta?.group ?? '')}|${String(r.title ?? '').trim()}|${monthOf(r.due_date)}`)

// Money and units are reconciled SEPARATELY. They live in the same sheet and
// carry the same meta.source, but a units row is not a money row: mixing them
// would make the money guard below see hundreds of "unmatched" item counts and
// refuse to write, every single time.
const kindOf = (r: DbRow) => (r.category === 'units' ? 'units' : 'money')

export async function syncOwnerSheet(opts: { dryRun?: boolean } = {}): Promise<OwnerSyncResult> {
  const { spreadsheetId, tab, source } = ABANG.ownerSheet
  if (!sheetsConfigured) return { skipped: 'COMPOSIO_API_KEY not set', cells: 0, unchanged: 0, inserted: 0, updated: 0, missing: 0 }
  if (!spreadsheetId) return { skipped: 'No owner sheet id in abang/config.ts', cells: 0, unchanged: 0, inserted: 0, updated: 0, missing: 0 }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured', cells: 0, unchanged: 0, inserted: 0, updated: 0, missing: 0 }

  const all = parseMonthlyTracker(await fetchSheetValues(spreadsheetId, tab))
  const cells = all.filter(c => c.kind === 'money')
  const unitCells = all.filter(c => c.kind === 'units')
  const span = cells.map(c => c.month).sort()
  const base = { cells: cells.length, from: span[0], to: span[span.length - 1] }

  const { data, error } = await supabase
    .from('records')
    .select('id, title, amount, due_date, category, meta')
    .eq('meta->>source', source)
  if (error) throw new Error(`Could not read the rows this sheet owns: ${error.message}`)
  const stored = (data ?? []) as DbRow[]
  const existing = stored.filter(r => kindOf(r) === 'money')
  const storedUnits = stored.filter(r => kindOf(r) === 'units')
  const byKey = new Map(existing.map(r => [keyOf(r), r]))

  const toInsert = cells.filter(c => !byKey.has(c.key))
  const toUpdate = cells
    .map(c => ({ c, row: byKey.get(c.key) }))
    .filter(x => x.row && Math.abs(Number(x.row!.amount) - x.c.amount) > 0.005) as { c: SheetCell; row: DbRow }[]
  const seen = new Set(cells.map(c => c.key))
  const missing = existing.filter(r => !seen.has(keyOf(r))).length

  // ---- THE GUARD. -------------------------------------------------------
  // If this sheet's money rows are already in the database and yet most of
  // what we just read looks brand new, the two sides are being matched on
  // different keys — inserting would silently double the Dashboard. Stop and
  // say so instead. Nothing is written; the report is enough to fix the
  // mapping. (Units are counted, not summed into any total, so they are not
  // gated by this: a wrong key there costs a duplicate line, not a wrong
  // revenue figure.)
  if (existing.length > 20 && toInsert.length > cells.length * 0.2) {
    return {
      ...base,
      unchanged: 0,
      inserted: 0,
      updated: 0,
      missing,
      blocked:
        `${toInsert.length} of ${cells.length} sheet figures found no matching row, though ${existing.length} rows ` +
        `tagged "${source}" are already stored. Writing them would double your totals, so nothing was changed. ` +
        `Example unmatched: ${toInsert.slice(0, 2).map(c => c.key).join(' · ')} — stored example: ${existing.slice(0, 2).map(keyOf).join(' · ')}`,
    }
  }

  const unitsByKey = new Map(storedUnits.map(r => [keyOf(r), r]))
  const unitsToInsert = unitCells.filter(c => !unitsByKey.has(c.key))
  const unitsToUpdate = unitCells
    .map(c => ({ c, row: unitsByKey.get(c.key) }))
    .filter(x => x.row && Number(x.row!.amount) !== x.c.amount) as { c: SheetCell; row: DbRow }[]

  if (opts.dryRun) {
    return {
      ...base,
      unchanged: cells.length - toInsert.length - toUpdate.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
      missing,
      units: { cells: unitCells.length, inserted: unitsToInsert.length, updated: unitsToUpdate.length },
      dryRun: true,
    }
  }

  // Updates first: a figure that moved is the common case, and it is the one
  // that makes the Dashboard wrong until it lands.
  for (const { c, row } of [...toUpdate, ...unitsToUpdate]) {
    const { error: e } = await supabase
      .from('records')
      .update({ amount: c.amount, meta: { ...(row.meta ?? {}), source, kind: c.kind, group: c.group, cell: c.key, synced_at: new Date().toISOString() } })
      .eq('id', row.id)
    if (e) throw new Error(`Could not update "${c.title}" (${c.month}): ${e.message}`)
  }

  const rows = [...toInsert, ...unitsToInsert].map(c => ({
    title: c.title,
    category: c.category,
    amount: c.amount,
    due_date: c.date,
    // Money from this sheet is money already settled. A units row is a count,
    // not a claim on anybody, so it is simply 'counted'.
    status: c.kind === 'units' ? 'counted' : 'paid',
    meta: { source, kind: c.kind, group: c.group, cell: c.key, synced_at: new Date().toISOString() },
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await supabase.from('records').insert(rows.slice(i, i + 500))
    if (e) throw new Error(`Could not add ${rows.length} new figure(s): ${e.message}`)
  }

  return {
    ...base,
    unchanged: cells.length - toInsert.length - toUpdate.length,
    inserted: toInsert.length,
    updated: toUpdate.length,
    missing,
    units: { cells: unitCells.length, inserted: unitsToInsert.length, updated: unitsToUpdate.length },
  }
}
