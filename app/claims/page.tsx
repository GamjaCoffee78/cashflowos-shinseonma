import { supabase, supabaseConfigured } from '@/lib/supabase'
import { getRecords } from '@/lib/records'
import ClaimsBoard, { type Claim } from '@/app/_components/ClaimsBoard'

export const dynamic = 'force-dynamic'

// 👉 Claims 🧾 — staff claims. Everyone sends a receipt photo / PDF to the
//    Telegram bot with "claim" in the caption; it lands here under their name
//    (category='claim', set by app/api/telegram/route.ts → fileClaim). Receipts
//    stay in the private vault bucket and open through 1-hour signed links.
//    Separate from Cash Out: a claim is money owed to a person, not spend filed.

export default async function Claims() {
  const rows = (await getRecords()).filter(r => r.category === 'claim')
  const claims: Claim[] = await Promise.all(rows.map(async r => {
    let url: string | null = null
    if (supabaseConfigured && r.meta?.storage_path) {
      const { data } = await supabase.storage.from('vault').createSignedUrl(r.meta.storage_path, 3600)
      url = data?.signedUrl ?? null
    }
    return {
      id: r.id,
      claimant: String(r.meta?.claimant || 'Someone'),
      amount: Number(r.amount || 0),
      date: r.due_date || r.created_at.slice(0, 10),
      merchant: String(r.meta?.merchant || ''),
      type: String(r.meta?.expense_type || ''),
      note: r.notes || '',
      status: (r.status as Claim['status']) || 'to_claim',
      check: !!r.meta?.check_amount,
      mime: String(r.meta?.mime || ''),
      url,
      paidRef: String(r.meta?.paid_ref || ''),
    }
  }))
  claims.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <>
      <h1 className="ph">Claims 🧾</h1>
      <p className="cap">Staff claims from receipts sent to the Telegram bot — check them, approve, and mark paid.</p>
      <div className="cl-how">
        <b>How to claim:</b> send the receipt photo or PDF to the Okmaya Telegram bot and write <code>claim</code> in the caption
        (e.g. <code>claim Grab to supplier</code>). It appears here under your name within seconds.
      </div>
      <ClaimsBoard claims={claims} />
    </>
  )
}
