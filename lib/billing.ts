import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { DOC_TYPES, emptyContact, emptyItem, paidSum, totals, type BillingDoc, type Contact, type DocType, type Item, type ItemSuggestion } from './billing-shared'

// Billing documents (PO, DO, Invoice, Credit Note, Debit Note) live in the ONE
// `records` table as category='billing_doc'; the whole document sits in `meta`,
// `amount` holds its grand total, `due_date` its document date.
//
// 'billing_doc' is listed in HEAVY_CATEGORIES (lib/records.ts), so these rows
// never ride along into the Dashboard or the Cash In / Cash Out totals. An
// invoice is not cash until it is paid — the money tabs stay as they are.

export const CATEGORY = 'billing_doc'

export type StoredDoc = BillingDoc & { id: number; created_at: string }

function fromRow(r: any): StoredDoc {
  return { ...(r.meta ?? {}), id: r.id, created_at: r.created_at } as StoredDoc
}

export function toRow(d: BillingDoc) {
  const { id, ...meta } = d as StoredDoc
  delete (meta as any).created_at
  return {
    title: `${d.number} · ${d.party.name}`,
    status: d.status,
    amount: DOC_TYPES[d.type].priced ? totals(d).total : 0,
    category: CATEGORY,
    due_date: d.date,
    notes: d.notes || null,
    meta,
  }
}

export async function listDocs(): Promise<StoredDoc[]> {
  if (!supabaseConfigured) return []
  const all: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('records').select('*').eq('category', CATEGORY)
      .order('due_date', { ascending: false }).order('id', { ascending: false }).range(from, from + 999)
    if (error) { console.warn('[CFO] billing read failed:', error.message); break }
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return all.map(fromRow)
}

export async function getDoc(id: number): Promise<StoredDoc | null> {
  if (!supabaseConfigured || !Number.isFinite(id)) return null
  const { data } = await supabase.from('records').select('*').eq('category', CATEGORY).eq('id', id).maybeSingle()
  return data ? fromRow(data) : null
}

// INV-2026-0001 — running number per type per year.
export function nextNumber(docs: StoredDoc[], type: DocType, date: string) {
  const prefix = `${type}-${date.slice(0, 4)}-`
  const max = docs
    .filter(d => d.number?.startsWith(prefix))
    .reduce((m, d) => Math.max(m, parseInt(d.number.slice(prefix.length), 10) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// What the customer still owes on an invoice: total + debit notes − credit notes − payments.
// Cancelled notes don't count.
export function invoiceBalance(inv: StoredDoc, docs: StoredDoc[]) {
  const linked = docs.filter(d => d.refNo === inv.number && d.status !== 'cancelled')
  const cn = linked.filter(d => d.type === 'CN').reduce((s, d) => s + totals(d).total, 0)
  const dn = linked.filter(d => d.type === 'DN').reduce((s, d) => s + totals(d).total, 0)
  const total = totals(inv).total
  const paid = paidSum(inv)
  return { total, cn, dn, paid, balance: Math.round((total + dn - cn - paid) * 100) / 100 }
}

// ── Contacts: saved customers & suppliers ─────────────────────────────────
// category='billing_contact'; the contact sits in `meta`, `title` is the name.
// Deleting a contact removes its row (old documents keep their own copy);
// rows archived before that change are still hidden by the status filter.
export const CONTACT_CATEGORY = 'billing_contact'

export async function listContacts(): Promise<Contact[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('records').select('*').eq('category', CONTACT_CATEGORY)
    .neq('status', 'archived').order('title', { ascending: true }).limit(2000)
  if (error) { console.warn('[CFO] contacts read failed:', error.message); return [] }
  return (data ?? []).map(r => ({ ...emptyContact(), ...(r.meta ?? {}), id: r.id }))
}

export function contactRow(c: Contact) {
  const { id, ...meta } = c
  return { title: c.name, status: 'active', amount: 0, category: CONTACT_CATEGORY, notes: c.notes || null, meta }
}

// ── Items: saved products & services ─────────────────────────────────────
// category='billing_item'; the item sits in `meta`, `title` is its name,
// `amount` its selling price.
export const ITEM_CATEGORY = 'billing_item'

export async function listItems(): Promise<Item[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('records').select('*').eq('category', ITEM_CATEGORY)
    .order('title', { ascending: true }).limit(5000)
  if (error) { console.warn('[CFO] items read failed:', error.message); return [] }
  return (data ?? []).map(r => ({ ...emptyItem(), ...(r.meta ?? {}), id: r.id }))
}

export function itemRow(i: Item) {
  const { id, ...meta } = i
  return { title: i.name, status: 'active', amount: i.price, category: ITEM_CATEGORY, notes: i.notes || null, meta }
}

// Every product that appears in the Shopee / TikTok orders already synced,
// with how many sold and the latest price. Reads only the order summaries
// ("2× Bulgogi Sauce (500g) @ RM18.90; …") — nothing is written.
export async function suggestItems(maxOrders = 100_000): Promise<ItemSuggestion[]> {
  if (!supabaseConfigured) return []
  const tally = new Map<string, ItemSuggestion & { date: string }>()
  for (const [category, from] of [['shopee_order', 'Shopee'], ['tiktok_order', 'TikTok Shop']] as const) {
    for (let at = 0; at < maxOrders; at += 1000) {
      const { data, error } = await supabase.from('records').select('due_date, meta->>items, meta->>currency')
        .eq('category', category).order('due_date', { ascending: false }).range(at, at + 999)
      if (error) { console.warn('[CFO] item suggestions read failed:', error.message); break }
      for (const r of (data ?? []) as any[]) {
        const currency = String(r.currency || 'MYR').toUpperCase()
        for (const part of String(r.items || '').split(';')) {
          const m = part.trim().match(/^(\d+)×\s*(.+?)\s*@\s*([^\d\s]*)\s*([\d.]+)\s*$/)
          if (!m) continue
          const name = m[2].trim()
          const key = name.toLowerCase()
          const price = Number(m[4]) || 0
          const was = tally.get(key)
          if (!was) tally.set(key, { name, price, currency, sold: Number(m[1]), from, date: r.due_date ?? '' })
          else {
            was.sold += Number(m[1])
            if (!was.from.includes(from)) was.from += ` · ${from}`
            // Prefer the latest Ringgit price over a Singapore-dollar one.
            if (was.currency !== 'MYR' && currency === 'MYR') Object.assign(was, { price, currency })
          }
        }
      }
      if (!data || data.length < 1000) break
    }
  }
  return [...tally.values()].sort((a, b) => b.sold - a.sold).map(({ date, ...s }) => s)
}
