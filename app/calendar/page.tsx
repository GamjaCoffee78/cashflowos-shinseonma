// 👉 Calendar 📅 — everyone's Google Calendar, working like Google Calendar:
// Month / Week / Day, add, edit, delete, drag to move, invite teammates.
// Events come from the `event` rows the sync copies in (lib/calendar.ts);
// changes go to Google through /api/calendar (app/_components/CalendarApp.tsx).
import { getRecords, todayISO } from '@/lib/records'
import { calendarEvents, calendarConfigured, PEOPLE } from '@/lib/calendar'
import { ABANG } from '@/abang/config'
import SyncNow from '@/app/_components/SyncNow'
import CalendarApp from '@/app/_components/CalendarApp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function Calendar() {
  const today = todayISO()
  const events = calendarEvents(await getRecords())
  // New events go on the linked account's own calendar unless another is picked.
  const me = PEOPLE.find(p => p.calendarId === ABANG.calendar.calendarId)?.name ?? PEOPLE[0]?.name ?? ''
  return (
    <>
      <h1 className="ph">Calendar 📅</h1>
      <p className="cap">Everyone&apos;s Google Calendar in one place. Click a day or time to add, click an event to change it, drag to move — it all goes straight to Google.</p>
      {calendarConfigured ? (
        <SyncNow source="calendar" label="📅 Sync now" hint="Asking Google Calendar…" />
      ) : (
        <div className="empty">Calendar isn&apos;t wired yet. Add <code>COMPOSIO_API_KEY</code> to Vercel and redeploy.</div>
      )}
      <CalendarApp events={events} people={PEOPLE.map(p => ({ ...p }))} today={today} me={me} />
    </>
  )
}
