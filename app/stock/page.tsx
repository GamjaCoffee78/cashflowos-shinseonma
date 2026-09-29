// 📦 Stock count — read live from the "OMYG STOCK COUNT_2026" Google Sheet
// (lib/stock-sheet.ts), latest count only (today columns I–K). Edits and new
// products are written into the sheet; edits made in the sheet show here on
// the next load. Nothing is stored in Supabase.
import { readStock, stockSheetConfigured, type StockCount } from '@/lib/stock-sheet'
import { ABANG } from '@/abang/config'
import StockView from '@/app/_components/StockView'
import StockShare from '@/app/_components/StockShare'
import { stockShareToken } from '@/lib/stock-share'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function Stock() {
  const link = `https://docs.google.com/spreadsheets/d/${ABANG.stockSheet.spreadsheetId}/edit`
  let data: StockCount | null = null
  let error = ''
  if (!stockSheetConfigured()) error = 'The stock sheet is not connected (COMPOSIO_API_KEY missing).'
  else {
    try { data = await readStock() } catch (e) { error = String((e as Error)?.message || e) }
  }
  // The stock-only link for someone outside the team (lib/stock-share.ts).
  const tk = stockShareToken()
  const h = await headers()
  const shareUrl = tk ? `https://${h.get('x-forwarded-host') || h.get('host')}/share/stock/${tk}` : ''
  return (
    <>
      <h1 className="ph">Stock</h1>
      <p className="cap">
        {data ? `Count as of ${data.asOf} · ` : ''}live from the{' '}
        <a href={link} target="_blank" rel="noreferrer">OMYG stock count sheet</a>. Changes here save straight into the sheet.
      </p>
      <StockShare url={shareUrl} />
      {error ? <p className="cap" style={{ color: 'var(--rust)' }}>⚠️ {error}</p> : null}
      {data ? <StockView data={data} /> : null}
    </>
  )
}
