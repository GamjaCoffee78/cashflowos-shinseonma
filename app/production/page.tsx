// 👉 Production timeline — one month at a time.
//    Rows come from the ONE `records` table, category='production'. They were
//    imported from the PRODUCTION TIMELINE grids of the shared Google Sheet
//    ("Okmaya Project WIP.xlsx") — see scripts/import-production.mjs.
//    Nothing here touches the money tabs: 'production' is its own category.
//
//    This file only FETCHES and picks the month. What the page looks like
//    lives in app/_components/ProductionView.tsx.
import { getRecords, todayISO } from '@/lib/records'
import ProductionView, { calendarMonths } from '@/app/_components/ProductionView'

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

  const { months, current } = calendarMonths(rows, today, m)

  return <ProductionView rows={rows} months={months} current={current} today={today} />
}
