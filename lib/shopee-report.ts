// 🎯 HEAD OF SALES — the Shopee month report.
//
// Answers one question: "what did Shopee sell in <month>?" — gross (what buyers
// paid), net (what actually reached you after Shopee's cut), and the fees in
// between. Read-only: it totals rows, it never writes, proposes or sends.
//
// Why this exists: Abang's get_cash_summary only knows week / 30 days / all-time
// and has no channel filter, so there was no way to ask for one marketplace in
// one calendar month. This fills that gap.

import type { Rec } from './records'
import { inMoneyWindow, rm } from './records'

// A Shopee order row, as scripts/import-shopee.mjs writes it: one cash_in per
// order, stamped meta.source='shopee'. Older rows predate that stamp and only
// carry the channel in meta.platform or the title ("Shopee MY — Settlement"),
// so all three are accepted — same fallback ladder lib/ecomm.ts uses.
export function isShopee(r: Rec): boolean {
  if (r.category !== 'cash_in') return false
  const src = String(r.meta?.source ?? '').toLowerCase()
  if (src === 'shopee') return true
  const platform = String(r.meta?.platform ?? '').toLowerCase()
  if (platform.startsWith('shopee')) return true
  const group = String(r.meta?.group ?? '').toLowerCase()
  if (group.startsWith('shopee')) return true
  return String(r.title ?? '').toLowerCase().startsWith('shopee')
}

// The order date. Shopee rows put it in due_date; fall back to created_at.
function monthOf(r: Rec): string {
  return (r.due_date || r.created_at || '').slice(0, 7) // "2026-08"
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// The last FULLY finished month — "2026-08" when today is 2026-09-20. The
// default, so a figure you report to someone else never moves under you.
export function lastCompleteMonth(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

// Parse what a human typed after the command: "sep", "september", "sep 2026",
// "2026-09", "august". Returns "YYYY-MM", or null when nothing was named.
// A bare month name means the most recent one that has already happened, so in
// Sep 2026 "aug" is 2026-08 and "dec" is 2025-12 — never a future month.
export function parseMonth(input: string, today: string): string | null {
  const text = (input || '').trim().toLowerCase()
  if (!text) return null

  const iso = text.match(/(\d{4})[-/](\d{1,2})/)
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`

  const named = MONTHS.findIndex((m) => text.startsWith(m) || text.slice(0, 3) === m)
  const idx = named >= 0 ? named : MONTHS.findIndex((m) => text.includes(m))
  if (idx < 0) return null

  const year = text.match(/(20\d{2})/)
  if (year) return `${year[1]}-${String(idx + 1).padStart(2, '0')}`

  // No year given — pick the most recent occurrence that isn't in the future.
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  const y = idx + 1 <= tm ? ty : ty - 1
  return `${y}-${String(idx + 1).padStart(2, '0')}`
}

export type ShopeeReport = {
  month: string        // "2026-08"
  label: string        // "August 2026"
  orders: number
  gross: number        // what buyers paid
  net: number          // what reached you after Shopee's cut
  fees: number         // the difference
  partial: boolean     // true when the month hasn't finished yet
}

export function shopeeReport(rows: Rec[], month: string, today: string): ShopeeReport {
  const mine = rows.filter((r) => isShopee(r) && inMoneyWindow(r) && monthOf(r) === month)

  let gross = 0
  let net = 0
  for (const r of mine) {
    gross += Number(r.amount) || 0
    // meta.net is the seller's payout. When an older row doesn't carry one,
    // fall back to gross so net is never understated by a missing field.
    const n = Number(r.meta?.net)
    net += Number.isFinite(n) && n > 0 ? n : Number(r.amount) || 0
  }

  const d = new Date(`${month}-01T00:00:00Z`)
  return {
    month,
    label: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(d),
    orders: mine.length,
    gross,
    net,
    fees: gross - net,
    partial: month === today.slice(0, 7),
  }
}

// The message the owner reads — Telegram HTML, also fine as plain text.
export function formatShopeeReport(r: ShopeeReport): string {
  if (r.orders === 0) {
    return (
      `🛍️ <b>Shopee — ${r.label}</b>\n\n` +
      `No Shopee orders found for that month.\n\n` +
      `If you expected some, the export for ${r.label} may not be imported yet ` +
      `(<code>npm run import:shopee</code>).`
    )
  }
  const pct = r.gross > 0 ? ((r.fees / r.gross) * 100).toFixed(1) : '0.0'
  return (
    `🛍️ <b>Shopee — ${r.label}</b>${r.partial ? ' (month still running)' : ''}\n\n` +
    `Orders: <b>${r.orders}</b>\n` +
    `Buyers paid: <b>${rm(r.gross)}</b>\n` +
    `You received: <b>${rm(r.net)}</b>\n` +
    `Shopee fees: ${rm(r.fees)} (${pct}%)`
  )
}
