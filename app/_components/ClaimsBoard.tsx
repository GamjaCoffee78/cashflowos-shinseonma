'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type Claim = {
  id: number; claimant: string; amount: number; date: string; merchant: string; type: string; note: string
  status: 'to_claim' | 'approved' | 'paid' | 'rejected'; check: boolean; mime: string; url: string | null; paidRef: string
}

const LABEL: Record<Claim['status'], string> = { to_claim: 'To claim', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' }
const PILL: Record<Claim['status'], string> = { to_claim: 'pending', approved: 'open', paid: 'paid', rejected: 'rejected' }
const TYPES = ['Transport', 'Meals', 'Supplies', 'Ingredients', 'Parking & toll', 'Postage', 'Other']
const rm = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) { return { ok: false, message: String((e as Error)?.message || e) } }
}

export default function ClaimsBoard({ claims }: { claims: Claim[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [who, setWho] = useState('All')
  const [status, setStatus] = useState<'open' | Claim['status'] | 'all'>('open')
  const [edit, setEdit] = useState<Claim | null>(null)
  const [msg, setMsg] = useState('')

  const people = useMemo(() => ['All', ...new Set(claims.map(c => c.claimant))], [claims])
  const shown = claims.filter(c => (who === 'All' || c.claimant === who)
    && (status === 'all' ? true : status === 'open' ? c.status === 'to_claim' || c.status === 'approved' : c.status === status))

  // Who is owed what: to claim + approved, not yet paid.
  const owed = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of claims) if (c.status === 'to_claim' || c.status === 'approved') m.set(c.claimant, (m.get(c.claimant) ?? 0) + c.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [claims])
  const owedTotal = owed.reduce((s, [, v]) => s + v, 0)
  const paidMonth = claims.filter(c => c.status === 'paid' && c.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, c) => s + c.amount, 0)

  const run = (body: object, after?: () => void) => start(async () => {
    const r = await post(body)
    setMsg(r.message)
    if (r.ok) { after?.(); router.refresh() }
  })

  return (
    <div className="cl">
      <div className="bl-stats">
        <div className="bl-stat"><span>Owed to staff</span><b>{rm(owedTotal)}</b><small>{claims.filter(c => c.status === 'to_claim' || c.status === 'approved').length} open claims</small></div>
        <div className="bl-stat"><span>Waiting to check</span><b>{claims.filter(c => c.status === 'to_claim').length}</b><small>{claims.filter(c => c.check).length} need the amount checked</small></div>
        <div className="bl-stat"><span>Paid this month</span><b>{rm(paidMonth)}</b><small>by receipt date</small></div>
      </div>

      {owed.length ? (
        <div className="cl-owed">
          {owed.map(([name, v]) => <button type="button" key={name} className={`cl-person${who === name ? ' on' : ''}`} onClick={() => setWho(who === name ? 'All' : name)}><b>{name}</b> {rm(v)}</button>)}
        </div>
      ) : null}

      <div className="bl-filter">
        {(['open', 'to_claim', 'approved', 'paid', 'rejected', 'all'] as const).map(k => (
          <button type="button" key={k} className={`bl-chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>
            {k === 'open' ? 'Open' : k === 'all' ? 'All' : LABEL[k]}
          </button>
        ))}
        <select className="bl-input" value={who} onChange={e => setWho(e.target.value)}>{people.map(p => <option key={p}>{p}</option>)}</select>
      </div>
      {msg ? <p className="bl-msg" style={{ textAlign: 'left' }}>{msg}</p> : null}

      {shown.length === 0 ? (
        <p className="empty">{claims.length ? 'Nothing here with these filters.' : 'No claims yet — send a receipt to the Telegram bot with "claim" in the caption.'}</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Date</th><th>Who</th><th>What</th><th>Amount</th><th>Status</th><th>Receipt</th><th /></tr></thead>
          <tbody>
            {shown.map(c => (
              <tr key={c.id}>
                <td data-label="Date">{fmt(c.date)}</td>
                <td data-label="Who"><b>{c.claimant}</b></td>
                <td data-label="What">{c.merchant || '—'}{c.type ? <small className="bl-dim"> · {c.type}</small> : null}{c.note ? <><br /><small className="bl-dim">{c.note}</small></> : null}</td>
                <td data-label="Amount"><b>{rm(c.amount)}</b>{c.check ? <><br /><span className="pill overdue">check amount</span></> : null}</td>
                <td data-label="Status"><span className={`pill ${PILL[c.status]}`}>{LABEL[c.status]}</span>{c.paidRef ? <><br /><small className="bl-dim">{c.paidRef}</small></> : null}</td>
                <td data-label="Receipt">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="cl-thumb">{c.mime.startsWith('image/') ? <img src={c.url} alt="Receipt" /> : '📄 PDF'}</a> : '—'}</td>
                <td data-label="">
                  <span className="bc-acts">
                    <button type="button" className="btn ghost" onClick={() => { setMsg(''); setEdit({ ...c }) }}>✏️ Edit</button>
                    {c.status === 'to_claim' ? <button type="button" className="btn ghost" disabled={pending} onClick={() => run({ action: 'status', id: c.id, to: 'approved' })}>✓ Approve</button> : null}
                    {c.status === 'to_claim' || c.status === 'approved' ? <button type="button" className="btn" disabled={pending} onClick={() => {
                      const ref = prompt(`Mark ${rm(c.amount)} to ${c.claimant} as paid?\n\nPayment reference (optional, e.g. bank ref):`)
                      if (ref !== null) run({ action: 'status', id: c.id, to: 'paid', ref })
                    }}>💰 Paid</button> : null}
                    {c.status === 'to_claim' || c.status === 'approved' ? <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => confirm(`Reject this claim from ${c.claimant}?`) && run({ action: 'status', id: c.id, to: 'rejected' })}>Reject</button> : null}
                    {c.status === 'paid' || c.status === 'rejected' ? <button type="button" className="btn ghost" disabled={pending} onClick={() => run({ action: 'status', id: c.id, to: 'to_claim' })}>↺ Reopen</button> : null}
                    <button type="button" className="btn ghost bl-cancel" disabled={pending} onClick={() => confirm(`Delete this claim and its receipt? This can't be undone.`) && run({ action: 'delete', id: c.id })}>🗑</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edit ? (
        <div className="gc-modal" onMouseDown={e => { if (e.target === e.currentTarget) setEdit(null) }}>
          <form className="gc-form" onSubmit={e => { e.preventDefault(); run({ action: 'update', ...edit, id: edit.id }, () => setEdit(null)) }}>
            <b style={{ fontSize: 18 }}>Edit claim</b>
            {edit.url && edit.mime.startsWith('image/') ? <a href={edit.url} target="_blank" rel="noreferrer"><img src={edit.url} alt="Receipt" className="cl-big" /></a> : null}
            <div className="bf-grid bf">
              <label>Who<input value={edit.claimant} onChange={e => setEdit({ ...edit, claimant: e.target.value })} /></label>
              <label>Amount (RM)<input type="number" step="0.01" min={0} value={edit.amount} onChange={e => setEdit({ ...edit, amount: Number(e.target.value) })} /></label>
              <label>Receipt date<input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></label>
              <label>Shop / merchant<input value={edit.merchant} onChange={e => setEdit({ ...edit, merchant: e.target.value })} /></label>
              <label>Type
                <select value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>
                  <option value="">—</option>{TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="bf-wide">Note<input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="What was it for?" /></label>
            </div>
            {msg ? <p className="gc-msg">{msg}</p> : null}
            <div className="gc-actions">
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="submit" className="btn" disabled={pending}>Save</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
