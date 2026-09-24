// 👉 Events / Others — one month at a time. Tick, move and add work like the
//    Production Timeline (same component, /api/production).
//    Rows are category='events_other', copied from the EVENTS / OTHERS block of every month
//    tab in "[NEW] Okmaya Project WIP" by Sync now (lib/production-sheet.ts).
//    The page looks exactly like the Production Timeline (same component).
import { getRecords, todayISO } from '@/lib/records'
import ProductionView, { calendarMonths } from '@/app/_components/ProductionView'

export const dynamic = 'force-dynamic'

const TITLE = 'Events / Others 🎪'
const CAPTION = "Events, holidays and everything else on the team calendar — from the Okmaya project sheet. Tick what's done, move what slipped."

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const today = todayISO()
  const { m } = await searchParams
  const rows = (await getRecords()).filter(r => r.category === 'events_other' && !!r.due_date)
  const { months, current } = calendarMonths(rows, today, m)
  return (
    <ProductionView
      rows={rows} months={months} current={current} today={today}
      title={TITLE} caption={CAPTION} basePath="/events-others"
      category="events_other" addLabel="＋ New event" addPlaceholder="e.g. Okmaya Day at Mid Valley"
    />
  )
}
