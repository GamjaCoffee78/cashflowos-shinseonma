// 👉 Social Calendar — one month at a time, plus the content-ideas notebook.
//    Posts are category='social_plan': copied from the SOCIAL CONTENT CALENDAR
//    block of every month tab in "[NEW] Okmaya Project WIP" by Sync now
//    (lib/production-sheet.ts), or added / scheduled here. Ideas are
//    category='content_idea' (no date until scheduled). Tick, move and add work
//    exactly like the Production Timeline (same component, /api/production).
import { getRecords, todayISO } from '@/lib/records'
import ProductionView, { calendarMonths } from '@/app/_components/ProductionView'
import { IdeasBoard, AddTask, type Idea } from '@/app/_components/ProductionActions'

export const dynamic = 'force-dynamic'

const TITLE = 'Social Calendar 📱'
const CAPTION = "What goes out on Instagram, and when — from the Okmaya project sheet. Tags show the channels (IGF feed · IGR reels · IGST stories). Tick what's posted, move what slipped."
const PLACEHOLDER = 'e.g. Sundubu boiling video'

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const today = todayISO()
  const { m } = await searchParams
  const all = await getRecords()
  const rows = all.filter(r => r.category === 'social_plan' && !!r.due_date)
  const ideas: Idea[] = all
    .filter(r => r.category === 'content_idea')
    .map(r => ({ id: r.id, title: r.title, notes: r.notes ?? null, status: r.status || 'idea', created: r.meta?.created_at || '' }))
    .sort((a, b) => (a.created < b.created ? 1 : -1))
  const board = <IdeasBoard ideas={ideas} today={today} />

  const { months, current } = calendarMonths(rows, today, m)
  return (
    <ProductionView
      rows={rows} months={months} current={current} today={today}
      title={TITLE} caption={CAPTION} basePath="/social-calendar"
      category="social_plan" addLabel="＋ New post" addPlaceholder={PLACEHOLDER}
    >
      {board}
    </ProductionView>
  )
}
