import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { CATEGORY, CONTACT_CATEGORY, ITEM_CATEGORY, contactRow, itemRow, listItems, getDoc, listContacts, listDocs, nextNumber, toRow, invoiceBalance, type StoredDoc } from '@/lib/billing'
import { DOC_TYPES, TYPE_KEYS, addDays, emptyParty, type BillingDoc, type Contact, type ContactKind, type DocType, type Item } from '@/lib/billing-shared'

// The Billing tab's writes. POST { action, … } → { ok, message, id? }.
//   save    — create a document, or update one that is still a DRAFT
//   status  — issue / mark received / cancel
//   payment — record a payment against an invoice (auto-marks partial / paid)
// Only ever touches category='billing_doc' rows, one id at a time. Nothing is
// deleted: a wrong document is cancelled, which keeps the numbering unbroken
// for the auditor. Gated by the login cookie like every tab (proxy.ts).

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })
const s = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function clean(body: any): BillingDoc | string {
  const type = s(body?.type) as DocType
  if (!TYPE_KEYS.includes(type)) return 'Pick a document type.'
  const date = s(body?.date)
  if (!ISO.test(date)) return 'Pick a document date.'
  const p = body?.party ?? {}
  const party = { ...emptyParty(), name: s(p.name, 200), address: s(p.address, 600), attn: s(p.attn, 120), phone: s(p.phone, 60), email: s(p.email, 200), regNo: s(p.regNo, 80) }
  if (!party.name) return `Fill in the ${DOC_TYPES[type].party.toLowerCase()} name.`
  const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 100)
    .map((l: any) => ({ desc: s(l?.desc, 300), qty: n(l?.qty), uom: s(l?.uom, 12) || 'UNIT', price: n(l?.price), disc: Math.min(100, Math.max(0, n(l?.disc))) }))
    .filter((l: any) => l.desc)
  if (lines.length === 0) return 'Add at least one item.'
  const refNo = s(body?.refNo, 40)
  if (DOC_TYPES[type].needsRef && !refNo) return 'A credit/debit note must name the invoice it adjusts.'
  const reason = s(body?.reason, 500)
  if (DOC_TYPES[type].needsRef && !reason) return 'Give the reason for the note.'
  const terms = Math.max(0, Math.round(n(body?.terms)))
  return {
    type, date, terms, party, lines, refNo, reason,
    number: '',
    status: body?.issue ? 'issued' : 'draft',
    dueDate: ISO.test(s(body?.dueDate)) ? s(body?.dueDate) : addDays(date, terms),
    shipTo: s(body?.shipTo, 600),
    yourRef: s(body?.yourRef, 80),
    taxRate: Math.min(100, Math.max(0, n(body?.taxRate))),
    notes: s(body?.notes, 1500),
    payments: [],
    createdBy: s(body?.createdBy, 80),
  }
}

function cleanContact(body: any): Contact | string {
  const name = s(body?.name, 200)
  if (!name) return 'Give the contact a name.'
  const kind = (['customer', 'supplier', 'both'].includes(s(body?.kind)) ? s(body?.kind) : 'customer') as ContactKind
  return {
    kind, name, address: s(body?.address, 600), attn: s(body?.attn, 120), phone: s(body?.phone, 60),
    email: s(body?.email, 200), regNo: s(body?.regNo, 80), terms: Math.max(0, Math.round(n(body?.terms))), notes: s(body?.notes, 1000),
  }
}

// Remember the party of a document in Contacts: add it if the name is new,
// else refresh its details (a supplier who is also a customer becomes 'both').
async function rememberParty(doc: BillingDoc) {
  const kind: ContactKind = doc.type === 'PO' ? 'supplier' : 'customer'
  const all = await listContacts()
  const old = all.find(c => c.name.toLowerCase() === doc.party.name.toLowerCase())
  const merged: Contact = {
    ...(old ?? { kind, terms: doc.terms, notes: '' }),
    ...Object.fromEntries(Object.entries(doc.party).filter(([, v]) => v)),
    name: old?.name ?? doc.party.name,
    kind: old && old.kind !== kind ? 'both' : kind,
  } as Contact
  if (old?.id) await supabase.from('records').update(contactRow(merged)).eq('id', old.id).eq('category', CONTACT_CATEGORY)
  else await supabase.from('records').insert(contactRow(merged))
}

