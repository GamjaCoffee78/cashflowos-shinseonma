// What one order line actually sold, in product units — shared by the Shopee
// MY / SG and TikTok Shop "what sold" counts and the Meta Ads "Sales" column,
// so every tab counts the same way.
//
// Order lines arrive as the summary the syncs write:
//   "2× Tteokbokki Sauce 300g (Bundle Set) @ RM25.9"
//   name = "Tteokbokki Sauce 300g", variation = "Bundle Set", qty = 2
//
// Tteokbokki has two listings on Shopee and TikTok Shop, each with two variants:
//   Tteokbokki Sauce listing      Sauce Only     → 1 Tteokbokki Sauce
//                                 Bundle Set     → 1 Sauce + 1 Rice Cake
//   Tteokbokki Rice Cake listing  Rice Cake Only → 1 Tteokbokki Rice Cake
//                                 Bundle Set     → 1 Sauce + 1 Rice Cake
// so a bundle counts once for each product, whichever listing it came from.
// Every other listing counts as itself, under its own name.

export const TBK_SAUCE = 'Tteokbokki Sauce'
export const TBK_RICE_CAKE = 'Tteokbokki Rice Cake'

export type Unit = { product: string; qty: number; bundle: boolean }

export type ItemLine = { qty: number; name: string; variation: string; price: number }

// "2× Name (Variation) @ RM18.9" → its parts. The variation is the LAST
// bracket before the price; a line without one has an empty variation.
export function parseItem(part: string): ItemLine | null {
  const m = part.trim().match(/^(\d+)×\s*(.+?)\s*@\s*[^\d.]*([\d.]+)\s*$/)
  if (!m) return null
  const label = m[2].trim()
  const v = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
  return {
    qty: Number(m[1]),
    name: (v ? v[1] : label).trim(),
    variation: v ? v[2].trim() : '',
    price: Number(m[3]) || 0,
  }
}

export const itemLines = (items: string) =>
  String(items || '').split(';').map(parseItem).filter((l): l is ItemLine => !!l)

const TBK = /tteok\s*-?\s*bo?k+i|topokki|ddeokbokki/i

export function unitsOf(line: Pick<ItemLine, 'name' | 'variation' | 'qty'>): Unit[] {
  const { name, variation, qty } = line
  if (TBK.test(name)) {
    // The variant decides first; a line from before the variants existed has
    // none, so the listing name decides.
    if (/bundle/i.test(variation)) {
      return [{ product: TBK_SAUCE, qty, bundle: true }, { product: TBK_RICE_CAKE, qty, bundle: true }]
    }
    if (/rice\s*cake\s*only/i.test(variation)) return [{ product: TBK_RICE_CAKE, qty, bundle: false }]
    if (/sauce\s*only/i.test(variation)) return [{ product: TBK_SAUCE, qty, bundle: false }]
    if (/rice\s*cake/i.test(name) && !/sauce/i.test(name)) return [{ product: TBK_RICE_CAKE, qty, bundle: false }]
    if (/sauce/i.test(name)) return [{ product: TBK_SAUCE, qty, bundle: false }]
  }
  return [{ product: name, qty, bundle: false }]
}

// Units sold per product across many orders' item summaries, best first.
export function tallyUnits(itemSummaries: string[], limit = 5) {
  const tally = new Map<string, number>()
  for (const items of itemSummaries) {
    for (const line of itemLines(items)) {
      for (const u of unitsOf(line)) if (u.product) tally.set(u.product, (tally.get(u.product) ?? 0) + u.qty)
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }))
}
