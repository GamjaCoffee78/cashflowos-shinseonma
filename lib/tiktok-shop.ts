import { createHmac } from 'node:crypto'
import { supabase, supabaseConfigured } from './supabase'
import { todayISO, type Rec } from './records'
import { daysAgoISO, addDays, num } from './ads-daily'

// TikTok Shop Partner API → the ONE `records` table.
//
// One row per order in its own category, `tiktok_order`, shown on the TikTok
// Shop tab. Same shape and the same reasoning as lib/shopee.ts: a separate
// category so the money tabs and the Ecomm tab are never touched or
// double-counted, and the currency comes from the order itself.
//
// Secrets: TIKTOK_APP_KEY + TIKTOK_APP_SECRET (server-only, Vercel env). The
// per-shop tokens live in the `tiktok_auth` table — TikTok replaces both on
// every refresh, so an env var can't hold them.
//
// Not to be confused with lib/tiktok-ads.ts, which is ad spend, not sales.

const HOST = (process.env.TIKTOK_SHOP_HOST || 'https://open-api.tiktokglobalshop.com').replace(/\/+$/, '')
const AUTH_HOST = 'https://auth.tiktok-shops.com'
const APP_KEY = (process.env.TIKTOK_APP_KEY || '').trim()
const APP_SECRET = (process.env.TIKTOK_APP_SECRET || '').trim()
const SERVICE_ID = (process.env.TIKTOK_SERVICE_ID || '').trim()

export const tiktokShopConfigured = !!(APP_KEY && APP_SECRET)
export const CATEGORY = 'tiktok_order'

// Orders that never became money. TikTok also has UNPAID, which may yet pay.
const SKIP_STATUS = new Set(['CANCELLED', 'UNPAID'])

// ---- 1) Signing. TikTok hashes path + sorted params + body, wrapped in the secret. ----
function sign(path: string, params: Record<string, string>, body = ''): string {
  const base =
    APP_SECRET +
    path +
    Object.keys(params)
      .filter(k => k !== 'sign' && k !== 'access_token')
      .sort()
      .map(k => `${k}${params[k]}`)
      .join('') +
    body +
    APP_SECRET
  return createHmac('sha256', APP_SECRET).update(base).digest('hex')
}

// One signed call. `token` goes in a header, never in the signature.
async function call(
  path: string,
  opts: { token: string; params?: Record<string, string>; method?: 'GET' | 'POST'; body?: unknown } ,
): Promise<any> {
  const params: Record<string, string> = {
    app_key: APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(opts.params ?? {}),
  }
  const body = opts.body === undefined ? '' : JSON.stringify(opts.body)
  params.sign = sign(path, params, body)
  const res = await fetch(`${HOST}${path}?${new URLSearchParams(params)}`, {
    method: opts.method ?? 'GET',
    headers: { 'x-tts-access-token': opts.token, 'content-type': 'application/json' },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(25_000),
  })
  const json: any = await res.json().catch(() => ({}))
  // TikTok answers 200 with code != 0 on failure.
  if (!res.ok || (json?.code !== undefined && json.code !== 0)) {
    const parts = [json?.code, json?.message, json?.request_id && `request_id ${json.request_id}`].filter(Boolean).join(' · ')
    throw new Error(`TikTok Shop said no: ${(parts || `HTTP ${res.status}`).slice(0, 300)}`)
  }
  return json.data ?? {}
}

// ---- 2) The authorise link. TikTok sends the seller back with ?code=. ----
export function authorizeUrl(state = 'okmaya'): string {
  return `https://services.tiktokshop.com/open/authorize?service_id=${encodeURIComponent(SERVICE_ID)}&state=${encodeURIComponent(state)}`
}
export const serviceIdSet = !!SERVICE_ID

// ---- 3) Tokens. The auth host is unsigned — key and secret go in the query. ----
type Auth = { shop_id: string; cipher?: string; access_token: string; refresh_token: string; expires_at: string }