function cleanItem(body: any): Item | string {
  const name = s(body?.name, 300)
  if (!name) return 'Give the item a name.'
  return { code: s(body?.code, 40), name, uom: s(body?.uom, 12) || 'UNIT', price: Math.max(0, n(body?.price)), cost: Math.max(0, n(body?.cost)), notes: s(body?.notes, 500) }
}

async function refresh(id?: number) {
  revalidatePath('/billing')
  revalidatePath('/billing/contacts')
  revalidatePath('/billing/items')
  revalidatePath('/billing/new')
  if (id) revalidatePath(`/billing/${id}`)
}

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = s(body?.action)

  if (action === 'save') {
    const doc = clean(body)
    if (typeof doc === 'string') return bad(doc)
    const docs = await listDocs()
    if (doc.refNo && DOC_TYPES[doc.type].needsRef) {
      const inv = docs.find(d => d.number === doc.refNo && d.type === 'INV')
      if (!inv) return bad(`No invoice ${doc.refNo} found.`)
      if (inv.status === 'cancelled') return bad(`${doc.refNo} is cancelled.`)
    }

    if (body?.saveContact) await rememberParty(doc).catch(e => console.warn('[CFO] contact save failed:', e))

    const id = Number(body?.id) || 0
    if (id) {
      const old = await getDoc(id)
      if (!old) return bad('That document no longer exists.')
      if (old.status !== 'draft') return bad('Only drafts can be edited. Issue a credit/debit note, or cancel it.')
      const next: BillingDoc = { ...doc, number: old.type === doc.type ? old.number : nextNumber(docs, doc.type, doc.date), createdBy: old.createdBy || doc.createdBy }
      const { error } = await supabase.from('records').update(toRow(next)).eq('id', id).eq('category', CATEGORY)
      if (error) return bad(`Couldn't save: ${error.message}`)
      await refresh(id)
      return NextResponse.json({ ok: true, id, message: `${next.number} saved.` })
    }

    doc.number = nextNumber(docs, doc.type, doc.date)
    const { data, error } = await supabase.from('records').insert(toRow(doc)).select('id').single()
    if (error) return bad(`Couldn't save: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, id: data.id, message: `${doc.number} created.` })
  }

  if (action === 'contact_save') {
    const c = cleanContact(body)
    if (typeof c === 'string') return bad(c)
    const cid = Number(body?.id) || 0
    const all = await listContacts()
    if (all.some(x => x.id !== cid && x.name.toLowerCase() === c.name.toLowerCase())) return bad(`${c.name} is already in Contacts.`)
    const { error } = cid
      ? await supabase.from('records').update(contactRow(c)).eq('id', cid).eq('category', CONTACT_CATEGORY)
      : await supabase.from('records').insert(contactRow(c))
    if (error) return bad(`Couldn't save: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: `${c.name} saved.` })
  }

  // Documents keep their own copy of the party, so deleting a contact changes no document.
  if (action === 'contact_remove') {
    const { error } = await supabase.from('records').delete().eq('id', Number(body?.id)).eq('category', CONTACT_CATEGORY)
    if (error) return bad(`Couldn't delete: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: 'Contact deleted.' })
  }

  if (action === 'item_save') {
    const it = cleanItem(body)
    if (typeof it === 'string') return bad(it)
    const iid = Number(body?.id) || 0
    const all = await listItems()
    if (all.some(x => x.id !== iid && x.name.toLowerCase() === it.name.toLowerCase())) return bad(`${it.name} is already in Items.`)
    const { error } = iid
      ? await supabase.from('records').update(itemRow(it)).eq('id', iid).eq('category', ITEM_CATEGORY)
      : await supabase.from('records').insert(itemRow(it))
    if (error) return bad(`Couldn't save: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: `${it.name} saved.` })
  }

  // Add many at once (the "from your sales" suggestions). Names already saved are skipped.
  if (action === 'items_import') {
    const list = (Array.isArray(body?.items) ? body.items : []).slice(0, 1000).map(cleanItem).filter((x: Item | string): x is Item => typeof x !== 'string')
    const have = new Set((await listItems()).map(x => x.name.toLowerCase()))
    const fresh = list.filter((x: Item) => !have.has(x.name.toLowerCase()) && have.add(x.name.toLowerCase()))
    if (!fresh.length) return bad('Those are all in Items already.')
    const { error } = await supabase.from('records').insert(fresh.map(itemRow))
    if (error) return bad(`Couldn't save: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: `${fresh.length} item${fresh.length === 1 ? '' : 's'} added.` })
  }

  if (action === 'item_delete') {
    const { error } = await supabase.from('records').delete().eq('id', Number(body?.id)).eq('category', ITEM_CATEGORY)
    if (error) return bad(`Couldn't delete: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: 'Item deleted.' })
  }

  const id = Number(body?.id)
  const doc = await getDoc(id)
  if (!doc) return bad('That document no longer exists.')
  const write = async (next: StoredDoc, message: string) => {
    const { error } = await supabase.from('records').update(toRow(next)).eq('id', id).eq('category', CATEGORY)
    if (error) return bad(`Couldn't save: ${error.message}`)
    await refresh(id)
    return NextResponse.json({ ok: true, id, message })
  }

  if (action === 'status') {
    const to = s(body?.to)
    if (doc.status === 'cancelled') return bad('This document is cancelled.')
    if (to === 'issued' && doc.status === 'draft') return write({ ...doc, status: 'issued' }, `${doc.number} issued.`)
    if (to === 'received' && (doc.type === 'PO' || doc.type === 'DO') && doc.status === 'issued')
      return write({ ...doc, status: 'received' }, `${doc.number} marked ${doc.type === 'PO' ? 'goods received' : 'delivered'}.`)
    if (to === 'cancelled') {
      if ((doc.payments ?? []).length) return bad('Payments are recorded on this invoice — issue a credit note instead.')
      const docs = await listDocs()
      if (docs.some(d => d.refNo === doc.number && d.status !== 'cancelled' && DOC_TYPES[d.type].needsRef))
        return bad('Cancel the credit/debit notes against it first.')
      return write({ ...doc, status: 'cancelled', notes: [doc.notes, `Cancelled: ${s(body?.reason, 300) || 'no reason given'}`].filter(Boolean).join('\n') }, `${doc.number} cancelled.`)
    }
    return bad('That change is not allowed.')
  }

  // Delete for good — one document, by id. Drafts go straight away; an issued
  // document asks the user to type its number (the button does that). A
  // document other notes point at must lose those notes first, so no credit
  // note is ever left pointing at nothing.
  if (action === 'delete') {
    // Issued / cancelled documents need the owner's PIN (BILLING_DELETE_PIN in
    // Vercel). No PIN set = nobody can delete them. Drafts need no PIN.
    if (doc.status !== 'draft') {
      const pin = (process.env.BILLING_DELETE_PIN ?? '').trim()
      if (!pin) return bad('Deleting issued documents is switched off. The owner can switch it on by setting BILLING_DELETE_PIN in Vercel. Use Cancel instead.')
      const given = Buffer.from(s(body?.pin, 100)), want = Buffer.from(pin)
      if (given.length !== want.length || !timingSafeEqual(given, want)) return bad('Wrong PIN.')
    }
    const docs = await listDocs()
    const children = docs.filter(d => d.id !== doc.id && d.refNo === doc.number && DOC_TYPES[d.type].needsRef)
    if (children.length) return bad(`Delete ${children.map(c => c.number).join(', ')} first — they adjust this document.`)
    const { error } = await supabase.from('records').delete().eq('id', id).eq('category', CATEGORY)
    if (error) return bad(`Couldn't delete: ${error.message}`)
    await refresh()
    return NextResponse.json({ ok: true, message: `${doc.number} deleted.` })
  }

  if (action === 'payment') {
    if (doc.type !== 'INV') return bad('Payments are recorded against invoices.')
    if (doc.status === 'draft' || doc.status === 'cancelled') return bad('Issue the invoice first.')
    const date = s(body?.date)
    const amount = Math.round(n(body?.amount) * 100) / 100
    if (!ISO.test(date)) return bad('Pick the payment date.')
    if (amount <= 0) return bad('Enter the amount received.')
    const docs = await listDocs()
    const { balance } = invoiceBalance(doc, docs)
    if (amount > balance + 0.005) return bad(`That's more than the balance of RM ${balance.toFixed(2)}.`)
    const payments = [...(doc.payments ?? []), { date, amount, method: s(body?.method, 40), ref: s(body?.ref, 80) }]
    const left = Math.round((balance - amount) * 100) / 100
    return write({ ...doc, payments, status: left <= 0 ? 'paid' : 'partial' }, left <= 0 ? `${doc.number} fully paid.` : `Payment recorded. RM ${left.toFixed(2)} still owed.`)
  }

  return bad('Unknown action.')
}
