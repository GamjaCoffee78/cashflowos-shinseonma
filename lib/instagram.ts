import { ABANG } from '@/abang/config'
import { supabase, supabaseConfigured } from './supabase'

// Instagram → the Content tab. One `content` row per post, keyed on meta.ig_id
// (the same key the original import wrote), so a sync refreshes the figures
// of a post already there and adds only posts it hasn't seen. The title is
// set once and never overwritten — a hand-edited title survives.
//
// Goes through Composio's proxy to graph.instagram.com (the token never
// leaves Composio). Accounts and ids: abang/config.ts → instagram.

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')
const GRAPH = 'https://graph.instagram.com/v21.0'
const FIELDS = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count'
const METRICS = 'views,reach,saved,shares'

type Account = { username: string; composioAccount: string }
export const instagramConfigured = !!process.env.COMPOSIO_API_KEY?.trim()

// The configured connection id, or — when it's left empty — the Instagram
// connection in this Composio project whose /me is that username. Saves the
// owner digging a ca_… id out of the dashboard.
async function resolveAccounts(): Promise<Account[]> {
  const key = process.env.COMPOSIO_API_KEY!.trim()
  const out: Account[] = []
  let candidates: string[] | null = null
  for (const a of ABANG.instagram.accounts) {
    if (a.composioAccount.trim()) { out.push(a); continue }
    if (!candidates) {
      const res = await fetch(`${COMPOSIO_URL}/api/v3/connected_accounts?toolkit_slugs=instagram&statuses=ACTIVE&limit=50`, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(15_000),
      })
      const body: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`Composio wouldn't list the Instagram connections: ${String(body?.error?.message || res.status).slice(0, 160)}`)
      candidates = (body.items ?? []).map((c: any) => String(c.id)).filter(Boolean)
    }
    for (const id of candidates ?? []) {
      const me = await igGet({ username: a.username, composioAccount: id }, '/me', { fields: 'username' }).catch(() => null)
      if (String(me?.username ?? '').toLowerCase() === a.username.toLowerCase()) { out.push({ ...a, composioAccount: id }); break }
    }
  }
  return out
}

async function igGet(account: Account, path: string, q: Record<string, string>): Promise<any> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected_account_id: account.composioAccount,
      method: 'GET',
      endpoint: `${GRAPH}${path}`,
      parameters: Object.entries(q).map(([name, value]) => ({ name, value, type: 'query' })),
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body: any = await res.json().catch(() => ({}))
  const ig = body?.data
  if (!res.ok || body?.error || ig?.error) {
    const msg = ig?.error?.message || body?.error?.message || `HTTP ${res.status}`
    throw new Error(`Composio/Instagram (@${account.username}) said no: ${String(msg).slice(0, 200)}`)
  }
  return ig ?? {}
}

// Posts newer than `since` (ISO), newest first — pages until it passes `since`.
async function recentMedia(account: Account, since: string): Promise<any[]> {
  const out: any[] = []
  let after = ''
  for (let page = 0; page < 10; page++) {
    const body = await igGet(account, '/me/media', { fields: FIELDS, limit: '50', ...(after ? { after } : {}) })
    const rows: any[] = body.data ?? []
    for (const r of rows) if (String(r.timestamp) >= since) out.push(r)
    after = body.paging?.cursors?.after ?? ''
    if (!rows.length || !after || String(rows.at(-1)?.timestamp) < since) break
  }
  return out
}

// saved/shares/reach/views — a post whose insights Instagram refuses keeps the rest.
async function insights(account: Account, id: string): Promise<Record<string, number>> {
  try {
    const body = await igGet(account, `/${id}/insights`, { metric: METRICS })
    const out: Record<string, number> = {}
    for (const m of body.data ?? []) {
      const v = m.values?.[0]?.value ?? m.total_value?.value
      if (m.name && Number.isFinite(Number(v))) out[m.name] = Number(v)
    }
    return out
  } catch {
    return {}
  }
}

const formatOf = (r: any) =>
  r.media_product_type === 'REELS' ? 'reel' : r.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : r.media_type === 'VIDEO' ? 'video' : 'post'

// Post date in Malaysia time, like every other date in the app.
const myDate = (ts: string) => new Date(Date.parse(ts.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) + 8 * 3_600_000).toISOString().slice(0, 10)

const titleOf = (caption: string | undefined) => {
  const line = String(caption ?? '').split('\n').map(s => s.trim()).find(Boolean) ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line || 'Instagram post'
}

export async function syncInstagram() {
  if (!process.env.COMPOSIO_API_KEY?.trim()) return { skipped: 'COMPOSIO_API_KEY not set' as const }
  if (!supabaseConfigured) return { skipped: 'the database is not connected' as const }

  const since = new Date(Date.now() - ABANG.instagram.syncDays * 86_400_000).toISOString()
  const result = { from: since.slice(0, 10), to: new Date().toISOString().slice(0, 10), inserted: 0, updated: 0 }
  const now = new Date().toISOString()

  const accounts = await resolveAccounts()
  if (!accounts.length) throw new Error(`no Instagram connection for @${ABANG.instagram.accounts.map(a => a.username).join(', @')} in the app's Composio project — connect it there first`)
  for (const account of accounts) {
    const media = await recentMedia(account, since)
    // A few at a time — one insights call per post.
    for (let i = 0; i < media.length; i += 5) {
      await Promise.all(media.slice(i, i + 5).map(async r => {
        const id = String(r.id)
        const { data: existing, error } = await supabase
          .from('records').select('id, meta').eq('category', 'content').eq('meta->>ig_id', id).limit(1).maybeSingle()
        if (error) throw new Error(`Couldn't read post ${id}: ${error.message}`)
        const figures = {
          likes: Number(r.like_count ?? 0) || 0,
          comments: Number(r.comments_count ?? 0) || 0,
          ...(await insights(account, id)),
        }
        const fresh = {
          platform: 'instagram',
          format: formatOf(r),
          ig_id: id,
          permalink: r.permalink,
          ...(r.thumbnail_url || r.media_url ? { thumbnail_url: r.thumbnail_url || r.media_url } : {}),
          ...figures,
          synced_at: now,
        }
        if (existing) {
          const { error: e } = await supabase.from('records').update({ meta: { ...existing.meta, ...fresh } }).eq('id', existing.id)
          if (e) throw new Error(`Couldn't refresh post ${id}: ${e.message}`)
          result.updated++
        } else {
          const { error: e } = await supabase.from('records').insert({
            category: 'content',
            title: titleOf(r.caption),
            status: 'posted',
            amount: 0,
            due_date: myDate(String(r.timestamp)),
            notes: r.caption ?? null,
            meta: { ...fresh, account: account.username, source: 'instagram_sync' },
          })
          if (e) throw new Error(`Couldn't add post ${id}: ${e.message}`)
          result.inserted++
        }
      }))
    }
  }
  return result
}
