import type { Rec } from './records'
import { todayISO } from './records'
import { addDays } from './ads-daily'
import { CATEGORY as SHOPEE_ORDER, money } from './shopee'
import type { AdRow } from './ads-leaderboard'
import { itemLines, unitsOf } from './product-units'

// The "Sales" column on the Meta Ads tab: how much of the advertised product
// Shopee sold while the ad ran. Read-only — it only totals shopee_order rows.
//
//   "IG Post: Okmaya MY MYG (…) (7 - 20 Oct)"
//      MY  → Shopee MY orders (SG → Shopee SG; neither → no figure)
//      MYG → Seaweed Soup, via PRODUCTS below
//      run → the ad set's own start/end from Meta (never the dates in the name)
//
// Units come from lib/product-units.ts, the same rule the shop tabs use: a
// Tteokbokki Bundle Set (from either listing) is 1 sauce + 1 rice cake, so a
// TBK ad counts Sauce Only plus the sauce in every bundle. A bundle's revenue
// is split by the shop's own Sauce Only vs Rice Cake Only prices. Any other
// line naming two products is a combo set and is still left out.

// Ad-name codes → the words a Shopee listing uses for that product. Add a row
// here for a new product; codes are matched as whole words, any case.
export const PRODUCTS: { name: string; codes: string[]; listing: RegExp }[] = [
  { name: 'Seaweed Soup', codes: ['MYG', 'Miyeok-guk', 'Miyeokguk', 'Miyeok guk'], listing: /seaweed\s*soup|miyeok/i },
  { name: 'Bulgogi Sauce', codes: ['BGG', 'Bulgogi'], listing: /bulgogi[\s\S]*sauce/i },
  { name: 'Tteokbokki Sauce', codes: ['TBK', 'Tteokbokki'], listing: /tteokbokki[\s\S]*sauce/i },
  { name: 'Soft Tofu Stew Paste', codes: ['SDB', 'Sundubu'], listing: /soft\s*tofu|sundubu/i },
]

const word = (s: string) => new RegExp(`\\b${s}\\b`, 'i')

// The shop an ad is for, from its MY / SG tag.
export function adRegion(name: string): 'MY' | 'SG' | null {
  const my = name.search(word('MY')), sg = name.search(word('SG'))
  if (my < 0 && sg < 0) return null
  if (sg < 0) return 'MY'
  if (my < 0) return 'SG'
  return my < sg ? 'MY' : 'SG'
}

// The product an ad is for: the code that appears FIRST in the name, so a
// caption mentioning another dish later on can't steal the match.
export function adProduct(name: string) {
  let best: { p: (typeof PRODUCTS)[number]; at: number } | null = null
  for (const p of PRODUCTS) {
    for (const c of p.codes) {
      const at = name.search(word(c))
      if (at >= 0 && (!best || at < best.at)) best = { p, at }
    }
  }
  return best?.p ?? null
}

// The ad's run as Malaysia dates, inclusive. Meta stamps times in the account's
// timezone, so the first 10 characters are already the local date. An end at
// exactly midnight means "until the end of the day before".
export function adRun(ad: AdRow): { from: string; to: string } | null {
  if (!ad.starts) return null
  const from = ad.starts.slice(0, 10)
  let to = ad.ends ? ad.ends.slice(0, 10) : todayISO()
  if (ad.ends && /T00:00(:00)?/.test(ad.ends)) to = addDays(to, -1)
  const today = todayISO()
  if (to > today) to = today
  return to >= from ? { from, to } : null
}

// `partners` = every product in the same bundle (empty for a single item).
// `text` is what PRODUCTS' listing words are matched against: the product
// name for a split Tteokbokki line, else the listing name + variant as before.
type Line = { date: string; product: string; text: string; qty: number; price: number; bundle: boolean; partners: string[]; currency: string }

