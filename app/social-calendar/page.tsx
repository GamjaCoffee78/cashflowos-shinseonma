// 👉 Social Calendar — one month at a time, plus the content-ideas notebook.
//    Posts are category='social_plan': copied from the SOCIAL CONTENT CALENDAR
//    block of every month tab in "[NEW] Okmaya Project WIP" by Sync now
//    (lib/production-sheet.ts), or added / scheduled here. Ideas are
//    category='content_idea' (no date until scheduled). Tick, move and add work
//    exactly like the Production Timeline (same component, /api/production).
import { getRecords, todayISO } from '@/lib/records'
import ProductionView from '@/app/_components/ProductionView'
import { IdeasBoard, AddTask, type Idea } from '@/app/_components/ProductionActions'

export const dynamic = 'force-dynamic'

const TITLE = 'Social Calendar 📱'
const CAPTION = "What goes out on IG and TikTok, and when — from the Okmaya project sheet. Tags show the channels (IGF feed · IGR reels · IGST stories · REELS TikTok). Tick what's posted, move what slipped."
const PLACEHOLDER = 'e.g. [IGR/REELS] Sundubu boiling video'

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

  if (rows.length === 0) {
    return (
      <>
        <h1 className="ph">{TITLE}</h1>
        <p className="cap">{CAPTION}</p>
        <div style={{ margin: '10px 0 16px' }}>
          <AddTask defaultDate={today} category="social_plan" basePath="/social-calendar" label="＋ New post" placeholder={PLACEHOLDER} />
        </div>
        {board}
        <p className="cap">No posts on the calendar yet — press Sync now to read the sheet.</p>
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
      title={TITLE} caption={CAPTION} basePath="/social-calendar"
      category="social_plan" addLabel="＋ New post" addPlaceholder={PLACEHOLDER}
    >
      {board}
    </ProductionView>
  )
}
