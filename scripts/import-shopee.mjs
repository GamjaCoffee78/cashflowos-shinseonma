// scripts/import-shopee.mjs — feed your Shopee orders into your Money Robot.
//
// Reads the "Order.all.<from>_<to>.xlsx" export that Shopee Seller Centre gives
// you (My Orders → Export) and turns every order into ONE cash_in record.
//
//   npm run import:shopee -- ~/Downloads/Order.all.20260301_20260331.xlsx
//   npm run import:shopee -- jan.xlsx feb.xlsx mar.xlsx        (several at once)
//   npm run import:shopee -- --dry-run jan.xlsx                 (show, don't write)
//
// WHAT IT DOES
//   1. Reads the `orders` sheet of each file (the other sheets are Shopee's own
//      pivot tables — ignored).
//   2. Groups the product lines by Order ID, so a 3-item order = 1 record.
//   3. Skips Cancelled orders. Everything else counts as PAID — Shopee releases
//      the payout once the return window closes, and these exports are historic.
//   4. Skips any order that's already in your records table (keyed on the Shopee
//      Order ID in meta), so re-running the same file never double-counts.
//   5. Inserts in batches of 500 and prints a per-file summary.
//
// amount = "Total Amount" (what the buyer paid). The seller's net after Shopee's
// transaction / commission / service fees ("Grand Total") is kept in meta.net,
// and the fee breakdown in meta.fees, so the numbers can be reconciled later.
// Nothing is ever deleted.

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as XLSX from 'xlsx'

// ------------------------------------------------------------
// 0) Supabase connection — same forgiving rules as scripts/import.mjs.
// ------------------------------------------------------------
const url = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v\d+$/i, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter(a => !a.startsWith('--'))

if (!files.length) {
  console.error(
    '\n⚠️  Tell me which Shopee export to read, e.g.\n' +
    '   npm run import:shopee -- ~/Downloads/Order.all.20260301_20260331.xlsx\n'
  )
  process.exit(1)
}
if (!dryRun && (!url || !key || /YOUR-PROJECT|placeholder/i.test(url) || /placeholder/i.test(key))) {
  console.error(
    '\n⚠️  Your Supabase keys aren\'t set yet.\n' +
    '   Open your .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,\n' +
    '   then run this again. Nothing was imported. (Tip: add --dry-run to preview.)\n'
  )
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

// ------------------------------------------------------------
// 1) Read one export → { orders: Map<orderId, order>, skippedCancelled, lines }
// ------------------------------------------------------------
const num = v => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const day = v => {
  // "2026-01-01 00:03" → "2026-01-01". Shopee exports MYT, which is what we want.
  const m = String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}
// Shopee order IDs start with YYMMDD (e.g. 260214…), a handy fallback for the date.
const dayFromId = id => {
  const m = String(id).match(/^(\d{2})(\d{2})(\d{2})/)
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}

function readExport(path) {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames.includes('orders') ? 'orders' : wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: true })

  const orders = new Map()
  let cancelled = 0
  for (const r of rows) {
    const id = String(r['Order ID'] ?? '').trim()
    if (!id) continue
    const status = String(r['Order Status'] ?? '').trim()
    if (/^cancel/i.test(status)) { if (!orders.has('__c:' + id)) { orders.set('__c:' + id, null); cancelled++ } continue }

    let o = orders.get(id)
    if (!o) {
      o = {
        id,
        status,
        date: day(r['Order Paid Time']) || day(r['Order Creation Date']) || dayFromId(id),
        buyer: String(r['Username (Buyer)'] ?? '').trim(),
        total: num(r['Total Amount']),
        net: num(r['Grand Total']),
        fees: {
          transaction: num(r['Transaction Fee']),
          commission: num(r['Commission Fee']),
          service: num(r['Service Fee']),
        },
        seller_voucher: num(r['Seller Voucher'] ?? r['Discount Voucher Amount Sponsored by Seller']),
        shopee_voucher: num(r['Shopee Voucher']),
        shipping: String(r['Shipping Option'] ?? '').trim(),
        state: String(r['Province'] ?? '').trim(),
        remark: String(r['Remark from buyer'] ?? '').trim(),
        items: [],
        returned: 0,
      }
      orders.set(id, o)
    }
    o.items.push({
      name: String(r['Product Name'] ?? '').trim(),
      variation: String(r['Variation Name'] ?? '').trim(),
      qty: num(r['Quantity']),
      price: num(r['Deal Price']),
    })
    o.returned += num(r['Returned quantity'])
  }
  for (const k of [...orders.keys()]) if (k.startsWith('__c:')) orders.delete(k)
  return { orders, cancelled, lines: rows.length }
}

// A short, readable product summary for the title: "3× Soft Tofu Stew Paste 120g".
// Shopee product names carry marketing fluff (bold unicode, HALAL badges) — trim it.
function shortName(name) {
  return name
    .replace(/[\u{1D400}-\u{1D7FF}]+/gu, '') // bold/italic unicode letters
    .replace(/\bokmaya\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.{0,40})(\s.*)?$/s, '$1') // cut at a word boundary, ~40 chars
}
function itemsLabel(items) {
  const parts = items.map(i => `${i.qty}× ${shortName(i.name) || 'item'}${i.variation ? ` (${i.variation})` : ''}`)
  const label = parts.slice(0, 2).join(', ')
  return parts.length > 2 ? `${label} +${parts.length - 2} more` : label
}

