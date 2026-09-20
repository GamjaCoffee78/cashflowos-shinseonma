// 👉 Ecomm Sales — placeholder. The tab exists in both navs so the slot is
// reserved; the real view (Shopee MY + Shopee SG, split by market) comes later.
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

export default function EcommSales() {
  return (
    <>
      <h1 className="ph">Ecomm Sales 🛒</h1>
      <p className="cap">Shopee MY + Shopee SG. Coming soon.</p>
      <Empty label="ecomm sales yet" />
    </>
  )
}