async function tokenCall(path: string, params: Record<string, string>): Promise<any> {
  const url = `${AUTH_HOST}${path}?${new URLSearchParams({ app_key: APP_KEY, app_secret: APP_SECRET, ...params })}`
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok || (json?.code !== undefined && json.code !== 0)) {
    const parts = [json?.code, json?.message].filter(Boolean).join(' · ')
    throw new Error(`TikTok Shop said no: ${(parts || `HTTP ${res.status}`).slice(0, 300)}`)
  }
  return json.data ?? {}
}

// TikTok returns an absolute unix second, not a duration — but has shipped both
// over time, so treat anything small as a duration.
export function expiryOf(v: unknown): string {
  const n = num(v)
  if (!n) return new Date(Date.now() + 6 * 86400_000).toISOString()
  const ms = n > 10_000_000_00 ? n * 1000 : Date.now() + n * 1000
  return new Date(ms).toISOString()
}

export async function exchangeCode(code: string) {
  const d = await tokenCall('/api/v2/token/get', { auth_code: code, grant_type: 'authorized_code' })
  return {
    access_token: String(d.access_token),
    refresh_token: String(d.refresh_token),
    expires_at: expiryOf(d.access_token_expire_in),
  }
}

async function refresh(a: Auth): Promise<Auth> {
  const d = await tokenCall('/api/v2/token/refresh', { refresh_token: a.refresh_token, grant_type: 'refresh_token' })
  return {
    ...a,
    access_token: String(d.access_token),
    refresh_token: String(d.refresh_token || a.refresh_token),
    expires_at: expiryOf(d.access_token_expire_in),
  }
}

// ---- 4) Which shops did the seller authorise? ----
export async function authorisedShopsFrom(token: string): Promise<{ id: string; name?: string; region?: string; cipher?: string }[]> {
  const d = await call('/authorization/202309/shops', { token })
  return (d.shops ?? []).map((s: any) => ({
    id: String(s.id),
    name: s.name ? String(s.name) : undefined,
    region: s.region ? String(s.region).toUpperCase() : undefined,
    cipher: s.cipher ? String(s.cipher) : undefined,
  }))
}

export async function saveAuth(rows: (Auth & { shop_name?: string; region?: string })[]) {
  if (!supabaseConfigured) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('tiktok_auth')
    .upsert(rows.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'shop_id' })
  if (error) throw new Error(`could not store the TikTok tokens: ${error.message}`)
}

// Stored shops, each with a token good for at least another hour.
export async function authorisedShops(): Promise<(Auth & { shop_name?: string; region?: string })[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('tiktok_auth').select('*')
  if (error) {
    if (/does not exist/i.test(error.message)) throw new Error('The tiktok_auth table is missing — run supabase/schema.sql in the Supabase SQL editor.')
    throw new Error(`could not read tiktok_auth: ${error.message}`)
  }
  const out: (Auth & { shop_name?: string; region?: string })[] = []
  for (const row of data ?? []) {
    let a: Auth & { shop_name?: string; region?: string } = {
      shop_id: String(row.shop_id),
      cipher: row.cipher ?? undefined,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at,
      shop_name: row.shop_name ?? undefined,
      region: row.region ?? undefined,
    }
    if (new Date(a.expires_at).getTime() < Date.now() + 3600_000) {
      a = { ...a, ...(await refresh(a)) }
      await saveAuth([a])
    }
    out.push(a)
  }
  return out
}

export async function linkedShops(): Promise<string[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('tiktok_auth').select('shop_name, shop_id')
  return (data ?? []).map(r => String(r.shop_name || r.shop_id))
}

// ---- 5) Orders. Search by create time, 15-day windows, cursor paged. ----
type TikTokOrder = {
  id: string
  status: string
  date: string
  buyer: string
  total: number
  currency: string
  items: { name: string; variation: string; qty: number; price: number }[]
}

