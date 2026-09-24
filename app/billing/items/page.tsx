import Link from 'next/link'
import { listItems, suggestItems } from '@/lib/billing'
import ItemsManager from '@/app/_components/ItemsManager'

export const dynamic = 'force-dynamic'

// 👉 Items — Okmaya's products & services, picked on every billing document.
//    category='billing_item' rows (lib/billing.ts). "From your sales" lists the
//    products found in the synced Shopee / TikTok orders that aren't saved yet.
export default async function Items() {
  const [items, found] = await Promise.all([listItems(), suggestItems()])
  const have = new Set(items.map(i => i.name.toLowerCase()))
  const suggestions = found.filter(s => !have.has(s.name.toLowerCase()))
  return (
    <>
      <p className="no-print"><Link href="/billing">← Billing</Link></p>
      <h1 className="ph">Items 📦</h1>
      <p className="cap">Your products and services — saved once, picked in one tap on every document.</p>
      <ItemsManager items={items} suggestions={suggestions} />
    </>
  )
}
