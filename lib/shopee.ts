import { createHmac } from 'node:crypto'
import { supabase, supabaseConfigured } from './supabase'
import { todayISO, type Rec } from './records'
import { ABANG } from '@/abang/config'
import { daysAgoISO, addDays, num } from './ads-daily'

// Shopee Open API v2 → the ONE `records` table.
//
// One row per order in its OWN category, `shopee_order`, shown on the per-shop
// Shopee tabs (Shopee MY, Shopee SG — one per authorised shop).
//
// Region and currency come from Shopee per shop, never from config, so MYR and
// SGD money is never added together and a third shop needs no code change. Deliberately NOT `cash_in`: the money tabs and the Ecomm tab already
// count the orders that came in from the xlsx exports, so a separate category
// means the live sync can never overwrite that data or double-count it. Nothing
// here touches an existing row.
//
// Secrets: SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY (server-only, Vercel env).
// The per-shop access/refresh tokens live in the `shopee_auth` table, because
// Shopee replaces BOTH on every refresh — an env var can't hold them.

const HOST = (process.env.SHOPEE_HOST || 'https://partner.shopeemobile.com').replace(/\/+$/, '')
const PARTNER_ID = (process.env.SHOPEE_PARTNER_ID || '').trim()
const PARTNER_KEY = (process.env.SHOPEE_PARTNER_KEY || '').trim()

export const shopeeConfigured = !!(PARTNER_ID && PARTNER_KEY)
export const CATEGORY = 'shopee_order'

// Orders Shopee cancelled never became money — the xlsx importer skips them too.
const SKIP_STATUS = new Set(['CANCELLED', 'UNPAID', 'INVOICE_PENDING'])

// ---- 1) Signing. Shopee hashes a fixed string, not the query. ----
const now = () => Math.floor(Date.now() / 1000)
function sign(path: string, ts: number, extra = ''): string {
  return createHmac('sha256', PARTNER_KEY).update(`${PARTNER_ID}${path}${ts}${extra}`).digest('hex')
}
// Public call (no shop yet): auth and token endpoints.
function publicUrl(path: string, params: Record<string, string> = {}) {
  const ts = now()
  return `${HOST}${path}?${new URLSearchParams({ partner_id: PARTNER_ID, timestamp: String(ts), sign: sign(path, ts), ...params })}`
}
// Shop call: the signature also covers the access token and shop id.
function shopUrl(path: string, shopId: number, accessToken: string, params: Record<string, string> = {}) {
  const ts = now()
  return `${HOST}${path}?${new URLSearchParams({
    partner_id: PARTNER_ID,
    timestamp: String(ts),
    access_token: accessToken,
    shop_id: String(shopId),
    sign: sign(path, ts, `${accessToken}${shopId}`),
    ...params,
  })}`
}

// Shopee answers 200 with {error, message} on failure, so check the body.
async function call(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) })
  const body: any = await res.json().catch(() => ({}))
  if (!res.ok || (body?.error && String(body.error).length)) {
    // Shopee puts the useful half in `message` and the id for support in
    // `request_id`; show all three or the same failure is unreadable twice.
    const parts = [body?.error, body?.message, body?.request_id && `request_id ${body.request_id}`]
      .filter(Boolean)
      .join(' · ')
    throw new Error(`Shopee said no: ${(parts || `HTTP ${res.status}`).slice(0, 300)}`)
  }
  return body
}

// ---- 2) The authorise link you open once per shop. ----
// Shopee sends the shopkeeper back to `redirect` with ?code=&shop_id=.
export function authorizeUrl(redirect: string): string {
  return publicUrl('/api/v2/shop/auth_partner', { redirect })
}

// Which shop is this? Shopee knows its name and region ('MY', 'SG', …), so we
// never guess from config — that is what keeps two shops apart.
export async function shopInfo(shopId: number, accessToken: string): Promise<{ shop_name?: string; region?: string }> {
  try {
    const body = await call(shopUrl('/api/v2/shop/get_shop_info', shopId, accessToken))
    const r = body.response ?? body
    return { shop_name: r?.shop_name ? String(r.shop_name) : undefined, region: r?.region ? String(r.region).toUpperCase() : undefined }
  } catch {
    return {} // a shop that won't say stays unlabelled rather than mislabelled
  }
}

