// 📦 Stock count — read live from the "OMYG STOCK COUNT_2026" Google Sheet
// (lib/stock-sheet.ts). Edit a QTY here and it's written into the sheet; edit
// the sheet and it shows here on the next load. Nothing is stored in Supabase.
import { readStock, stockSheetConfigured, type StockCount } from '@/lib/stock-sheet'
import { ABANG } from '@/abang/config'
import StockView from '@/app/_components/StockView'

export const dynamic = 'force-dynamic'

export default async function Stock() {
  const link = `https://docs.google.com/spreadsheets/d/${ABANG.stockSheet.spreadsheetId}/edit`
  let data: StockCount | null = null
  let error = ''
  if (!stockSheetConfigured()) error = 'The stock sheet is not connected (COMPOSIO_API_KEY missing).'
  else {
    try { data = await readStock() } catch (e) { error = String((e as Error)?.message || e) }
  }
  return (
    <>
      <h1 className="ph">Stock</h1>
      <p className="cap">
        Live from the <a href={link} target="_blank" rel="noreferrer">OMYG stock count sheet</a>
        {data ? ` · latest count as of ${data.latest}` : ''}. Tap a quantity to change it — it saves into the sheet.
      </p>
      {error ? <p className="cap" style={{ color: 'var(--danger, #b42318)' }}>⚠️ {error}</p> : null}
      {data ? <StockView data={data} /> : null}
    </>
  )
}
