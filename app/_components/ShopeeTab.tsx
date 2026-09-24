// A per-shop Shopee tab (Shopee MY, Shopee SG). One shop's orders only, always
// in that shop's own currency — MYR and SGD are never added up.
//
// The look lives in ShopOrdersView, shared with the TikTok Shop tab; this file
// only fetches and maps.
import { todayISO } from '@/lib/records'
import {
  shopeeOrders, shopeeConfigured, money, currencyOf, linkedRegions,
  fetchShopeeOrders, fetchShopeeMonths,
} from '@/lib/shopee'
import ShopOrdersView, { type ShopRow } from '@/app/_components/ShopOrdersView'
import SyncNow from '@/app/_components/SyncNow'

// Shopee's shouty enum, in plain words, with the pill colour that matches the
// rest of the app: green = money landed, blue = on its way, amber = waiting.
const STATUS: Record<string, { label: string; pill: string }> = {
  COMPLETED: { label: 'Completed', pill: 'paid' },
  SHIPPED: { label: 'Shipped', pill: 'open' },
  TO_CONFIRM_RECEIVE: { label: 'Delivered', pill: 'open' },
  PROCESSED: { label: 'Processed', pill: 'open' },
  READY_TO_SHIP: { label: 'Ready to ship', pill: 'pending' },
  UNPAID: { label: 'Unpaid', pill: 'pending' },
  IN_CANCEL: { label: 'Cancelling', pill: 'lost' },
  CANCELLED: { label: 'Cancelled', pill: 'lost' },
  TO_RETURN: { label: 'Return', pill: 'lost' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s ? s.replace(/_/g, ' ').toLowerCase() : '—', pill: '' }

// Shopee's mark — the orange shopping bag with an S — drawn inline so the button
// needs no image file. Sits on a white disc so it reads on the red button.
function ShopeeMark() {
  return (
    <svg className="shopee-mark" viewBox="0 0 24 24" width="18" height="18" aria-label="Shopee">
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <path d="M8.6 8.2a3.4 3.4 0 0 1 6.8 0" fill="none" stroke="#EE4D2D" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 8.2h12l-.8 10.1a1.4 1.4 0 0 1-1.4 1.3H8.2a1.4 1.4 0 0 1-1.4-1.3z" fill="#EE4D2D" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">S</text>
    </svg>
  )
}

export default async function ShopeeTab({
  region,
  title,
  fallbackCurrency,
}: {
  region: 'MY' | 'SG'
  title: string
  fallbackCurrency: string   // shown before the first order arrives
}) {
  // 60 days: enough for the 30-day figures and their comparison period.
  const orders = shopeeOrders(await fetchShopeeOrders(region, 60), region)
  const cur = currencyOf(orders, fallbackCurrency)
  const months = await fetchShopeeMonths(region, '2020-01-01')
  const linked = shopeeConfigured ? await linkedRegions().catch(() => []) : []
  const thisShopLinked = linked.includes(region)

  const rows: ShopRow[] = orders.map(o => ({
    id: o.id, ref: o.order_sn, date: o.date, buyer: o.buyer,
    items: o.items, amount: o.amount, currency: o.currency, status: o.status, net: o.net,
  }))

  return (
    <ShopOrdersView
      title={title}
      caption={`Live from your Shopee ${region} shop · all figures in ${cur} · synced every morning`}
      rows={rows}
      months={months}
      currency={cur}
      money={money}
      statusOf={statusOf}
      today={todayISO()}
      cutBy="Shopee"
      toolbar={shopeeConfigured && <SyncNow source="shopee" region={region} label={<><ShopeeMark /> Sync</>} hint={`Asking Shopee ${region} for the latest orders…`} />}
      empty={
        !shopeeConfigured ? (
          <>
            Shopee isn&apos;t wired yet. Add <code>SHOPEE_PARTNER_ID</code> and <code>SHOPEE_PARTNER_KEY</code> in Vercel
            (Shopee Open Platform → App List → your app), redeploy, then open <code>/api/shopee/authorize</code> once per shop.
          </>
        ) : thisShopLinked ? (
          <>No orders in the last 30 days for this shop yet — press <b>Sync now</b>, or wait for the 8:15am run.</>
        ) : (
          <>
            Your Shopee {region} shop isn&apos;t linked yet. Sign in to <b>that shop&apos;s</b> Seller Centre, then open{' '}
            <code>/api/shopee/authorize</code> — Shopee asks which shop to connect, and the region decides which tab it feeds.
            {linked.length ? <> (Linked so far: {linked.join(', ')}.)</> : null}
          </>
        )
      }
    />
  )
}