async function searchOrders(shop: Auth, from: string, to: string): Promise<TikTokOrder[]> {
  const out: TikTokOrder[] = []
  for (let start = from; start <= to; start = addDays(start, 15)) {
    const end = addDays(start, 14) < to ? addDays(start, 14) : to
    let pageToken = ''
    for (let guard = 0; guard < 60; guard++) {
      const params: Record<string, string> = { page_size: '50', sort_field: 'create_time', sort_order: 'ASC' }
      if (shop.cipher) params.shop_cipher = shop.cipher
      if (pageToken) params.page_token = pageToken
      const d = await call('/order/202309/orders/search', {
        token: shop.access_token,
        method: 'POST',
        params,
        body: {
          create_time_ge: Math.floor(new Date(`${start}T00:00:00+08:00`).getTime() / 1000),
          create_time_lt: Math.floor(new Date(`${addDays(end, 1)}T00:00:00+08:00`).getTime() / 1000),
        },
      })
      for (const o of d.orders ?? []) {
        const items = (o.line_items ?? []).reduce((acc: TikTokOrder['items'], li: any) => {
          const name = String(li.product_name || '')
          const variation = String(li.sku_name || '')
          const found = acc.find(x => x.name === name && x.variation === variation)
          if (found) found.qty += 1
          else acc.push({ name, variation, qty: 1, price: num(li.sale_price) })
          return acc
        }, [])
        out.push({
          id: String(o.id),
          status: String(o.status || ''),
          // TikTok gives unix seconds; the shop reports in Malaysian time.
          date: new Date(num(o.create_time) * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
          buyer: String(o.user_id || o.buyer_email || '').slice(0, 40),
          total: num(o.payment?.total_amount),
          currency: String(o.payment?.currency || '').toUpperCase(),
          items,
        })
      }
      pageToken = d.next_page_token ? String(d.next_page_token) : ''
      if (!pageToken) break
    }
  }
  return out
}

const shortName = (n: string) => {
  const clean = n.replace(/[\u{1D400}-\u{1D7FF}]+/gu, '').replace(/\bokmaya\b/gi, '').replace(/\s+/g, ' ').trim()
  if (clean.length <= 40) return clean
  const cut = clean.slice(0, 40)
  const space = cut.lastIndexOf(' ')
  return space > 20 ? cut.slice(0, space) : cut
}
const SYMBOL: Record<string, string> = { MYR: 'RM', SGD: '$', THB: '฿', IDR: 'Rp', PHP: '₱', VND: '₫', GBP: '£', USD: 'US$' }
export function money(n: number, currency: string): string {
  const s = SYMBOL[currency.toUpperCase()] || currency.toUpperCase() || ''
  return `${s} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
}

function toRecord(o: TikTokOrder, shop: { label: string; id: string; region: string }) {
  const parts = o.items.map(i => `${i.qty}× ${shortName(i.name) || 'item'}${i.variation ? ` (${i.variation})` : ''}`)
  const label = parts.slice(0, 2).join(', ') + (parts.length > 2 ? ` +${parts.length - 2} more` : '')
  const qty = o.items.reduce((s, i) => s + i.qty, 0)
  return {
    title: `TikTok #${o.id} — ${label}`,
    status: 'paid',
    amount: o.total,
    category: CATEGORY,
    due_date: o.date,
    notes: `${qty} item${qty === 1 ? '' : 's'} · buyer ${o.buyer || '—'} · TikTok: ${o.status}`,
    meta: {
      source: 'tiktok_shop',
      shop: shop.label,
      shop_id: shop.id,
      shop_region: shop.region,
      currency: o.currency,
      platform: 'TikTok Shop',
      customer: o.buyer || undefined,
      tiktok_order_id: o.id,
      tiktok_status: o.status,
      items: o.items
        .map(i => `${i.qty}× ${shortName(i.name)}${i.variation ? ` (${i.variation})` : ''} @ ${SYMBOL[o.currency] || o.currency}${i.price}`)
        .join('; '),
      synced_at: new Date().toISOString(),
    },
  }
}

