// Billing documents — the parts both the browser form and the server need.
// No database access here (that's lib/billing.ts), so the client form can
// import it for live totals.

export const COMPANY = {
  name: 'Okmaya Group Sdn Bhd',
  regNo: '202601024164 (1686261-M)',
  address: [
    'Suite 4.02A, 4th Floor, Dataran Hamodal Block A,',
    'Lot No.4, Jalan Bersatu 13/4, Section 13,',
    '46200 Petaling Jaya, Selangor',
  ],
  email: 'omma@okmayaofficial.com',
  phone: '',   // add the office number here
  sstNo: '',   // add the SST registration no. here once registered
  bank: {
    name: 'Standard Chartered Bank Malaysia Berhad',
    branch: 'Subang Jaya',
    account: '910194398429',
    swift: 'SCBLMYKXXXX',
    address: 'No 1, Jalan USJ 10/1F, 47620 UEP Subang Jaya, Selangor Darul Ehsan, Malaysia',
  },
}

export type DocType = 'PO' | 'DO' | 'INV' | 'CN' | 'DN'

export const DOC_TYPES: Record<DocType, {
  title: string       // printed heading
  label: string       // short name in the app
  party: string       // who the other side is
  priced: boolean     // DO carries no prices
  needsRef: boolean   // CN/DN must point at an invoice
}> = {
  PO:  { title: 'PURCHASE ORDER', label: 'Purchase Order', party: 'Supplier', priced: true,  needsRef: false },
  DO:  { title: 'DELIVERY ORDER', label: 'Delivery Order', party: 'Deliver to', priced: false, needsRef: false },
  INV: { title: 'INVOICE',        label: 'Invoice',        party: 'Bill to',  priced: true,  needsRef: false },
  CN:  { title: 'CREDIT NOTE',    label: 'Credit Note',    party: 'Customer', priced: true,  needsRef: true },
  DN:  { title: 'DEBIT NOTE',     label: 'Debit Note',     party: 'Customer', priced: true,  needsRef: true },
}
export const TYPE_KEYS = Object.keys(DOC_TYPES) as DocType[]

// draft → issued → (paid | partial) ; cancelled at any point. Issued documents
// are never edited or deleted — correct them with a credit/debit note, or cancel.
export const STATUSES = ['draft', 'issued', 'partial', 'paid', 'received', 'cancelled'] as const
export type DocStatus = (typeof STATUSES)[number]

export type Party = { name: string; address: string; attn: string; phone: string; email: string; regNo: string }
export type Line = { desc: string; qty: number; uom: string; price: number; disc: number } // disc = % off the line
export type Payment = { date: string; amount: number; method: string; ref: string }

export type BillingDoc = {
  id?: number
  type: DocType
  number: string
  status: DocStatus
  date: string          // YYYY-MM-DD
  dueDate: string       // invoices: date + terms
  terms: number         // days
  party: Party
  shipTo: string        // PO/DO delivery address if different
  refNo: string         // linked document number (CN/DN → invoice, INV → DO, DO → PO …)
  yourRef: string       // customer's own PO no. etc.
  reason: string        // CN/DN reason
  lines: Line[]
  taxRate: number       // % SST, 0 when not registered
  notes: string
  payments: Payment[]
  createdBy: string
}

export const emptyParty = (): Party => ({ name: '', address: '', attn: '', phone: '', email: '', regNo: '' })
export const emptyLine = (): Line => ({ desc: '', qty: 1, uom: 'UNIT', price: 0, disc: 0 })

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const lineAmount = (l: Line) => r2((Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.disc) || 0) / 100))

export function totals(d: Pick<BillingDoc, 'lines' | 'taxRate'>) {
  const subtotal = r2(d.lines.reduce((s, l) => s + lineAmount(l), 0))
  const tax = r2(subtotal * (Number(d.taxRate) || 0) / 100)
  return { subtotal, tax, total: r2(subtotal + tax) }
}

export const paidSum = (d: Pick<BillingDoc, 'payments'>) => r2((d.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0))

export const money = (n: number) =>
  'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0))
  return d.toISOString().slice(0, 10)
}

export const fmtDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

// "Ringgit Malaysia One Thousand Two Hundred And Cents Fifty Only" — expected on MY invoices.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function words(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' And ' + words(n % 100) : ''}`
  for (const [v, name] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']] as const) {
    if (n >= v) return `${words(Math.floor(n / v))} ${name}${n % v ? ' ' + words(n % v) : ''}`
  }
  return ''
}
export function amountInWords(n: number) {
  const whole = Math.floor(Math.abs(n))
  const cents = Math.round((Math.abs(n) - whole) * 100)
  return `Ringgit Malaysia ${whole ? words(whole) : 'Zero'}${cents ? ` And Cents ${words(cents)}` : ''} Only`
}

// Today in Malaysia, YYYY-MM-DD (browser-safe twin of todayISO in lib/records.ts).
export const todayMY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())

// A saved customer or supplier (the Contacts list on the Billing tab).
export type ContactKind = 'customer' | 'supplier' | 'both'
export type Contact = Party & { id?: number; kind: ContactKind; terms: number; notes: string }
export const emptyContact = (kind: ContactKind = 'customer'): Contact => ({ ...emptyParty(), kind, terms: 30, notes: '' })
// Which contacts suit a document: POs go to suppliers, everything else to customers.
export const contactFits = (c: Contact, type: DocType) => c.kind === 'both' || c.kind === (type === 'PO' ? 'supplier' : 'customer')

// A saved product / service (the Items list). Picking one on a document fills
// the description, unit and price.
export type Item = { id?: number; code: string; name: string; uom: string; price: number; cost: number; notes: string }
export const emptyItem = (): Item => ({ code: '', name: '', uom: 'UNIT', price: 0, cost: 0, notes: '' })
// What the Items page suggests from past Shopee / TikTok orders.
export type ItemSuggestion = { name: string; price: number; currency: string; sold: number; from: string }
