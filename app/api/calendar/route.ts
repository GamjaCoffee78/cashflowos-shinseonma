import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { ABANG } from '@/abang/config'
import { CATEGORY, PEOPLE, calendarConfigured, eventRowFromGoogle, gcalWrite } from '@/lib/calendar'

// The Calendar tab's writes — they go to the real Google Calendar first, then
// the one matching `event` row is saved so the tab shows the change at once.
//   create — new event on a person's calendar, teammates invited
//   update — change title / time / place / notes / invitees (also drag-to-move)
//   delete — remove it from Google; the row is marked 'cancelled' (never deleted)
// Gated by the login cookie like every page (proxy.ts).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

// Form fields → a Google event body.
function googleBody(b: any, organizerCal: string): object | string {
  const title = s(b?.title, 300)
  if (!title) return 'Give the event a title.'
  const date = s(b?.date)
  if (!ISO.test(date)) return 'Pick a date.'
  const endDate = ISO.test(s(b?.endDate)) ? s(b?.endDate) : date
  const allDay = !!b?.allDay || b?.kind === 'leave'
  let start: object, end: object
  if (allDay) {
    start = { date }
    end = { date: nextDay(endDate) }   // Google's all-day end is exclusive
  } else {
    const st = s(b?.start), en = s(b?.end)
    if (!HM.test(st) || !HM.test(en)) return 'Pick a start and end time.'
    if (`${endDate}T${en}` <= `${date}T${st}`) return 'The end must be after the start.'
    start = { dateTime: `${date}T${st}:00${TZ}`, timeZone: 'Asia/Kuala_Lumpur' }
    end = { dateTime: `${endDate}T${en}:00${TZ}`, timeZone: 'Asia/Kuala_Lumpur' }
  }
  const invite: string[] = Array.isArray(b?.invite) ? b.invite : []
  const attendees = PEOPLE
    .filter(p => invite.includes(p.name) && p.calendarId.toLowerCase() !== organizerCal.toLowerCase())
    .map(p => ({ email: p.calendarId }))
  const leave = b?.kind === 'leave'
  return {
    summary: title,
    extendedProperties: { private: { okmayaKind: leave ? 'leave' : '' } },
    ...(leave ? { transparency: 'opaque' } : {}),
    location: s(b?.location, 300),
    description: s(b?.description, 2000),
    start, end,
    attendees,
  }
}

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  if (!calendarConfigured) return bad('Google Calendar is not connected (COMPOSIO_API_KEY).')
  const body = await req.json().catch(() => ({}))
  const action = s(body?.action)

  try {
    if (action === 'create') {
      const person = PEOPLE.find(p => p.name === s(body?.calendar)) ?? PEOPLE.find(p => p.calendarId === ABANG.calendar.calendarId) ?? PEOPLE[0]
      const g = googleBody(body, person.calendarId)
      if (typeof g === 'string') return bad(g)
      const made = await gcalWrite('POST', person.calendarId, '', g)
      const { error } = await supabase.from('records').insert(eventRowFromGoogle(made, person.calendarId))
      if (error) return bad(`Added to Google, but the app couldn't save it: ${error.message}. Press Sync now.`)
      revalidatePath('/calendar')
      return NextResponse.json({ ok: true, message: `Added to ${person.name}'s calendar.` })
    }

    const id = Number(body?.id)
    const { data: row } = await supabase.from('records').select('id, meta').eq('id', id).eq('category', CATEGORY).maybeSingle()
    if (!row?.meta?.gcal_id) return bad('That event is not in the app any more — press Sync now.')
    const calOf = String(row.meta.cal_of || row.meta.calendar_id || ABANG.calendar.calendarId)

    if (action === 'update') {
      const g: any = googleBody(body, calOf)
      if (typeof g === 'string') return bad(g)
      // Keep guests from outside the team — the form only lists teammates.
      const team = PEOPLE.map(p => p.calendarId.toLowerCase())
      const outside = ((row.meta.attendees ?? []) as string[]).filter(e => !team.includes(String(e).toLowerCase()))
      g.attendees = [...g.attendees, ...outside.map(email => ({ email }))]
      const saved = await gcalWrite('PATCH', calOf, String(row.meta.gcal_id), g)
      const { error } = await supabase.from('records').update(eventRowFromGoogle(saved, calOf)).eq('id', id).eq('category', CATEGORY)
      if (error) return bad(`Changed in Google, but the app couldn't save it: ${error.message}. Press Sync now.`)
      revalidatePath('/calendar')
      return NextResponse.json({ ok: true, message: 'Saved.' })
    }

    if (action === 'delete') {
      await gcalWrite('DELETE', calOf, String(row.meta.gcal_id))
      await supabase.from('records').update({ status: 'cancelled' }).eq('id', id).eq('category', CATEGORY)
      revalidatePath('/calendar')
      return NextResponse.json({ ok: true, message: 'Deleted.' })
    }
  } catch (e) {
    return bad(String((e as Error)?.message || e).slice(0, 400))
  }
  return bad('Unknown action.')
}
