import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { HALAL_PRODUCTS } from '@/lib/halal'

// The Halal status tab's buttons. POST { action, key, … } → plain JSON.
//   expiry   { date }    — a renewed certificate's new expiry (also clears "renewal in progress")
//   renewing { on }      — mark / unmark "renewal in progress"
// One row per product (category='halal', meta.key). The first change creates
// it; after that only that one row is updated — never a blanket update
// (CLAUDE.md). Gated by the APP_PASSCODE cookie like every tab.

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const product = HALAL_PRODUCTS.find(p => p.key === String(body?.key || ''))
  if (!product) return bad('Which product?')

  const { data: row, error: readErr } = await supabase
    .from('records')
    .select('id, due_date, meta')
    .eq('category', 'halal')
    .eq('meta->>key', product.key)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (readErr) return bad(`Couldn't read the product: ${readErr.message}`)

  const now = new Date().toISOString()
  const meta: Record<string, any> = row?.meta ?? { key: product.key, renewing: !!product.renewing, source: 'app' }
  const expiry = row?.due_date ?? product.expiry
  let patch: { due_date: string; meta: Record<string, any> }
  let message: string

  if (action === 'expiry') {
    const date = String(body?.date || '')
    if (!ISO.test(date)) return bad('Pick the new expiry date.')
    if (date === expiry) return NextResponse.json({ ok: true, message: 'Same date — nothing changed.' })
    const history = Array.isArray(meta.expiry_history) ? meta.expiry_history : []
    patch = { due_date: date, meta: { ...meta, renewing: false, expiry_history: [...history, { from: expiry, at: now }] } }
    message = 'New expiry saved.'
  } else if (action === 'renewing') {
    const on = !!body?.on
    patch = { due_date: expiry, meta: { ...meta, renewing: on, ...(on ? { renewing_since: now } : {}) } }
    message = on ? 'Marked renewal in progress.' : 'Renewal mark cleared.'
  } else {
    return bad('Unknown action.')
  }

  const { error } = row
    ? await supabase.from('records').update(patch).eq('id', row.id).eq('category', 'halal')
    : await supabase.from('records').insert({ title: product.name, status: 'active', amount: 0, category: 'halal', notes: product.directoryName, ...patch })
  if (error) return bad(`Couldn't save: ${error.message}`)
  revalidatePath('/halal-status')
  return NextResponse.json({ ok: true, message })
}
