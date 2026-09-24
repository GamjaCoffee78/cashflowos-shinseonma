// 👉 Events / Others — one month at a time. Tick, move and add work like the
//    Production Timeline (same component, /api/production).
//    Rows are category='events_other', copied from the EVENTS / OTHERS block of every month
//    tab in "[NEW] Okmaya Project WIP" by Sync now (lib/production-sheet.ts).
//    The page looks exactly like the Production Timeline (same component).
import { getRecords, todayISO } from '@/lib/records'
import { AddTask } from '@/app/_components/ProductionActions'
import ProductionView from '@/app/_components/ProductionView'

export const dynamic = 'force-dynamic'

const TITLE = 'Events / Others 🎪'
const CAPTION = "Events, holidays and everything else on the team calendar — from the Okmaya project sheet. Tick what's done, move what slipped."

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const today = todayISO()
  const { m } = await searchParams
  const rows = (await getRecords()).filter(r => r.category === 'events_other' && !!r.due_date)
  if (rows.length === 0) {
    return (
      <>
        <h1 className="ph">{TITLE}</h1>
        <p className="cap">{CAPTION}</p>
        <div style={{ margin: '10px 0 16px' }}>
          <AddTask defaultDate={today} category="events_other" basePath="/events-others" label="＋ New event" placeholder="e.g. Okmaya Day at Mid Valley" />
        </div>
        <p className="cap">Nothing on the calendar yet — press Sync now to read the sheet.</p>
      </>
    )
  }
  const months = [...new Set(rows.map(r => (r.due_date as string).slice(0, 7)))].sort()
  const thisMonth = today.slice(0, 7)
  const fallback = months.find(k => k >= thisMonth) ?? months[months.length - 1]
  const current = m && months.includes(m) ? m : fallback
  return (
    <ProductionView
      rows={rows} months={months} current={current} today={today}
      title={TITLE} caption={CAPTION} basePath="/events-others"
      category="events_other" addLabel="＋ New event" addPlaceholder="e.g. Okmaya Day at Mid Valley"
    />
  )
}
