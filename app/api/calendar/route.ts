import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { ABANG } from '@/abang/config'
import { CATEGORY, PEOPLE } from '@/lib/calendar'

// The Calendar tab's writes. The app READS Google Calendar but never writes to
// it: everything done here is saved in the app only (the `event` rows).
//   create — a new app event (meta.source 'app'; the sync never touches it)
//   update — change an event; a Google event changed here is marked app_edited,
//            so the next sync keeps the app's version instead of overwriting it
//   delete — hides the event (status 'cancelled' + app_deleted); never erased
// Gated by the login cookie like every page (proxy.ts).

export const dynamic = 'force-dynamic'

const TZ = '+08:00'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HM = /^\d{2}:\d{2}$/
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })
const s = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Form fields → the event fields stored in the row (same shape the sync writes).
function fields(b: any) {
  const title = s(b?.title, 300)
  if (!title) return 'Give the event a title.'
  const date = s(b?.date)
  if (!ISO.test(date)) return 'Pick a date.'
  const endDate = ISO.test(s(b?.endDate)) ? s(b?.endDate) : date
  if (endDate < date) return 'The end date must be on or after the start.'
  const leave = b?.kind === 'leave'
  const allDay = !!b?.allDay || leave
  let start: string, end: string
  if (allDay) {
    start = date
    end = nextDay(endDate)                 // exclusive, like Google's all-day end
  } else {
    const st = s(b?.start), en = s(b?.end)
    if (!HM.test(st) || !HM.test(en)) return 'Pick a start and end time.'
    if (`${endDate}T${en}` <= `${date}T${st}`) return 'The end must be after the start.'
    start = `${date}T${st}:00${TZ}`
    end = `${endDate}T${en}:00${TZ}`
  }
  const person = PEOPLE.find(p => p.name === s(b?.calendar)) ?? PEOPLE.find(p => p.calendarId === ABANG.calendar.calendarId) ?? PEOPLE[0]
  const invite: string[] = Array.isArray(b?.invite) ? b.invite : []
  const owners = [person.name, ...PEOPLE.filter(p => !leave && invite.includes(p.name) && p.name !== person.name).map(p => p.name)]
  const location = leave ? '' : s(b?.location, 300)
  const description = s(b?.description, 2000)
  return {
    title,
    due_date: date,
    notes: [location, description].filter(Boolean).join(' · ').slice(0, 300) || null,
    meta: {
      start, end, all_day: allDay,
      owners,
      cal_of: person.calendarId,
      kind: leave ? 'leave' : undefined,
      location: location || undefined,
      description: description || undefined,
    },
  }
}

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = s(body?.action)
  const now = new Date().toISOString()

  if (action === 'create') {
    const f = fields(body)
    if (typeof f === 'string') return bad(f)
    const id = `app-${randomUUID()}`
    const { error } = await supabase.from('records').insert({
      title: f.title, status: 'confirmed', amount: 0, category: CATEGORY, due_date: f.due_date, notes: f.notes,
      meta: { ...f.meta, source: 'app', gcal_id: id, gcal_uid: id, created_at: now },
    })
    if (error) return bad(`Couldn't save: ${error.message}`)
    revalidatePath('/calendar')
    return NextResponse.json({ ok: true, message: 'Added.' })
  }

  const id = Number(body?.id)
  const { data: row } = await supabase.from('records').select('id, meta').eq('id', id).eq('category', CATEGORY).maybeSingle()
  if (!row) return bad('That event is not in the app any more — refresh the page.')
  const fromGoogle = row.meta?.source !== 'app'

  if (action === 'update') {
    const f = fields(body)
    if (typeof f === 'string') return bad(f)
    const meta = {
      ...row.meta, ...f.meta,
      // Guests outside the team (from Google) stay listed.
      attendees: row.meta?.attendees,
      ...(fromGoogle ? { app_edited: now } : {}),
      edited_at: now,
    }
    const { error } = await supabase.from('records')
      .update({ title: f.title, due_date: f.due_date, notes: f.notes, meta })
      .eq('id', id).eq('category', CATEGORY)
    if (error) return bad(`Couldn't save: ${error.message}`)
    revalidatePath('/calendar')
    return NextResponse.json({ ok: true, message: fromGoogle ? 'Saved in the app (Google Calendar is unchanged).' : 'Saved.' })
  }

  if (action === 'delete') {
    const { error } = await supabase.from('records')
      .update({ status: 'cancelled', meta: { ...row.meta, app_deleted: now } })
      .eq('id', id).eq('category', CATEGORY)
    if (error) return bad(`Couldn't delete: ${error.message}`)
    revalidatePath('/calendar')
    return NextResponse.json({ ok: true, message: fromGoogle ? 'Removed from the app (Google Calendar is unchanged).' : 'Deleted.' })
  }

  return bad('Unknown action.')
}
