import { listDocs, invoiceBalance, type StoredDoc } from '@/lib/billing'
import { DOC_TYPES, TYPE_KEYS, emptyLine, emptyParty, type BillingDoc, type DocType, type Party } from '@/lib/billing-shared'
import { todayISO } from '@/lib/records'
import BillingForm from '@/app/_components/BillingForm'

export const dynamic = 'force-dynamic'

// New / edit a billing document.
//   ?type=INV            — blank invoice
//   ?type=INV&from=12    — convert document 12 (e.g. DO → Invoice, INV → Credit Note)
//   ?edit=12             — edit draft 12
export default async function NewDoc({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; edit?: string }> }) {
  const sp = await searchParams
  const docs = await listDocs()
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

  // Past customers / suppliers, newest first, so the team picks instead of retyping.
  const parties: Record<string, Party> = {}
  for (const d of docs) if (d.party?.name && !parties[d.party.name]) parties[d.party.name] = d.party
  const invoices = docs
    .filter((d: StoredDoc) => d.type === 'INV' && d.status !== 'draft' && d.status !== 'cancelled')
    .map(d => ({ number: d.number, name: d.party.name, balance: invoiceBalance(d, docs).balance }))

  return (
    <>
      <h1 className="ph">{edit ? `Edit ${edit.number}` : `New ${DOC_TYPES[initial.type].label}`}</h1>
      <p className="cap">Save as draft to keep working on it, or issue it to lock the number and figures.</p>
      <BillingForm initial={initial} parties={Object.values(parties)} invoices={invoices} />
    </>
  )
}