// ---- 6) The sync the cron and the Sync now button call. ----
export async function syncTikTokShop(opts: { days?: number; until?: number; dryRun?: boolean } = {}) {
  if (!tiktokShopConfigured) return { skipped: 'TIKTOK_APP_KEY / TIKTOK_APP_SECRET not set' as const }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured' as const }

  const shops = await authorisedShops()
  if (!shops.length) return { skipped: 'no TikTok shop authorised yet — open /api/tiktok/authorize once' as const }

  const days = opts.days ?? 7
  const from = daysAgoISO(days)
  const to = opts.until ? daysAgoISO(opts.until) : todayISO()

  let fetched = 0, inserted = 0, updated = 0, unchanged = 0, cancelled = 0
  const sample: string[] = []
  for (const shop of shops) {
    const region = (shop.region || '').toUpperCase()
    const stamp = { label: shop.shop_name || `TikTok Shop${region ? ` ${region}` : ''}`, id: shop.shop_id, region }
    const orders = (await searchOrders(shop, from, to)).filter(o => {
      if (SKIP_STATUS.has(o.status)) { cancelled++; return false }
      return true
    })
    fetched += orders.length
    if (opts.dryRun) {
      for (const o of orders.slice(0, 10)) sample.push(`${o.date}  #${o.id}  ${money(o.total, o.currency)}  ${o.status}`)
      continue
    }

    const { data, error } = await supabase
      .from('records')
      .select('id, amount, meta')
      .eq('category', CATEGORY)
      .gte('due_date', from)
      .lte('due_date', to)
      .limit(5000)
    if (error) throw new Error(`could not read existing TikTok orders: ${error.message}`)
    const existing = new Map<string, { id: number; amount: number; status: string; items: string }>()
    for (const r of data ?? []) {
      if (!r.meta?.tiktok_order_id) continue
      existing.set(String(r.meta.tiktok_order_id), {
        id: r.id,
        amount: num(r.amount),
        status: String(r.meta.tiktok_status || ''),
        items: String(r.meta.items || ''),
      })
    }

    const toInsert: any[] = []
    for (const o of orders) {
      const row = toRecord(o, stamp)
      const was = existing.get(o.id)
      if (!was) { toInsert.push(row); continue }
      if (was.status === o.status && Math.abs(was.amount - o.total) < 0.005 && was.items === row.meta.items) { unchanged++; continue }
      const { error } = await supabase.from('records').update(row).eq('id', was.id)
      if (error) throw new Error(`update order ${o.id} failed: ${error.message}`)
      updated++
    }
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase.from('records').insert(toInsert.slice(i, i + 500))
      if (error) throw new Error(`insert failed: ${error.message}`)
      inserted += toInsert.slice(i, i + 500).length
    }
  }
  return { from, to, shops: shops.length, fetched, inserted, updated, unchanged, cancelled, ...(opts.dryRun ? { sample } : {}) }
}

// ---- 7) Reads for the tab. Same narrow queries as Shopee: never getRecords(). ----
export async function fetchTikTokOrders(days = 60): Promise<Rec[]> {
  if (!supabaseConfigured) return []
  const from = daysAgoISO(days)
  const PAGE = 1000
  const all: any[] = []
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('category', CATEGORY)
      .gte('due_date', from)
      .order('due_date', { ascending: false })
      .range(start, start + PAGE - 1)
    if (error) { console.warn('[CFO] could not read TikTok orders:', error.message); break }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return all.map(r => ({ ...r, meta: r.meta ?? {} })) as Rec[]
}

export async function fetchTikTokMonths(sinceISO: string) {
  if (!supabaseConfigured) return [] as { month: string; orders: number; revenue: number }[]
  const PAGE = 1000
  const tally = new Map<string, { orders: number; revenue: number }>()
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('records')
      .select('due_date, amount')
      .eq('category', CATEGORY)
      .gte('due_date', sinceISO)
      .order('due_date', { ascending: false })
      .range(start, start + PAGE - 1)
    if (error) { console.warn('[CFO] could not read TikTok months:', error.message); break }
    for (const r of data ?? []) {
      const month = String(r.due_date || '').slice(0, 7)
      if (!month) continue
      const t = tally.get(month) ?? { orders: 0, revenue: 0 }
      t.orders++
      t.revenue += num(r.amount)
      tally.set(month, t)
    }
    if (!data || data.length < PAGE) break
  }
  return [...tally.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([month, t]) => ({ month, ...t }))
}