// One entry per product unit, from the item summary lib/shopee.ts writes:
// "2× Seaweed Soup (Family) @ RM18.9; 1× Tteokbokki Sauce (Bundle Set) @ RM25.9".
// `price` is the line's unit price — for a bundle, the whole bundle's price.
function lines(orders: Rec[]): Line[] {
  const out: Line[] = []
  for (const o of orders) {
    if (o.category !== SHOPEE_ORDER) continue
    for (const l of itemLines(String(o.meta?.items || ''))) {
      const units = unitsOf(l)
      const partners = units.filter(u => u.bundle).map(u => u.product)
      for (const u of units) {
        out.push({ date: o.due_date || '', product: u.product, text: u.product === l.name ? `${l.name} ${l.variation}`.trim() : u.product, qty: u.qty, price: l.price, bundle: u.bundle, partners: u.bundle ? partners : [], currency: String(o.meta?.currency || '') })
      }
    }
  }
  return out
}

const median = (ns: number[]) => {
  const s = [...ns].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

// The share of a bundle's price that belongs to `product`: its usual single
// price over the sum of the single prices of everything in the bundle (here,
// Sauce Only vs Rice Cake Only in the same shop). Half each when a single
// price isn't known yet.
function bundleShare(all: Line[], product: string, partners: string[]): number {
  const single = (p: string) => median(all.filter(l => l.product === p && !l.bundle && l.price > 0).map(l => l.price))
  const prices = partners.map(single)
  if (prices.some(p => !p)) return 1 / partners.length
  return single(product) / prices.reduce((a, b) => a + b, 0)
}

export type AdSales =
  | { kind: 'sales'; qty: number; revenue: string; product: string; region: string; from: string; to: string; partialFrom?: string }
  | { kind: 'none'; reason: string }

// Sales per ad_id. `my` / `sg` are that shop's shopee_order rows.
export function adShopeeSales(ads: AdRow[], my: Rec[], sg: Rec[]): Map<string, AdSales> {
  const shop = { MY: lines(my), SG: lines(sg) }
  const first = {
    MY: shop.MY.reduce((min, l) => (!min || l.date < min ? l.date : min), ''),
    SG: shop.SG.reduce((min, l) => (!min || l.date < min ? l.date : min), ''),
  }
  const out = new Map<string, AdSales>()
  for (const ad of ads) {
    const region = adRegion(ad.name)
    const product = adProduct(ad.name)
    const run = adRun(ad)
    if (!region) { out.set(ad.ad_id, { kind: 'none', reason: 'no MY / SG in the ad name' }); continue }
    if (!product) { out.set(ad.ad_id, { kind: 'none', reason: 'not linked to a product' }); continue }
    if (!run) { out.set(ad.ad_id, { kind: 'none', reason: 'no run dates from Meta yet' }); continue }

    const all = shop[region]
    const shares = new Map<string, number>()
    let qty = 0, total = 0, currency = region === 'SG' ? 'SGD' : 'MYR'
    for (const l of all) {
      if (l.date < run.from || l.date > run.to) continue
      if (!product.listing.test(l.text)) continue
      // A combo set names two products — skipped for now (see the top).
      if (PRODUCTS.some(p => p !== product && p.listing.test(l.text))) continue
      let share = 1
      if (l.bundle) {
        const key = l.partners.join('+')
        if (!shares.has(key)) shares.set(key, bundleShare(all, l.product, l.partners))
        share = shares.get(key)!
      }
      qty += l.qty
      total += l.qty * l.price * share
      if (l.currency) currency = l.currency
    }
    out.set(ad.ad_id, {
      kind: 'sales',
      qty,
      // Same symbols as the Shopee tabs: RM for MY, a plain $ for SG.
      revenue: money(total, currency),
      product: product.name,
      region,
      from: run.from,
      to: run.to,
      // The live sync only holds the last few weeks; say so instead of
      // reporting a short count as if it were the whole run.
      partialFrom: !first[region] || first[region] > run.from ? first[region] || 'none' : undefined,
    })
  }
  return out
}
