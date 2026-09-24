import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { writeProductionSheet, productionSheetConfigured } from '@/lib/production-sheet'

// The Production Timeline's buttons: mark an item done (or undo), move it to
// another date, or add a new one. POST { action, … } → plain JSON.
//
// Only ever touches rows with category='production', and only the one row it
// is given by id — never a blanket update (CLAUDE.md). Gated by the
// APP_PASSCODE cookie like every tab (proxy.ts does not exclude it).
//
// After every save the "App updates" tab of the team's Google Sheet is
// rewritten (lib/production-sheet.ts). A sheet failure never undoes the save —
// the answer just says the sheet wasn't updated.

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')

  if (action === 'add') {
    const title = String(body?.title || '').trim().slice(0, 200)
    const date = String(body?.date || '')
    if (!title) return bad('Give the task a name.')
    if (!ISO.test(date)) return bad('Pick a date.')
    const { error } = await supabase.from('records').insert({
      title,
      status: 'planned',
      amount: 0,
      category: 'production',
      due_date: date,
      notes: 'Added in the app',
      meta: { source: 'app', month: date.slice(0, 7), created_at: new Date().toISOString() },
    })
    if (error) return bad(`Couldn't save: ${error.message}`)
    revalidatePath('/production')
    return NextResponse.json({ ok: true, message: `Added.${await sheetNote()}` })
  }

  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return bad('Which item?')
  const { data: row, error: readErr } = await supabase
    .from('records')
    .select('id, status, due_date, meta')
    .eq('id', id)
    .eq('category', 'production')
    .maybeSingle()
  if (readErr) return bad(`Couldn't read the item: ${readErr.message}`)
  if (!row) return bad('That item is not on the timeline any more.')
  const meta = row.meta || {}
  const now = new Date().toISOString()

  let patch: Record<string, unknown>
  if (action === 'done') {
    patch = { status: 'done', meta: { ...meta, done_at: now } }
  } else if (action === 'undo') {
    const { done_at, ...rest } = meta
    patch = { status: 'planned', meta: rest }
  } else if (action === 'move') {
    const date = String(body?.date || '')
    if (!ISO.test(date)) return bad('Pick a new date.')
    if (date === row.due_date) return NextResponse.json({ ok: true, message: 'Same date — nothing changed.' })
    const history = Array.isArray(meta.moved_from) ? meta.moved_from : []
    patch = {
      due_date: date,
      meta: { ...meta, month: date.slice(0, 7), moved_from: [...history, { date: row.due_date, at: now }] },
    }
  } else {
    return bad('Unknown action.')
  }

  const { error } = await supabase.from('records').update(patch).eq('id', id).eq('category', 'production')
  if (error) return bad(`Couldn't save: ${error.message}`)
  revalidatePath('/production')
  return NextResponse.json({ ok: true, message: `Saved.${await sheetNote()}` })
}

async function sheetNote(): Promise<string> {
  if (!productionSheetConfigured()) return ''
  const r = await writeProductionSheet()
  return r.ok ? ` ✓ ${r.message}` : ` ⚠️ ${r.message}`
}
