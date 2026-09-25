import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { ITEM_COLORS } from '@/lib/item-colors'
import { writeProductionSheet, productionSheetConfigured, applyToGrid, EDITABLE } from '@/lib/production-sheet'

// The Production Timeline's buttons: mark an item done (or undo), move it to
// another date, or add a new one. POST { action, … } → plain JSON.
//
// Serves the three Work calendars (Production, Social Calendar, Events / Others)
// and the Social Calendar's content ideas. Only ever touches rows in those
// categories (EDITABLE), and only the one row it is given by id — never a
// blanket update (CLAUDE.md). Nothing is deleted: a dropped idea is status
// 'dropped'. Gated by the
// APP_PASSCODE cookie like every tab (proxy.ts does not exclude it).
//
// After every save the "App updates" tab of the team's Google Sheet is
// rewritten (lib/production-sheet.ts). A sheet failure never undoes the save —
// the answer just says the sheet wasn't updated.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // a change is saved, then written into the sheet

const ISO = /^\d{4}-\d{2}-\d{2}$/
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')

  const PAGES: Record<string, string> = { production: '/production', social_plan: '/social-calendar', events_other: '/events-others', content_idea: '/social-calendar' }
  const refresh = () => Object.values(PAGES).forEach(p => revalidatePath(p))
  const CALENDARS = ['production', 'social_plan', 'events_other']

  // A content idea: no date yet. Lives on the Social Calendar until scheduled.
  if (action === 'idea_add') {
    const title = String(body?.title || '').trim().slice(0, 300)
    const notes = String(body?.notes || '').trim().slice(0, 1000)
    if (!title) return bad('Write the idea first.')
    const { error } = await supabase.from('records').insert({
      title,
      status: 'idea',
      amount: 0,
      category: 'content_idea',
      notes: notes || null,
      meta: { source: 'app', created_at: new Date().toISOString() },
    })
    if (error) return bad(`Couldn't save: ${error.message}`)
    refresh()
    return NextResponse.json({ ok: true, message: `Idea saved.${await sheetNote()}` })
  }

  if (action === 'add') {
    const title = String(body?.title || '').trim().slice(0, 200)
    const date = String(body?.date || '')
    const category = CALENDARS.includes(String(body?.category)) ? String(body.category) : 'production'
    if (!title) return bad('Give the task a name.')
    if (!ISO.test(date)) return bad('Pick a date.')
    const meta = { source: 'app', month: date.slice(0, 7), created_at: new Date().toISOString() }
    const { data: made, error } = await supabase.from('records').insert({
      title,
      status: 'planned',
      amount: 0,
      category,
      due_date: date,
      notes: 'Added in the app',
      meta,
    }).select('id').single()
    if (error) return bad(`Couldn't save: ${error.message}`)
    const grid = await gridNote({ action: 'add', category, title, date }, made?.id, meta)
    refresh()
    return NextResponse.json({ ok: true, message: `Added.${grid}${await sheetNote()}` })
  }

  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0) return bad('Which item?')
  const { data: row, error: readErr } = await supabase
    .from('records')
    .select('id, title, notes, status, due_date, category, meta')
    .eq('id', id)
    .in('category', Object.keys(EDITABLE))
    .maybeSingle()
  if (readErr) return bad(`Couldn't read the item: ${readErr.message}`)
  if (!row) return bad('That item is not on the timeline any more.')
  const meta = row.meta || {}
  const now = new Date().toISOString()

  // Delete: take it off the sheet's month calendar, then hide it in the app as
  // '<category>_deleted' (one row, by id). Kept, not erased, so Sync now knows
  // never to bring it back from the sheet.
  if (action === 'delete') {
    const title = String((row as any).title || '')
    const grid = row.category !== 'content_idea' && row.due_date
      ? await gridNote({ action: 'delete', category: row.category, title, date: row.due_date }, null, meta)
      : ''
    const { error } = await supabase.from('records')
      .update({ category: `${row.category}_deleted`, meta: { ...meta, deleted_at: now } })
      .eq('id', id).eq('category', row.category)
    if (error) return bad(`Couldn't delete: ${error.message}`)
    refresh()
    return NextResponse.json({ ok: true, message: `Deleted.${grid}${await sheetNote()}` })
  }

  let patch: Record<string, unknown>
  if (action === 'idea_schedule') {
    // Idea → a dated post on the Social Calendar.
    const date = String(body?.date || '')
    if (row.category !== 'content_idea') return bad('That is not an idea.')
    if (!ISO.test(date)) return bad('Pick a date to post it.')
    patch = { category: 'social_plan', status: 'planned', due_date: date, meta: { ...meta, month: date.slice(0, 7), scheduled_at: now } }
  } else if (action === 'idea_drop' || action === 'idea_restore') {
    if (row.category !== 'content_idea') return bad('That is not an idea.')
    patch = { status: action === 'idea_drop' ? 'dropped' : 'idea' }
  } else if (action === 'edit') {
    // New wording for the item (and, for social posts, its [channels] tag).
    const title = String(body?.title || '').trim().slice(0, 300)
    if (!title) return bad('The text can\'t be empty.')
    // Ideas also carry notes; only touched when the form sends them.
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 1000) : undefined
    const notesChanged = notes !== undefined && notes !== ((row as any).notes ?? '')
    if (title === (row as any).title && !notesChanged) return NextResponse.json({ ok: true, message: 'No change.' })
    const edits = Array.isArray(meta.edits) ? meta.edits : []
    patch = {
      title,
      ...(notesChanged ? { notes: notes || null } : {}),
      meta: { ...meta, edits: [...edits, { from: (row as any).title, at: now }] },
    }
  } else if (action === 'color') {
    // A colour for the item on the calendar; '' clears it. App-only — the sheet is untouched.
    const color = String(body?.color || '')
    if (color && !ITEM_COLORS.some(c => c.key === color)) return bad('Unknown colour.')
    const { color: _old, ...rest } = meta
    patch = { meta: color ? { ...meta, color } : rest }
  } else if (action === 'done') {
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

  const { error } = await supabase.from('records').update(patch).eq('id', id).eq('category', row.category)
  if (error) return bad(`Couldn't save: ${error.message}`)

  // The same change in the sheet's month calendar.
  const title = String((row as any).title || '')
  const newMeta = (patch.meta as Record<string, unknown>) ?? meta
  let grid = ''
  if (action === 'idea_schedule') grid = await gridNote({ action: 'add', category: 'social_plan', title, date: String(patch.due_date) }, id, newMeta)
  else if (action === 'move') grid = await gridNote({ action: 'move', category: row.category, title, date: String(patch.due_date), from: row.due_date }, id, newMeta)
  else if (action === 'edit' && row.category !== 'content_idea') grid = await gridNote({ action: 'edit', category: row.category, title: String(patch.title), date: row.due_date, oldTitle: title }, id, newMeta)
  else if (action === 'done' || action === 'undo') grid = await gridNote({ action, category: row.category, title, date: row.due_date }, null, newMeta)
  refresh()
  return NextResponse.json({ ok: true, message: action === 'color' ? 'Colour saved.' : `Saved.${grid}${await sheetNote()}` })
}

// Write the change into the month calendar; remember where it now sits
// (meta.sheet_key) so the next Sync now recognises it instead of adding it twice.
async function gridNote(
  change: Parameters<typeof applyToGrid>[0],
  id: number | null | undefined,
  meta: Record<string, unknown>,
): Promise<string> {
  const r = await applyToGrid(change)
  if (!r.message) return ''
  if (r.ok && r.sheetKey && id) {
    await supabase.from('records').update({ meta: { ...meta, sheet_key: r.sheetKey } }).eq('id', id)
  }
  return r.ok ? ` ✓ ${r.message}` : ` ⚠️ calendar: ${r.message}`
}

async function sheetNote(): Promise<string> {
  if (!productionSheetConfigured()) return ''
  const r = await writeProductionSheet()
  return r.ok ? ` ✓ ${r.message}` : ` ⚠️ ${r.message}`
}
