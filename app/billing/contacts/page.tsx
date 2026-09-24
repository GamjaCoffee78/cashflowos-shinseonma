import Link from 'next/link'
import { listContacts, listDocs, invoiceBalance } from '@/lib/billing'
import ContactsManager from '@/app/_components/ContactsManager'

export const dynamic = 'force-dynamic'

// 👉 Contacts — the saved customers and suppliers the Billing form picks from.
//    category='billing_contact' rows (lib/billing.ts). Deleting one removes only the contact;
//    documents already issued keep their own copy of the details.
export default async function Contacts() {
  const [contacts, docs] = await Promise.all([listContacts(), listDocs()])
  // What each customer still owes, and how many documents they have.
  const stats: Record<string, { owes: number; docs: number }> = {}
  for (const d of docs) {
    const k = d.party.name.toLowerCase()
    stats[k] ??= { owes: 0, docs: 0 }
    stats[k].docs++
    if (d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled') stats[k].owes += Math.max(0, invoiceBalance(d, docs).balance)
  }
  return (
    <>
      <p className="no-print"><Link href="/billing">← Billing</Link></p>
      <h1 className="ph">Contacts 📇</h1>
      <p className="cap">Your customers and suppliers — saved once, picked in one tap on every document.</p>
      <ContactsManager contacts={contacts} stats={stats} />
    </>
  )
}