// ---- 3) Tokens: exchange the one-time code, then keep them fresh. ----
type Auth = { shop_id: number; access_token: string; refresh_token: string; expires_at: string }

// Shopee has renamed these endpoints across versions and the old name answers
// `error_not_found`, which reads like a bad code rather than a bad path. Try
// each in turn so we work whichever one this partner is served.
async function authCall(paths: string[], payload: Record<string, unknown>): Promise<any> {
  let last: unknown
  for (const path of paths) {
    try {
      return await call(publicUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      last = e
      if (!/error_not_found/.test(String((e as Error)?.message || ''))) throw e // a real refusal
    }
  }
  throw last
}

const TOKEN_PATHS = ['/api/v2/auth/token/get', '/api/v2/auth/token/get_access_token']
const REFRESH_PATHS = ['/api/v2/auth/access_token/get', '/api/v2/auth/token/refresh']

export async function exchangeCode(code: string, shopId: number): Promise<Auth> {
  const body = await authCall(TOKEN_PATHS, { code, shop_id: shopId, partner_id: Number(PARTNER_ID) })
  return {
    shop_id: shopId,
    access_token: String(body.access_token),
    refresh_token: String(body.refresh_token),
    expires_at: new Date(Date.now() + (num(body.expire_in) || 14400) * 1000).toISOString(),
  }
}

async function refresh(a: Auth): Promise<Auth> {
  const body = await authCall(REFRESH_PATHS, { refresh_token: a.refresh_token, shop_id: a.shop_id, partner_id: Number(PARTNER_ID) })
  return {
    shop_id: a.shop_id,
    access_token: String(body.access_token),
    refresh_token: String(body.refresh_token),
    expires_at: new Date(Date.now() + (num(body.expire_in) || 14400) * 1000).toISOString(),
  }
}

export async function saveAuth(a: Auth, extra: { shop_name?: string; region?: string } = {}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured')
  const { error } = await supabase.from('shopee_auth').upsert(
    { ...a, ...extra, updated_at: new Date().toISOString() },
    { onConflict: 'shop_id' },
  )
  if (error) throw new Error(`could not store the Shopee tokens: ${error.message}`)
}

// The authorised shops, each with a token good for at least another minute.
// A refresh hands back new tokens, so the row is rewritten every time.
export async function authorisedShops(): Promise<(Auth & { shop_name?: string; region?: string })[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('shopee_auth').select('*')
  if (error) {
    if (/does not exist/i.test(error.message)) throw new Error('The shopee_auth table is missing — run supabase/schema.sql in the Supabase SQL editor.')
    throw new Error(`could not read shopee_auth: ${error.message}`)
  }
  const out: (Auth & { shop_name?: string; region?: string })[] = []
  for (const row of data ?? []) {
    let a: Auth = { shop_id: Number(row.shop_id), access_token: row.access_token, refresh_token: row.refresh_token, expires_at: row.expires_at }
    if (new Date(a.expires_at).getTime() < Date.now() + 60_000) {
      a = await refresh(a)
      await saveAuth(a, { shop_name: row.shop_name, region: row.region })
    }
    out.push({ ...a, shop_name: row.shop_name, region: row.region })
  }
  return out
}

// ---- 4) Orders. list → detail (50 at a time) → one record per order. ----
type ShopeeOrder = {
  order_sn: string
  status: string
  date: string
  buyer: string
  total: number
  currency: string
  items: { name: string; variation: string; qty: number; price: number }[]
}

// Shopee allows at most a 15-day window per call, and pages with a cursor.
async function listOrderSns(shopId: number, token: string, from: string, to: string): Promise<string[]> {
  const sns: string[] = []
  for (let start = from; start <= to; start = addDays(start, 15)) {
    const end = addDays(start, 14) < to ? addDays(start, 14) : to
    let cursor = ''
    for (let guard = 0; guard < 50; guard++) {
      const body = await call(
        shopUrl('/api/v2/order/get_order_list', shopId, token, {
          time_range_field: 'create_time',
          time_from: String(Math.floor(new Date(`${start}T00:00:00+08:00`).getTime() / 1000)),
          time_to: String(Math.floor(new Date(`${end}T23:59:59+08:00`).getTime() / 1000)),
          page_size: '100',
          response_optional_fields: 'order_status',
          ...(cursor ? { cursor } : {}),
        }),
      )
      const r = body.response ?? {}
      for (const o of r.order_list ?? []) if (o?.order_sn) sns.push(String(o.order_sn))
      if (!r.more || !r.next_cursor) break
      cursor = String(r.next_cursor)
    }
  }
  return [...new Set(sns)]
}

async function orderDetails(shopId: number, token: string, sns: string[]): Promise<ShopeeOrder[]> {
  const out: ShopeeOrder[] = []
  for (let i = 0; i < sns.length; i += 50) {
    const body = await call(
      shopUrl('/api/v2/order/get_order_detail', shopId, token, {
        order_sn_list: sns.slice(i, i + 50).join(','),
        response_optional_fields: 'total_amount,currency,buyer_username,create_time,pay_time,order_status,item_list',
      }),
    )
    for (const o of body.response?.order_list ?? []) {
      const at = num(o.pay_time) || num(o.create_time)
      out.push({
        order_sn: String(o.order_sn),
        status: String(o.order_status || ''),
        // Shopee returns unix seconds; the shop reports in Malaysian time.
        date: new Date(at * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
        buyer: String(o.buyer_username || ''),
        total: num(o.total_amount),
        currency: String(o.currency || '').toUpperCase(),
        items: (o.item_list ?? []).map((it: any) => ({
          name: String(it.item_name || ''),
          variation: String(it.model_name || ''),
          qty: num(it.model_quantity_purchased),
          price: num(it.model_discounted_price) || num(it.model_original_price),
        })),
      })
    }
  }
  return out
}

// Net after Shopee's cut, best effort: the escrow endpoint is per order and
// rate-limited, so a failure here never fails the sync — the order still lands,
// just without meta.net.
async function escrowNet(shopId: number, token: string, sns: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const sn of sns) {
    try {
      const body = await call(shopUrl('/api/v2/payment/get_escrow_detail', shopId, token, { order_sn: sn }))
      const amount = num(body.response?.escrow_amount ?? body.response?.order_income?.escrow_amount)
      if (amount) out.set(sn, amount)
    } catch {
      return out // rate limited or not permitted — stop asking
    }
  }
  return out
}

// Same title/meta shape as scripts/import-shopee.mjs, so both sources agree.
function shortName(n: string): string {
  const clean = n.replace(/[\u{1D400}-\u{1D7FF}]+/gu, '').replace(/\bokmaya\b/gi, '').replace(/\s+/g, ' ').trim()
  if (clean.length <= 40) return clean
  const cut = clean.slice(0, 40)
  const space = cut.lastIndexOf(' ')
  return space > 20 ? cut.slice(0, space) : cut
}

function toRecord(o: ShopeeOrder, shop: { label: string; id: number; region: string }, net?: number) {
  const parts = o.items.map(i => `${i.qty}× ${shortName(i.name) || 'item'}${i.variation ? ` (${i.variation})` : ''}`)
  const label = parts.slice(0, 2).join(', ') + (parts.length > 2 ? ` +${parts.length - 2} more` : '')
  const qty = o.items.reduce((s, i) => s + i.qty, 0)
  return {
    title: `Shopee #${o.order_sn} — ${label}`,
    status: 'paid',
    amount: o.total,
    category: CATEGORY,
    due_date: o.date,
    notes: `${qty} item${qty === 1 ? '' : 's'} · buyer ${o.buyer || '—'} · Shopee: ${o.status}`,
    meta: {
      source: 'shopee_api',        // NOT 'shopee' — that is the xlsx import's rows
      shop: shop.label,
      shop_id: shop.id,
      shop_region: shop.region,    // 'MY' | 'SG' — which tab the row belongs to
      currency: o.currency,        // MYR / SGD — never summed across the two
      platform: 'Shopee',
      customer: o.buyer || undefined,
      shopee_order_id: o.order_sn,
      shopee_status: o.status,
      net: net ?? undefined,
      via: 'api',
      items: o.items.map(i => `${i.qty}× ${shortName(i.name)}${i.variation ? ` (${i.variation})` : ''} @ RM${i.price}`).join('; '),
      synced_at: new Date().toISOString(),
    },
  }
}

// ---- 5) The sync the cron and the Sync now button call. ----
export async function syncShopee(opts: { days?: number; dryRun?: boolean; region?: string } = {}) {
  if (!shopeeConfigured) return { skipped: 'SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY not set' as const }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured' as const }

  const all = await authorisedShops()
  // One shop at a time: each tab syncs only its own, so a request stays well
  // inside Vercel's 60s and one slow shop can't time out the other.
  const want = (opts.region || '').toUpperCase()
  const shops = want ? all.filter(s => (s.region || '').toUpperCase() === want) : all
  if (!all.length) return { skipped: 'no Shopee shop authorised yet — open /api/shopee/authorize once' as const }
  if (!shops.length) return { skipped: `no Shopee ${want} shop authorised yet — open /api/shopee/authorize while signed in to it` as const }

  const days = opts.days ?? ABANG.shopee.syncDays
  const from = daysAgoISO(days)
  const to = todayISO()

  let fetched = 0, inserted = 0, updated = 0, cancelled = 0, unchanged = 0
  const sample: string[] = []
  for (const shop of shops) {
    const region = (shop.region || '').toUpperCase()
    const label = `Shopee${region ? ` ${region}` : ''}`
    const stamp = { label, id: shop.shop_id, region }
    const sns = await listOrderSns(shop.shop_id, shop.access_token, from, to)
    const orders = (await orderDetails(shop.shop_id, shop.access_token, sns)).filter(o => {
      if (SKIP_STATUS.has(o.status)) { cancelled++; return false }
      return true
    })
    fetched += orders.length
    if (opts.dryRun) {
      for (const o of orders.slice(0, 10)) sample.push(`${o.date}  #${o.order_sn}  RM${o.total.toFixed(2)}  ${o.status}`)
      continue
    }

    const net = ABANG.shopee.fetchNet ? await escrowNet(shop.shop_id, shop.access_token, orders.map(o => o.order_sn)) : new Map()

    // Which of these orders is already on the Shopee MY tab? Only this
    // category is read or written — the cash_in rows are never touched.
    const { data, error } = await supabase
      .from('records')
      .select('id, amount, status, meta')
      .eq('category', CATEGORY)
      .gte('due_date', from)
      .limit(5000)
    if (error) throw new Error(`could not read existing Shopee rows: ${error.message}`)
    const existing = new Map<string, { id: number; amount: number; status: string }>()
    for (const r of data ?? []) {
      if (!r.meta?.shopee_order_id) continue
      existing.set(String(r.meta.shopee_order_id), { id: r.id, amount: num(r.amount), status: String(r.meta.shopee_status || '') })
    }

    const toInsert: any[] = []
    for (const o of orders) {
      const row = toRecord(o, stamp, net.get(o.order_sn))
      const was = existing.get(o.order_sn)
      if (!was) { toInsert.push(row); continue }
      // Nothing moved? Don't spend a write on it — a daily sync mostly re-reads
      // orders it already has, and one UPDATE each is what times the run out.
      if (was.status === o.status && Math.abs(was.amount - o.total) < 0.005) { unchanged++; continue }
      const { error } = await supabase.from('records').update(row).eq('id', was.id)
      if (error) throw new Error(`update order ${o.order_sn} failed: ${error.message}`)
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

// ---- 6) Read helpers for the Shopee MY tab. ----
export type ShopeeRow = { id: number; order_sn: string; date: string; buyer: string; items: string; amount: number; net?: number; status: string; currency: string }

// `region` is 'MY' | 'SG' — each tab asks only for its own shop's orders, so
// two currencies can never land in one total.
export function shopeeOrders(rows: Rec[], region: string): ShopeeRow[] {
  const want = region.toUpperCase()
  return rows
    .filter(r => r.category === CATEGORY && r.meta?.shopee_order_id && String(r.meta?.shop_region || '').toUpperCase() === want)
    .map(r => ({
      id: r.id,
      order_sn: String(r.meta.shopee_order_id),
      date: r.due_date || '',
      buyer: String(r.meta.customer || ''),
      items: String(r.meta.items || ''),
      amount: num(r.amount),
      net: r.meta.net ? num(r.meta.net) : undefined,
      status: String(r.meta.shopee_status || ''),
      currency: String(r.meta.currency || ''),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Totals for the last n days (ending today — Shopee orders land the same day).
export function shopeeTotals(orders: ShopeeRow[], n: number) {
  const from = daysAgoISO(n - 1)
  const w = orders.filter(o => o.date >= from)
  const revenue = w.reduce((s, o) => s + o.amount, 0)
  return { orders: w.length, revenue, avg: w.length ? revenue / w.length : 0 }
}

// Money, in the shop's own currency. Falls back to the plain code for anything
// we have not met, rather than pretending it is Ringgit.
const SYMBOL: Record<string, string> = { MYR: 'RM', SGD: 'S$', THB: '฿', IDR: 'Rp', PHP: '₱', VND: '₫', TWD: 'NT$', BRL: 'R$' }
export function money(n: number, currency: string): string {
  const s = SYMBOL[currency.toUpperCase()] || currency.toUpperCase() || ''
  return `${s} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
}

// The currency a tab should label its totals with: whatever its orders use.
export const currencyOf = (orders: ShopeeRow[], fallback: string) => orders.find(o => o.currency)?.currency || fallback

// Every shop authorised so far, for the "not linked yet" message on each tab.
export async function linkedRegions(): Promise<string[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('shopee_auth').select('region')
  return (data ?? []).map(r => String(r.region || '').toUpperCase()).filter(Boolean)
}

// ---- 7) Diagnosis, for when Shopee says no. ----
// Reports the shape of the credentials (never their value) and Shopee's raw
// answer to a signed public call, so a wrong key, a wrong partner id and a
// sandbox/live mix-up can be told apart.
export async function shopeeDiagnose() {
  const idRaw = process.env.SHOPEE_PARTNER_ID ?? ''
  const keyRaw = process.env.SHOPEE_PARTNER_KEY ?? ''
  const shape = {
    host: HOST,
    partner_id: PARTNER_ID || null,
    partner_id_is_numeric: /^\d+$/.test(PARTNER_ID),
    partner_id_had_whitespace: idRaw !== idRaw.trim(),
    partner_key_length: PARTNER_KEY.length,          // a live key is 64 hex chars
    partner_key_is_hex: /^[0-9a-f]+$/i.test(PARTNER_KEY),
    partner_key_had_whitespace: keyRaw !== keyRaw.trim(),
  }
  if (!shopeeConfigured) return { ...shape, check: 'skipped — keys not set' }

  // A public, read-only call that only needs partner_id + key. If the pair is
  // good Shopee answers with the authorised shops; if not, it says why.
  const path = '/api/v2/public/get_shops_by_partner'
  const ts = Math.floor(Date.now() / 1000)
  const url = `${HOST}${path}?${new URLSearchParams({ partner_id: PARTNER_ID, timestamp: String(ts), sign: sign(path, ts), page_size: '10' })}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const body: any = await res.json().catch(() => ({}))
    return {
      ...shape,
      check: {
        status: res.status,
        error: body?.error ?? null,
        message: body?.message ?? null,
        request_id: body?.request_id ?? null,
        shops: Array.isArray(body?.response?.authed_shop_list) ? body.response.authed_shop_list.length : undefined,
      },
    }
  } catch (e) {
    return { ...shape, check: { error: 'request failed', message: String((e as Error)?.message || e) } }
  }
}
