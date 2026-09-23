// 👉 Shopee MY 🛍️ — the Malaysian shop's orders, straight from Shopee's Open
// API (lib/shopee.ts). Its own `shopee_order` rows, filtered to region MY, so
// SGD money from the Singapore shop can never land in these totals.
import ShopeeTab from '@/app/_components/ShopeeTab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default function ShopeeMY() {
  return <ShopeeTab region="MY" title="Shopee MY 🛍️" fallbackCurrency="MYR" />
}
