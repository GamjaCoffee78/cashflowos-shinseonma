// 👉 Shopee SG 🛍️ — the Singapore shop's orders, straight from Shopee's Open
// API (lib/shopee.ts). Same tab as Shopee MY, filtered to region SG and shown
// in SGD — the two shops' money is never added together.
import ShopeeTab from '@/app/_components/ShopeeTab'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default function ShopeeSG() {
  return <ShopeeTab region="SG" title="Shopee SG 🛍️" fallbackCurrency="SGD" />
}
