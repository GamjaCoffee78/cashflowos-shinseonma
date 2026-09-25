import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// Delete ONE receipt the Telegram bot filed into Cash Out (meta.source 'vault'),
// e.g. a test. Only those rows: bank / sheet imports can never be deleted here
// (CLAUDE.md — never blanket-delete records; one row, by id). Its stored file
// and vault_files row go too.
export const dynamic = 'force-dynamic'

const bad = (message: string) => NextResponse.json({ ok: false, message }, { status: 400 })

export async function POST(req: Request) {
  if (!supabaseConfigured) return bad('The database is not connected.')
  const body = await req.json().catch(() => ({}))
  const id = Number(body?.id)
  if (body?.action !== 'delete' || !Number.isInteger(id) || id <= 0) return bad('Which receipt?')
  const { data: row } = await supabase.from('records').select('id, category, meta').eq('id', id).maybeSingle()
  if (!row || row.category !== 'cash_out' || row.meta?.source !== 'vault') return bad('Only receipts filed through the Telegram bot can be deleted here.')
  const { data: files } = await supabase.from('vault_files').select('id, storage_path').eq('record_id', id)
  const { error } = await supabase.from('records').delete().eq('id', id).eq('category', 'cash_out')
  if (error) return bad(`Couldn't delete: ${error.message}`)
  for (const f of files ?? []) {
    await supabase.from('vault_files').delete().eq('id', f.id)
    if (f.storage_path) await supabase.storage.from('vault').remove([f.storage_path])
  }
  revalidatePath('/cash-out'); revalidatePath('/vault'); revalidatePath('/')
  return NextResponse.json({ ok: true, message: 'Receipt deleted.' })
}
