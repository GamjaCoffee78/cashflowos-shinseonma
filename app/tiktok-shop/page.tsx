// 👉 TikTok Shop 🎵 — orders straight from the TikTok Shop Partner API
// (lib/tiktok-shop.ts), in their own `tiktok_order` rows. Same layout as the
// Shopee tabs, and the same rule: nothing here touches the money tabs' figures.
import { todayISO } from '@/lib/records'
import {
  fetchTikTokOrders, fetchTikTokMonths, tiktokShopConfigured, serviceIdSet, linkedShops, money,
} from '@/lib/tiktok-shop'
import ShopOrdersView, { type ShopRow } from '@/app/_components/ShopOrdersView'
import SyncNow from '@/app/_components/SyncNow'
import TikTokIcon from '@/app/_components/TikTokIcon'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// TikTok's order states, in plain words.
const STATUS: Record<string, { label: string; pill: string }> = {
  COMPLETED: { label: 'Completed', pill: 'paid' },
  DELIVERED: { label: 'Delivered', pill: 'paid' },
  IN_TRANSIT: { label: 'In transit', pill: 'open' },
  AWAITING_COLLECTION: { label: 'Awaiting pickup', pill: 'open' },
  AWAITING_SHIPMENT: { label: 'To ship', pill: 'pending' },
  UNPAID: { label: 'Unpaid', pill: 'pending' },
  CANCELLED: { label: 'Cancelled', pill: 'lost' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s ? s.replace(/_/g, ' ').toLowerCase() : '—', pill: '' }

export default async function TikTokShop() {
  const recs = await fetchTikTokOrders(60)
  const rows: ShopRow[] = recs.map(r => ({
    id: r.id,
    ref: String(r.meta?.tiktok_order_id ?? ''),
    date: r.due_date ?? '',
    buyer: String(r.meta?.customer ?? ''),
    items: String(r.meta?.items ?? ''),
    amount: Number(r.amount || 0),
    currency: String(r.meta?.currency ?? ''),
    status: String(r.meta?.tiktok_status ?? ''),
  }))
  const cur = rows.find(r => r.currency)?.currency || 'MYR'
  const months = await fetchTikTokMonths('2020-01-01')
  const linked = tiktokShopConfigured ? await linkedShops().catch(() => []) : []

  return (
    <ShopOrdersView
      title="TikTok Shop 🎵"
      caption={`Live from your TikTok Shop · all figures in ${cur} · synced every morning`}
      rows={rows}
      months={months}
      currency={cur}
      money={money}
      statusOf={statusOf}
      today={todayISO()}
      toolbar={tiktokShopConfigured && <SyncNow source="tiktok_shop" label={<><TikTokIcon />Sync now</>} hint="Asking TikTok Shop for the latest orders…" />}
      empty={
        !tiktokShopConfigured ? (
          <>
            TikTok Shop isn&apos;t wired yet. Add <code>TIKTOK_APP_KEY</code> and <code>TIKTOK_APP_SECRET</code> in Vercel
            (Partner Center → your app), redeploy, then open <code>/api/tiktok/authorize</code> once.
          </>
        ) : !serviceIdSet ? (
          <>Add <code>TIKTOK_SERVICE_ID</code> in Vercel (Partner Center → your app) and redeploy, then open <code>/api/tiktok/authorize</code>.</>
        ) : linked.length ? (
          <>No orders in the last 30 days yet — press <b>Sync now</b>, or wait for the 8:15am run. If the app&apos;s permissions are still awaiting TikTok&apos;s review, orders won&apos;t come through until they&apos;re approved.</>
        ) : (
          <>
            No shop linked yet. Open <code>/api/shopee/authorize</code>&apos;s TikTok twin — <code>/api/tiktok/authorize</code> — and approve with your
            TikTok Shop seller account. TikTok must also have approved the app&apos;s permissions first.
          </>
        )
      }
    />
  )
}
