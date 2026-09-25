import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// The Claims tab's writes. Claims arrive from the Telegram bot (a receipt sent
// with "claim" in the caption → a category='claim' row). Here they are checked
// and moved along: to_claim → approved → paid (or rejected). One row by id only.
// Nothing here touches Cash Out.

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['to_claim', 'approved', 'paid', 'rejected'] as const
const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })
const s = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max)

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const action = s(body?.action)
  const id = Number(body?.id)
  const { data: row } = await supabase.from('records').select('id, title, meta').eq('id', id).eq('category', 'claim').maybeSingle()
  if (!row) return bad('That claim no longer exists.')
  const now = new Date().toISOString()
  const done = (message: string) => { revalidatePath('/claims'); return NextResponse.json({ ok: true, message }) }

  if (action === 'update') {
    const amount = Math.round(Number(body?.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount < 0) return bad('Enter the amount.')
    const date = s(body?.date)
    if (!ISO.test(date)) return bad('Pick the receipt date.')
    const claimant = s(body?.claimant, 80) || row.meta?.claimant || 'Someone'
    const merchant = s(body?.merchant, 120)
    const meta = { ...row.meta, claimant, merchant: merchant || undefined, expense_type: s(body?.type, 60) || undefined, check_amount: undefined, edited_at: now }
    const { error } = await supabase.from('records').update({
      amount, due_date: date, notes: s(body?.note, 300) || null, meta,
      title: `Claim · ${claimant}${merchant ? ` · ${merchant}` : ''}`,
    }).eq('id', id).eq('category', 'claim')
    if (error) return bad(`Couldn't save: ${error.message}`)
    return done('Saved.')
  }

  if (action === 'status') {
    const to = s(body?.to) as (typeof STATUSES)[number]
    if (!STATUSES.includes(to)) return bad('Unknown status.')
    const meta = { ...row.meta, [`${to}_at`]: now, ...(to === 'paid' ? { paid_ref: s(body?.ref, 120) || undefined } : {}) }
    const { error } = await supabase.from('records').update({ status: to, meta }).eq('id', id).eq('category', 'claim')
    if (error) return bad(`Couldn't save: ${error.message}`)
    return done({ to_claim: 'Back to "to claim".', approved: 'Approved.', paid: 'Marked paid.', rejected: 'Rejected.' }[to])
  }

  if (action === 'delete') {
    const path = row.meta?.storage_path
    const { error } = await supabase.from('records').delete().eq('id', id).eq('category', 'claim')
    if (error) return bad(`Couldn't delete: ${error.message}`)
    if (row.meta?.sha256) await supabase.from('vault_files').delete().eq('sha256', row.meta.sha256).eq('record_id', id)
    if (path) await supabase.storage.from('vault').remove([path])
    return done('Claim deleted.')
  }

  return bad('Unknown action.')
}
