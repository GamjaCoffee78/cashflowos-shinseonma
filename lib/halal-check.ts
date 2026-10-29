import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { HALAL_PRODUCTS, type HalalProduct } from './halal'

// 🕌 The daily MYeHALAL check — reads the public halal directory (search
//    "Okmaya", Produk Makanan / Minuman) and compares each product's LATEST
//    expiry with what the Halal status tab holds.
//
// Owner's rule (2026-10-27):
//   • directory shows a LATER date  → it's renewed: save it, clear "renewal submitted"
//   • directory shows an EARLIER date, or the product is missing → flag it (red
//     on the tab, one line in Hui Yee's Today digest the day it first appears)
//   • the same date → nothing to do
//
// The directory has no API. The request shape (session cookie from index.php,
// then a form POST with category=PR / ty=PR) is the same one the open-source
// halal-crawler uses (github.com/afiqmazli29/halal-crawler). If JAKIM changes
// the page, the check fails loudly (Sync now shows the error, the tab says
// when it last worked) and nothing is changed — manual edits keep working.

const DATA_PARAM = 'ZGlyZWN0b3J5L2luZGV4X2RpcmVjdG9yeTs7Ozs=' // base64 of "directory/index_directory;;;;"
const SEARCH = 'Okmaya'
const BRAND = 'OKMAYA'
const BASES = ['https://myehalal.halal.gov.my/portal-halal/v1', 'https://www.halal.gov.my']
const MAX_PAGES = 5
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export type DirectoryRow = { name: string; brand: string; holder: string; expiry: string }
export type HalalCheckResult = { checked: number; inserted: number; updated: number; flagged: number; news: string[]; source: string }

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
const fmt = (iso: string) => iso.split('-').reverse().join('/')

const text = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const span = (row: string, cls: string) => {
  const m = new RegExp(`<span[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</span>`, 'i').exec(row)
  return m ? text(m[1]) : ''
}

// One results page → its rows. Each <tr> holds the product name, a JENAMA
// brand span, the certificate holder and an expiry cell (dd/mm/yyyy).
export function parseDirectory(html: string): DirectoryRow[] {
  const rows: DirectoryRow[] = []
  for (const tr of html.split(/<tr\b/i).slice(1)) {
    const name = span(tr, 'company-name')
    const dates = [...tr.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)]
    if (!name || !dates.length) continue
    const [, d, m, y] = dates[dates.length - 1]
    rows.push({
      name,
      brand: span(tr, 'company-brand').replace(/JENAMA\s*:/i, '').trim(),
      holder: span(tr, 'company-address'),
      expiry: `${y}-${m}-${d}`,
    })
  }
  return rows
}

const totalPages = (html: string) => Number(/Total Record[^<]*?From\s*(\d+)/i.exec(html)?.[1] || 1)

