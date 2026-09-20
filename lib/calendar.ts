import { supabase, supabaseConfigured } from './supabase'
import { todayISO, BUSINESS_TZ, type Rec } from './records'
import { ABANG } from '@/abang/config'
import { daysAgoISO, addDays } from './ads-daily'

// Google Calendar → the ONE `records` table, one 'event' row per calendar event.
//
// The daily cron calls syncCalendar(): it reads the events between
// today − pastDays and today + futureDays from Google (through Composio's
// proxy, where the Google account is linked) and upserts them, keyed on the
// Google event id in meta. Events that vanished from Google inside that window
// are marked status 'cancelled' — never deleted (see CLAUDE.md).
//
// READ-ONLY: nothing here writes to Google Calendar.
// Secrets: COMPOSIO_API_KEY only (server-only). Ids live in abang/config.ts.

export const CATEGORY = 'event'
export const calendarConfigured = !!process.env.COMPOSIO_API_KEY?.trim()

const COMPOSIO_URL = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev').replace(/\/+$/, '')

export type CalEvent = {
  id: string            // Google event id
  title: string
  date: string          // YYYY-MM-DD of the start, in the business timezone
  start: string         // ISO datetime, or YYYY-MM-DD for all-day
  end: string
  allDay: boolean
  location: string
  description: string
  link: string
  status: 'confirmed' | 'tentative' | 'cancelled'
}

// "2026-09-21T15:00:00+08:00" → "2026-09-21" in the business timezone.
const dateInTz = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

// ---- 1) Ask Google (via Composio) for the events in a window. ----
export async function fetchCalendarEvents(fromDate: string, toDate: string): Promise<CalEvent[]> {
  const key = process.env.COMPOSIO_API_KEY?.trim()
  if (!key) throw new Error('COMPOSIO_API_KEY is not set')
  const { calendarId, composioAccount } = ABANG.calendar

  const out: CalEvent[] = []
  let pageToken = ''
  for (let guard = 0; guard < 10; guard++) {
    const q: Record<string, string> = {
      timeMin: `${fromDate}T00:00:00+08:00`,
      timeMax: `${addDays(toDate, 1)}T00:00:00+08:00`,
      singleEvents: 'true',      // expand recurring events into instances
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: '2500',
      timeZone: BUSINESS_TZ,
    }
    if (pageToken) q.pageToken = pageToken
    const res = await fetch(`${COMPOSIO_URL}/api/v3/tools/execute/proxy`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected_account_id: composioAccount,
        method: 'GET',
        endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        parameters: Object.entries(q).map(([name, value]) => ({ name, value, type: 'query' })),
      }),
      signal: AbortSignal.timeout(25_000),
    })
    const body: any = await res.json().catch(() => ({}))
    const g = body?.data
    if (!res.ok || body?.error || g?.error) {
      const msg = body?.error?.message || g?.error?.message || `HTTP ${res.status}`
      throw new Error(`Composio/Google said no: ${String(msg).slice(0, 200)}`)
    }
    for (const e of g?.items ?? []) {
      if (!e?.id || e.status === 'cancelled') continue
      const allDay = !!e.start?.date
      const start = allDay ? e.start.date : e.start?.dateTime
      const end = allDay ? e.end?.date : e.end?.dateTime
      if (!start) continue
      out.push({
        id: String(e.id),
        title: String(e.summary || '(no title)').trim(),
        date: allDay ? start : dateInTz(start),
        start,
        end: end || start,
        allDay,
        location: String(e.location || '').trim(),
        description: String(e.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
        link: String(e.htmlLink || ''),
        status: e.status === 'tentative' ? 'tentative' : 'confirmed',
      })
    }
    pageToken = g?.nextPageToken || ''
    if (!pageToken) break
  }
  return out
}

// ---- 2) Upsert into `records`, keyed on the Google event id. ----
export async function syncCalendar(opts: { dryRun?: boolean } = {}) {
  if (!calendarConfigured) return { skipped: 'COMPOSIO_API_KEY not set' as const }
  if (!supabaseConfigured && !opts.dryRun) return { skipped: 'Supabase not configured' as const }

  const from = daysAgoISO(ABANG.calendar.pastDays)
  const to = addDays(todayISO(), ABANG.calendar.futureDays)
  const fetched = await fetchCalendarEvents(from, to)
  if (opts.dryRun) return { from, to, fetched: fetched.length, inserted: 0, updated: 0, cancelled: 0, rows: fetched }

  // Existing event rows inside the window (by due_date), keyed on the Google id.
  const { data: existingRows, error } = await supabase
    .from('records')
    .select('id, due_date, status, meta')
    .eq('category', CATEGORY)
    .gte('due_date', from)
    .lte('due_date', to)
    .limit(5000)
  if (error) throw new Error(`could not read event rows: ${error.message}`)
  const existing = new Map<string, { id: number; status: string }>()
  for (const r of existingRows ?? []) {
    const gid = r.meta?.gcal_id
    if (gid) existing.set(String(gid), { id: r.id, status: r.status })
  }

  let inserted = 0, updated = 0, cancelled = 0
  const toInsert: any[] = []
  const seen = new Set<string>()
  for (const e of fetched) {
    seen.add(e.id)
    const row = {
      title: e.title,
      status: e.status,
      amount: 0,
      category: CATEGORY,
      due_date: e.date,
      notes: [e.location, e.description].filter(Boolean).join(' · ').slice(0, 300) || null,
      meta: {
        source: 'google_calendar',
        calendar_id: ABANG.calendar.calendarId,
        gcal_id: e.id,
        start: e.start,
        end: e.end,
        all_day: e.allDay,
        location: e.location || undefined,
        link: e.link || undefined,
        synced_at: new Date().toISOString(),
      },
    }
    const ex = existing.get(e.id)
    if (ex) {
      const { error } = await supabase.from('records').update(row).eq('id', ex.id)
      if (error) throw new Error(`update ${e.id} failed: ${error.message}`)
      updated++
    } else toInsert.push(row)
  }
  if (toInsert.length) {
    const { error } = await supabase.from('records').insert(toInsert)
    if (error) throw new Error(`insert failed: ${error.message}`)
    inserted = toInsert.length
  }
  // Gone from Google inside the window → mark cancelled (soft; never delete).
  for (const [gid, ex] of existing) {
    if (seen.has(gid) || ex.status === 'cancelled') continue
    const { error } = await supabase.from('records').update({ status: 'cancelled' }).eq('id', ex.id)
    if (!error) cancelled++
  }
  return { from, to, fetched: fetched.length, inserted, updated, cancelled }
}

// ---- 3) Read helpers for the tab + the brief (pure, from records). ----
export function calendarEvents(rows: Rec[]): CalEvent[] {
  return rows
    .filter(r => r.category === CATEGORY && r.due_date && r.meta?.gcal_id)
    .map(r => ({
      id: String(r.meta.gcal_id),
      title: r.title,
      date: r.due_date as string,
      start: String(r.meta.start || r.due_date),
      end: String(r.meta.end || r.meta.start || r.due_date),
      allDay: !!r.meta.all_day,
      location: String(r.meta.location || ''),
      description: '',
      link: String(r.meta.link || ''),
      status: (r.status as CalEvent['status']) || 'confirmed',
    }))
    .filter(e => e.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start))
}

// "3:00pm" in the business timezone; "All day" for date-only starts.
export function timeLabel(e: CalEvent): string {
  if (e.allDay) return 'All day'
  return new Intl.DateTimeFormat('en-MY', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(e.start))
    .replace(' ', '')
    .toLowerCase()
}
