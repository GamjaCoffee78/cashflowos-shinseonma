import { listContacts, listItems, listDocs, invoiceBalance, type StoredDoc } from '@/lib/billing'
import { DOC_TYPES, TYPE_KEYS, emptyContact, emptyLine, emptyParty, type BillingDoc, type Contact, type DocType } from '@/lib/billing-shared'
import { todayISO } from '@/lib/records'
import BillingForm from '@/app/_components/BillingForm'

export const dynamic = 'force-dynamic'

// New / edit a billing document.
//   ?type=INV            — blank invoice
//   ?type=INV&from=12    — convert document 12 (e.g. DO → Invoice, INV → Credit Note)
//   ?edit=12             — edit draft 12
export default async function NewDoc({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; edit?: string; contact?: string }> }) {
  const sp = await searchParams
  const [docs, saved, items] = await Promise.all([listDocs(), listContacts(), listItems()])
  const today = todayISO()

  let initial: BillingDoc & { id?: number }
  const edit = docs.find(d => d.id === Number(sp.edit) && d.status === 'draft')
  if (edit) {
    initial = edit
  } else {
    const type = TYPE_KEYS.includes(sp.type as DocType) ? (sp.type as DocType) : 'INV'
    const src = docs.find(d => d.id === Number(sp.from))
    initial = {
      type, number: '', status: 'draft', date: today, dueDate: '', terms: type === 'INV' || type === 'PO' ? 30 : 0,
      party: src ? { ...src.party } : emptyParty(),
      shipTo: src?.shipTo ?? '',
      refNo: src?.number ?? '',
      yourRef: src?.yourRef ?? '',
      reason: '',
      lines: src ? src.lines.map(l => ({ ...l })) : [emptyLine()],
      taxRate: src?.taxRate ?? 0,
      notes: '', payments: [], createdBy: '',
    }
    // A PO is to a supplier — never copy a customer across into it.
    if (type === 'PO' && src && src.type !== 'PO') { initial.party = emptyParty(); initial.refNo = '' }
  }

  // Saved contacts, plus anyone billed before who isn't saved yet (so old
  // customers are still one tap away).
  const contacts: Contact[] = [...saved]
  const seen = new Set(saved.map(c => c.name.toLowerCase()))
  for (const d of docs) {
    const key = d.party?.name?.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    contacts.push({ ...emptyContact(d.type === 'PO' ? 'supplier' : 'customer'), ...d.party, terms: d.terms })
  }
  // Starting from a contact: /billing/new?type=INV&contact=12
  const pre = saved.find(c => c.id === Number(sp.contact))
  if (pre && !edit && !initial.party.name) {
    initial.party = { name: pre.name, address: pre.address, attn: pre.attn, phone: pre.phone, email: pre.email, regNo: pre.regNo }
    if (initial.type === 'INV' || initial.type === 'PO') initial.terms = pre.terms
  }
  const invoices = docs
    .filter((d: StoredDoc) => d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled')
    .map(d => ({ number: d.number, name: d.party.name, balance: invoiceBalance(d, docs).balance }))

  return (
    <>
      <h1 className="ph">{edit ? `Edit ${edit.number}` : `New ${DOC_TYPES[initial.type].label}`}</h1>
      <p className="cap">Save as draft to keep working on it, or issue it to lock the number and figures.</p>
      <BillingForm initial={initial} contacts={contacts} invoices={invoices} items={items} />
    </>
  )
}