async function fetchFrom(base: string): Promise<DirectoryRow[]> {
  const timeout = () => AbortSignal.timeout(12_000)
  // Seed the PHP session — the search answers empty without its cookie.
  const home = await fetch(`${base}/index.php?data=${DATA_PARAM}`, { headers: { 'User-Agent': UA }, signal: timeout() })
  const cookie = home.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const rows: DirectoryRow[] = []
  for (let page = 1, pages = 1; page <= Math.min(pages, MAX_PAGES); page++) {
    const url = `${base}/index.php?data=${DATA_PARAM}&negeri=&category=PR&page=${page}&cari=${encodeURIComponent(SEARCH)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${base}/index.php`,
        Origin: new URL(base).origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: new URLSearchParams({ hdnCounter: '0', t: '', a: '', ty: 'PR' }),
      signal: timeout(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (page === 1) pages = totalPages(html)
    rows.push(...parseDirectory(html))
  }
  return rows.filter(r => norm(r.brand).includes(BRAND))
}

// Okmaya's rows from the first address that answers with any. Throws when none does.
export async function fetchDirectory(): Promise<{ rows: DirectoryRow[]; source: string }> {
  const errors: string[] = []
  for (const base of BASES) {
    try {
      const rows = await fetchFrom(base)
      if (rows.length) return { rows, source: new URL(base).host }
      errors.push(`${new URL(base).host}: no Okmaya products found (page layout may have changed)`)
    } catch (e) {
      errors.push(`${new URL(base).host}: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  }
  throw new Error(`MYeHALAL check failed — ${errors.join('; ')}`)
}

// The latest expiry the directory lists for a product (several certificates → the latest).
export function latestFor(product: HalalProduct, rows: DirectoryRow[]): string | null {
  const want = norm(product.directoryName)
  const hits = rows.filter(r => norm(r.name) === want)
  return hits.length ? hits.map(r => r.expiry).sort().at(-1)! : null
}

type HalalRow = { id: number; due_date: string | null; meta: Record<string, any> }

// Read a product's one row (category='halal', meta.key), or null before its first change.
export async function readHalalRow(key: string): Promise<HalalRow | null> {
  const { data, error } = await supabase
    .from('records')
    .select('id, due_date, meta')
    .eq('category', 'halal')
    .eq('meta->>key', key)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Couldn't read ${key}: ${error.message}`)
  return data as HalalRow | null
}

// Update that one row by id, or create it on the first change — never a blanket update (CLAUDE.md).
export async function writeHalalRow(product: HalalProduct, row: HalalRow | null, patch: { due_date: string; meta: Record<string, any> }) {
  const { error } = row
    ? await supabase.from('records').update(patch).eq('id', row.id).eq('category', 'halal')
    : await supabase.from('records').insert({ title: product.name, status: 'active', amount: 0, category: 'halal', notes: product.directoryName, ...patch })
  if (error) throw new Error(`Couldn't save ${product.name}: ${error.message}`)
}

export async function syncHalal(): Promise<HalalCheckResult | { skipped: string }> {
  if (!supabaseConfigured) return { skipped: 'the database is not connected' }
  const { rows, source } = await fetchDirectory()
  const now = new Date().toISOString()
  const result: HalalCheckResult = { checked: 0, inserted: 0, updated: 0, flagged: 0, news: [], source }

  for (const p of HALAL_PRODUCTS) {
    const row = await readHalalRow(p.key)
    const meta: Record<string, any> = row?.meta ?? { key: p.key, renewing: !!p.renewing, source: 'myehalal' }
    const current = row?.due_date ?? p.expiry
    // A pinned product shares its directory name with another product, so "the
    // latest" would be the other one's certificate. It only checks that its own
    // date is still listed; a renewal is entered by hand with 📅 New expiry.
    const latest = p.pinned
      ? (rows.some(r => norm(r.name) === norm(p.directoryName) && r.expiry === current) ? current : null)
      : latestFor(p, rows)

    let due = current
    let flag: string | null = null
    let renewing = !!meta.renewing
    const history = Array.isArray(meta.expiry_history) ? meta.expiry_history : []
    if (!latest) flag = p.pinned ? `MYeHALAL no longer lists the ${fmt(current)} certificate — renewed? enter the new expiry` : 'Not found in MYeHALAL'
    else if (latest > current) {
      due = latest
      renewing = false
      history.push({ from: current, at: now, source: 'myehalal' })
      result.updated++
      result.news.push(`✅ ${p.name} renewed — new expiry ${fmt(latest)}`)
    } else if (latest < current) flag = `MYeHALAL shows ${fmt(latest)}, earlier than the saved ${fmt(current)}`

    if (flag) {
      result.flagged++
      if (flag !== meta.flag) result.news.push(`⚠️ ${p.name}: ${flag}`)
    }
    const { flag: _old, ...rest } = meta
    await writeHalalRow(p, row, {
      due_date: due,
      meta: { ...rest, renewing, expiry_history: history, directory_expiry: latest, checked_at: now, ...(flag ? { flag } : {}) },
    })
    if (!row) result.inserted++
    result.checked++
  }
  return result
}

// The Today-digest lines for what the check just found ('' when nothing new).
export function halalCheckSection(r: HalalCheckResult | { skipped: string } | { error: string } | null | undefined): string {
  if (!r || !('news' in r) || !r.news.length) return ''
  return `<b>🕌 MYeHALAL check</b>\n${r.news.join('\n')}\n\n`
}
