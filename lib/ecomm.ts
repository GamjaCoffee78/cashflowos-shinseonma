// Who belongs on the Ecomm Sales tab and who belongs on Sellers.
//
// Both tabs read the SAME `records` rows the money tabs read — they mirror,
// they never move or copy anything. The split lives here, in ONE place, so the
// two tabs can't drift apart and start double-counting the same row.
import type { Rec } from './records'

// The marketplaces Ecomm Sales covers, matched case-insensitively against the
// START of meta.group. 'TikTok' catches "TikTok Shop" and its settlement rows.
// Written in display case because these names are also section headings.
export const ECOMM_CHANNELS = ['Shopee', 'TikTok']

// These tabs report MONEY. Anything else is somebody else's category — notably
// the tiktok_ads sync, whose ad spend has its own tab.
export const MONEY = new Set(['cash_in', 'cash_out'])

// "Not in the bank yet", matching Cash In so the tabs agree.
export const WAITING = ['waiting', 'unpaid', 'overdue', 'pending']

export const groupOf = (r: Rec) => String(r.meta?.group ?? '').trim()

// Underscores and hyphens are word characters, so 'tiktok_shop' would not match
// a plain word test — flatten them before comparing.
export const norm = (s: string) => s.toLowerCase().replace(/[_\-/|]+/g, ' ').trim()

// A seller row. The word lives in the row's TITLE ("MY Sellers", "SG Sellers
// (MYR)") while meta.group stays the marketplace ("Shopee MY"), so the title is
// what decides — the group is checked too in case the importer ever moves it.
//
// A plain substring test, NOT a word-boundary one: "SG Sellers (MYR)" and a
// run-together "MYSellers" must both match.
export const isSeller = (r: Rec) =>
  norm(String(r.title ?? '')).includes('seller') || norm(groupOf(r)).includes('seller')

// A marketplace row: a named channel, and NOT a seller.
export const isEcomm = (r: Rec) => {
  if (isSeller(r)) return false
  const g = norm(groupOf(r))
  return ECOMM_CHANNELS.some(c => g.startsWith(norm(c)))
}

export const isMoney = (r: Rec) => MONEY.has(r.category ?? '')
export const isWaiting = (r: Rec) => WAITING.includes((r.status || '').toLowerCase())
