// 👉 Production timeline — one month at a time.
//    Rows come from the ONE `records` table, category='production'. They were
//    imported from the PRODUCTION TIMELINE grids of the shared Google Sheet
//    ("Okmaya Project WIP.xlsx") — see scripts/import-production.mjs.
//    Nothing here touches the money tabs: 'production' is its own category.
//
//    This file only FETCHES and picks the month. What the page looks like
//    lives in app/_components/ProductionView.tsx.
import { getRecords, todayISO } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import ProductionView from '@/app/_components/ProductionView'

export const dynamic = 'force-dynamic'

export default async function Production({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const today = todayISO()
  const { m } = await searchParams
  const all = await getRecords()
  const rows = all.filter(r => r.category === 'production' && !!r.due_date)

  if (rows.length === 0) {
    return (
      <>
        <h1 className="ph">Production Timeline 🏭</h1>
        <p className="cap">What has to happen, and when — from the Okmaya project sheet.</p>
        <Empty label="production items" />
      </>
    )
  }

  // Every month that actually has items, oldest first.
  const months = [...new Set(rows.map(r => (r.due_date as string).slice(0, 7)))].sort()
  // Default to this month if it has items, else the next month that does.
  const thisMonth = today.slice(0, 7)
  const fallback = months.find(k => k >= thisMonth) ?? months[months.length - 1]
  const current = m && months.includes(m) ? m : fallback

  return <ProductionView rows={rows} months={months} current={current} today={today} />
}
