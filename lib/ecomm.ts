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

// Kitchen Service money — its own tab, so it is never also counted as an
// offline channel below. Matched on the START of meta.group ("Kitchen
// Service", "Kitchen Services", "Kitchen Service — Outlet 2").
//
// A row with NO group at all falls back to its title, and only when the title
// STARTS with "kitchen service" — narrow on purpose, so a one-off "Kitchen
// equipment" purchase never wanders onto the Kitchen tab.
export const isKitchen = (r: Rec) => {
  const g = groupOf(r)
  if (g) return norm(g).startsWith('kitchen')
  return norm(String(r.title ?? '')).startsWith('kitchen service')
}

// An OFFLINE channel: money that did not come through an online marketplace.
//
// Defined by exclusion on purpose. The sheet names offline channels many ways
// (walk-in, retail, event, bazaar, wholesale, dealer…) and a hard-coded list
// would silently drop the next one someone invents. So: a money row with a
// real meta.group that is not a marketplace, not a seller, and not Kitchen
// Service — each of which already has its own tab.
//
// A row with NO meta.group at all is NOT offline. Hand-entered rows and the
// receipts the bot files carry no group, and quietly counting them as offline
// sales would inflate this tab with money nobody assigned to a channel. The
// page reports how many it set aside, so they are never invisible.
export const isOffline = (r: Rec) => {
  if (!groupOf(r)) return false
  return !isEcomm(r) && !isSeller(r) && !isKitchen(r)
}

export const isMoney = (r: Rec) => MONEY.has(r.category ?? '')
export const isWaiting = (r: Rec) => WAITING.includes((r.status || '').toLowerCase())
