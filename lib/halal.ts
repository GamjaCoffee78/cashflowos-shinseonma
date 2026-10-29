// 🕌 Halal status — the JAKIM halal certificate of each Okmaya product, and
//    when to start renewing it.
//
// The product list lives HERE, in code. A product only gets a `records` row
// (category='halal', meta.key = its key below) once someone changes it on the
// tab — until then the seed date below is used. So adding a product = one line.
//
// Dates come from the MYeHALAL directory (search "Okmaya", category Produk
// Makanan / Minuman), checked 2026-10-27. Where a product has several
// certificates, the LATEST expiry is tracked (owner's decision, 2026-10-27).
//
// Reminder rule (owner's decision, 2026-10-27): from 3 months before expiry,
// Hui Yee's Monday "Today" digest lists the product, every Monday, until a new
// expiry date is entered. "Renewal in progress" pauses it — but it comes back
// 1 month before expiry, so a stuck renewal is never missed.

import type { Rec } from '@/lib/records'

export type HalalProduct = {
  key: string
  name: string          // what the team calls it
  directoryName: string // exactly as the MYeHALAL directory lists it
  expiry: string        // seed: latest expiry on the directory (YYYY-MM-DD)
  renewing?: boolean    // seed: renewal already submitted
  pinned?: boolean      // tracks one specific certificate (not the latest) — see lib/halal-check.ts
}

export const HALAL_PRODUCTS: HalalProduct[] = [
  { key: 'soft-tofu-stew-paste', name: 'Soft Tofu Stew Paste', directoryName: 'PES SUP TOFU BEREMPAH', expiry: '2028-10-31' },
  // FamilyMart's own certificate of the same paste (directory row with the 15/02/2028 expiry).
  { key: 'soft-tofu-stew-paste-familymart', name: 'Soft Tofu Stew Paste (FamilyMart)', directoryName: 'PES SUP TOFU BEREMPAH', expiry: '2028-02-15', pinned: true },
  { key: 'bulgogi-sauce', name: 'Bulgogi Sauce', directoryName: 'SOS KOREA BULGOGI', expiry: '2027-01-31', renewing: true },
  { key: 'tteokbokki-sauce', name: 'Tteokbokki Sauce', directoryName: 'KOREAN TTEOKBOKKI SAUCE (SOS TTEOKBOKKI KOREA)', expiry: '2027-06-30' },
  { key: 'seaweed-soup', name: 'Seaweed Soup', directoryName: 'SUP RUMPAI LAUT KOREA (KOREAN SEAWEED SOUP)', expiry: '2028-02-29' },
  { key: 'tteokbokki-rice-cake', name: 'Tteokbokki Rice Cake', directoryName: 'KEK BERAS TTEOKBOKKI / TTEOKBOKKI RICE CAKE', expiry: '2027-12-15' },
  { key: 'chili-flakes', name: 'Chili Flakes', directoryName: 'EMPING CILI KOREA', expiry: '2028-10-31' },
  { key: 'chili-powder', name: 'Chili Powder', directoryName: 'SERBUK CILI KOREA', expiry: '2028-10-31' },
  { key: 'kimchi-jjigae-paste', name: 'Kimchi Jjigae Paste', directoryName: 'PES SUP KIMCHI BEREMPAH / KIMCHI STEW PASTE', expiry: '2028-11-30' },
  { key: 'japchae-sauce', name: 'Japchae Sauce', directoryName: 'SOS JAPCHAE KOREA / KOREAN JAPCHAE SAUCE', expiry: '2028-11-30' },
  { key: 'glass-noodles', name: 'Glass Noodles', directoryName: 'MEE KACA UBI KELEDEK KOREA / KOREAN SWEET POTATO GLASS NOODLES', expiry: '2028-11-30' },
]

export const REMIND_MONTHS = 3     // start reminding this many months before expiry
export const SAFETY_NET_MONTHS = 1 // "renewal in progress" stops pausing this close to expiry

export type HalalStatus = 'ok' | 'renew' | 'renewing' | 'expired'

export type HalalItem = HalalProduct & {
  id: number | null      // the records row, once one exists
  renewing: boolean
  remindFrom: string     // expiry minus REMIND_MONTHS
  daysLeft: number
  status: HalalStatus
  remind: boolean        // goes in the Monday reminder
  flag: string | null    // what the daily MYeHALAL check found wrong (lib/halal-check.ts)
  checkedAt: string | null
}

// Same day N months earlier, clamped to the month's last day (31 Jan − 3 → 31 Oct, 31 May − 3 → 28/29 Feb).
export function monthsBefore(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 - months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return first.toISOString().slice(0, 10)
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

// Every tracked product with its current expiry (saved row, else the seed), soonest first.
export function halalItems(rows: Rec[], today: string): HalalItem[] {
  const saved = new Map(rows.filter(r => r.category === 'halal' && r.meta?.key).map(r => [String(r.meta.key), r]))
  return HALAL_PRODUCTS.map(p => {
    const row = saved.get(p.key)
    const expiry = row?.due_date || p.expiry
    const renewing = row ? !!row.meta.renewing : !!p.renewing
    const remindFrom = monthsBefore(expiry, REMIND_MONTHS)
    const safetyNet = monthsBefore(expiry, SAFETY_NET_MONTHS)
    const inWindow = today >= remindFrom
    const status: HalalStatus = today > expiry ? 'expired' : !inWindow ? 'ok' : renewing ? 'renewing' : 'renew'
    return {
      ...p,
      id: row?.id ?? null,
      expiry,
      renewing,
      remindFrom,
      daysLeft: daysBetween(today, expiry),
      status,
      remind: inWindow && (!renewing || today >= safetyNet),
      flag: row?.meta.flag ?? null,
      checkedAt: row?.meta.checked_at ?? null,
    }
  }).sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0))
}

// The Monday digest section, or '' when nothing needs renewing (or it isn't Monday).
export function halalDigestSection(rows: Rec[], today: string): string {
  if (new Date(`${today}T00:00:00Z`).getUTCDay() !== 1) return ''
  const due = halalItems(rows, today).filter(i => i.remind)
  if (!due.length) return ''
  const fmt = (iso: string) => iso.split('-').reverse().join('/')
  const lines = due.map(i =>
    i.status === 'expired'
      ? `• ${i.name} — <b>EXPIRED</b> ${fmt(i.expiry)}`
      : `• ${i.name} — expires ${fmt(i.expiry)} (${i.daysLeft} days)${i.renewing ? ', renewal submitted' : ''}`,
  )
  return `<b>🕌 Halal renewals</b>\n${lines.join('\n')}\nNew date in? Update it on the Halal status tab.\n\n`
}