function toRecord(o, shop) {
  const qty = o.items.reduce((s, i) => s + i.qty, 0)
  return {
    title: `Shopee #${o.id} — ${itemsLabel(o.items)}`,
    status: 'paid',
    amount: o.total,
    category: 'cash_in',
    due_date: o.date,
    notes: `${qty} item${qty === 1 ? '' : 's'} · buyer ${o.buyer || '—'} · Shopee: ${o.status}` +
      (o.returned ? ` · ${o.returned} returned` : '') +
      (o.remark ? ` · "${o.remark.slice(0, 80)}"` : ''),
    meta: {
      source: 'shopee',
      shop,
      platform: 'Shopee',
      customer: o.buyer || undefined,
      shopee_order_id: o.id,
      shopee_status: o.status,
      net: o.net,
      fees: o.fees,
      seller_voucher: o.seller_voucher,
      shopee_voucher: o.shopee_voucher,
      shipping: o.shipping || undefined,
      state: o.state || undefined,
      items: o.items.map(i => `${i.qty}× ${shortName(i.name)}${i.variation ? ` (${i.variation})` : ''} @ RM${i.price}`).join('; '),
    },
  }
}

// ------------------------------------------------------------
// 2) Which Shopee orders are already in the table? (so re-runs are safe)
// ------------------------------------------------------------
async function existingOrderIds() {
  const ids = new Set()
  if (dryRun && !url) return ids
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/records?select=meta->>shopee_order_id&meta->>source=eq.shopee&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` }, signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Supabase said no (HTTP ${res.status}) while checking existing orders: ${body.slice(0, 200)}`)
    }
    const page = await res.json()
    for (const r of page) if (r.shopee_order_id) ids.add(String(r.shopee_order_id))
    if (page.length < PAGE) break
  }
  return ids
}

// ------------------------------------------------------------
// 3) Read every file, dedupe across files AND against the table, then insert.
// ------------------------------------------------------------
const rm = n => 'RM' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

let existing = new Set()
try {
  existing = await existingOrderIds()
} catch (e) {
  console.error(`\n⚠️  ${e.message}\n   Nothing was imported.\n`)
  process.exit(1)
}

const seen = new Set()
const toInsert = []
console.log(`\n📥 Shopee import${dryRun ? ' (DRY RUN — nothing will be written)' : ''}`)
for (const path of files) {
  let parsed
  try {
    parsed = readExport(path)
  } catch (e) {
    console.error(`   ⚠️  Couldn't read "${path}": ${e.message} — skipped this file.`)
    continue
  }
  // "Order.all.20260101_20260131 (OMY MY).xlsx" → shop label "OMY MY" if present.
  const shop = (basename(path).match(/\(([^)]+)\)/) || [])[1] || 'Shopee'
  let dupFile = 0, dupTable = 0, added = 0, sum = 0, net = 0
  for (const o of parsed.orders.values()) {
    if (seen.has(o.id)) { dupFile++; continue }
    seen.add(o.id)
    if (existing.has(o.id)) { dupTable++; continue }
    toInsert.push(toRecord(o, shop))
    added++; sum += o.total; net += o.net
  }
  console.log(
    `\n   ${basename(path)}\n` +
    `     ${parsed.lines} product lines → ${parsed.orders.size + parsed.cancelled} orders\n` +
    `     ✅ ${added} to add · ${rm(sum)} buyer-paid · ${rm(net)} net after Shopee fees\n` +
    `     ⏭  ${parsed.cancelled} cancelled (skipped)` +
    (dupTable ? ` · ${dupTable} already in your table (skipped)` : '') +
    (dupFile ? ` · ${dupFile} repeated across files (skipped)` : ''),
  )
}

if (!toInsert.length) {
  console.log('\nNothing new to import.\n')
  process.exit(0)
}

console.log(`\n   First few of the ${toInsert.length} records:`)
for (const c of toInsert.slice(0, 5)) console.log(`     • ${c.due_date} · ${c.title} · ${rm(c.amount)}`)
if (dryRun) {
  console.log('\n   Dry run — remove --dry-run to write these to your records table.\n')
  process.exit(0)
}

const BATCH = 500
let written = 0
for (let i = 0; i < toInsert.length; i += BATCH) {
  const slice = toInsert.slice(i, i + BATCH)
  try {
    const res = await fetch(`${url}/rest/v1/records`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(slice),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `\n⚠️  Supabase said no (HTTP ${res.status}) on batch ${i / BATCH + 1}. ` +
        `${written} row(s) were written before this; re-running is safe (already-imported orders are skipped).\n` +
        `   ${body.slice(0, 300)}\n`,
      )
      process.exit(1)
    }
    written += slice.length
    process.stdout.write(`   … ${written}/${toInsert.length} written\r`)
  } catch (e) {
    console.error(`\n⚠️  Couldn't reach Supabase (${e.message}). ${written} row(s) written so far; re-run to continue.\n`)
    process.exit(1)
  }
}
console.log(`\n✅ Done — added ${written} Shopee orders to your records table. Open the Cash In tab to see them.\n`)
