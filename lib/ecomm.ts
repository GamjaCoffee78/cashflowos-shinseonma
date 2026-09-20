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
//
// meta.group is the reliable field, but only later imports stamp it — earlier
// Shopee rows landed in `records` with no group at all and the channel only in
// the title ("Shopee MY — Settlement"). So a row with no group falls back to
// its title, and only when the title STARTS with a channel name: narrow on
// purpose, so "Refund to a Shopee buyer" never wanders onto this tab.
//
// This does not risk double-counting against Offline Channels: isOffline
// requires a meta.group, so these groupless rows were never offline either.
export const isEcomm = (r: Rec) => {
  if (isSeller(r)) return false
  const g = groupOf(r)
  const hay = norm(g || String(r.title ?? ''))
  return ECOMM_CHANNELS.some(c => hay.startsWith(norm(c)))
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

// An OFFLINE channel: REVENUE that did not come through an online marketplace.
//
// In the owner sheet (okmaya_owner_v5_fix) "OFFLINE CHANNELS (auto from Staff —
// based on invoice)" is a REVENUE section with three lines: TFP Retail
// (VG/BIG/BSC), Qra, and Others. There is no offline cost section — every
// expenditure line in that sheet (Product Orders, Packaging, Marketing, Fixed &
// Operating, Miscellaneous) belongs to the business as a whole, not to a
// channel.
//
// So this is cash_in ONLY. Without that guard the exclusion below would sweep
// every one of those expenditure groups in and report the whole company's
// costs as "offline costs".
//
// Defined by exclusion rather than a hard-coded list of the three names, so a
// fourth offline line added to the sheet appears here on its own instead of
// being silently dropped. The revenue sections are online / offline / kitchen,
// so cash_in that is not a marketplace, not a seller and not Kitchen Service is
// offline by definition.
//
// A row with NO meta.group at all is NOT offline. Hand-entered rows and the
// receipts the bot files carry no group, and quietly counting them as offline
// sales would inflate this tab. The page reports how many it set aside, so they
// are never invisible.
export const isOffline = (r: Rec) => {
  if (r.category !== 'cash_in') return false
  if (!groupOf(r)) return false
  return !isEcomm(r) && !isSeller(r) && !isKitchen(r)
}

export const isMoney = (r: Rec) => MONEY.has(r.category ?? '')
export const isWaiting = (r: Rec) => WAITING.includes((r.status || '').toLowerCase())

// The years the Ecomm and Sellers tabs offer, newest first.
//
// Derived from ALL marketplace money — Ecomm rows AND seller rows together —
// so the two tabs always show the SAME chips. Deriving each tab's list from
// its own rows made the control vanish on a tab whose data happened to sit in
// one year, which reads as broken rather than as "nothing to choose".
export function salesYears(all: Rec[]): string[] {
  const years = new Set<string>()
  for (const r of all) {
    if (r.category !== 'cash_in' || !r.due_date) continue
    if (!isEcomm(r) && !isSeller(r)) continue
    years.add(r.due_date.slice(0, 4))
  }
  return [...years].sort().reverse()
}
