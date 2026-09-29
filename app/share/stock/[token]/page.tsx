// 📦 The stock-only page for someone outside the team (lib/stock-share.ts).
// Same cards as the Stock tab, saving to the same Google Sheet — but no menu,
// no other tabs. The root layout still wraps it, so the
// sidebar / bars are hidden with CSS here; their links all need the login
// anyway (proxy.ts only lets /share/* through).
import { notFound } from 'next/navigation'
import { readStock, stockSheetConfigured, type StockCount } from '@/lib/stock-sheet'
import { checkStockShareToken } from '@/lib/stock-share'
import StockView from '@/app/_components/StockView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Okmaya · Stock count', robots: { index: false, follow: false } }

export default async function SharedStock({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!checkStockShareToken(token)) notFound()
  let data: StockCount | null = null
  let error = ''
  if (!stockSheetConfigured()) error = 'The stock sheet is not connected.'
  else {
    try { data = await readStock() } catch (e) { error = String((e as Error)?.message || e) }
  }
  return (
    <>
      <style>{`.side,.bottomnav,.banner,.syncbar,.topmark{display:none!important}.main{max-width:1200px;margin:0 auto}`}</style>
      <h1 className="ph">Okmaya stock count</h1>
      <p className="cap">
        {data ? `Count as of ${data.asOf}. ` : ''}Tap ✏️ to change a quantity or expiry, “＋ Add expiry &amp; qty” for a new batch, or “＋ Add product”. Every change saves to Okmaya’s stock sheet, and ↩ Undo reverses it.
      </p>
      {error ? <p className="cap" style={{ color: 'var(--rust)' }}>⚠️ {error}</p> : null}
      {data ? <StockView data={data} endpoint={`/share/stock/${token}/save`} /> : null}
    </>
  )
}
