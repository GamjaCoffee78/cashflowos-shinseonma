'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ITEM_COLORS } from '@/lib/item-colors'

// The buttons on the Production Timeline. Each POSTs to /api/production and
// refreshes the page. (A plain route, not a server action — see SyncNow.tsx.)
async function post(body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json().catch(() => null)) ?? { ok: false, message: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message || e) }
  }
}

// ✓ Done / Undo, and 📅 Move to another date — one row's controls.
export function ItemActions({ id, done, date, title, color = '' }: { id: number; done: boolean; date: string; title: string; color?: string }) {
  const [painting, setPainting] = useState(false)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [moving, setMoving] = useState(false)
  const [newDate, setNewDate] = useState(date)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(title)

  const run = (body: object) =>
    start(async () => {
      const r = await post(body)
      if (!r.ok) return setErr(r.message)
      // Saved — but say so if the Google Sheet couldn't be updated.
      setErr(r.message.includes('⚠️') ? r.message.replace('⚠️', '').trim() : '')
      setMoving(false)
      setEditing(false)
      router.refresh()
    })

  if (editing) {
    return (
      <span className="pt-act pt-edit">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run({ action: 'edit', id, title: text }); if (e.key === 'Escape') setEditing(false) }}
          aria-label="Edit text"
          autoFocus
        />
        <button type="button" className="pt-btn on" disabled={pending || !text.trim()} onClick={() => run({ action: 'edit', id, title: text })}>Save</button>
        <button type="button" className="pt-btn" onClick={() => { setText(title); setEditing(false) }}>Cancel</button>
        {pending ? <span className="cap"> saving…</span> : null}
        {err ? <span className="cap" role="alert"> ⚠️ {err}</span> : null}
      </span>
    )
  }

  return (
    <span className="pt-act">
      <button type="button" className="pt-btn" disabled={pending} onClick={() => { setText(title); setEditing(true) }}>
        ✏️ Edit
      </button>
      <button
        type="button"
        className={`pt-btn${done ? ' on' : ''}`}
        disabled={pending}
        onClick={() => run({ action: done ? 'undo' : 'done', id })}
        title={done ? 'Mark as not done' : 'Mark as done'}
      >
        {done ? '✓ Done' : '✓ Mark done'}
      </button>
      {!moving ? (
        <button type="button" className="pt-btn" disabled={pending} onClick={() => setMoving(true)}>
          📅 Move
        </button>
      ) : null}
      {moving ? (
        <span className="pt-move">
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} aria-label="New date" />
          <button type="button" className="pt-btn on" disabled={pending || !newDate} onClick={() => run({ action: 'move', id, date: newDate })}>
            Save
          </button>
          <button type="button" className="pt-btn" onClick={() => setMoving(false)}>Cancel</button>
        </span>
      ) : null}
      <button type="button" className="pt-btn" disabled={pending} onClick={() => setPainting(v => !v)} title="Colour">
        🎨 Colour
      </button>
      {painting ? (
        <span className="pt-palette" role="group" aria-label="Pick a colour">
          {ITEM_COLORS.map(c => (
            <button key={c.key} type="button" className={`pt-swatch${color === c.key ? ' on' : ''}`} style={{ background: c.fg }}
              title={c.label} aria-label={c.label} disabled={pending}
              onClick={() => { setPainting(false); run({ action: 'color', id, color: c.key }) }} />
          ))}
          <button type="button" className="pt-btn" disabled={pending || !color} onClick={() => { setPainting(false); run({ action: 'color', id, color: '' }) }}>No colour</button>
        </span>
      ) : null}
      <button
        type="button"
        className="pt-btn pt-del"
        disabled={pending}
        onClick={() => confirm(`Delete "${title}"?\n\nIt is also removed from the Google Sheet calendar.`) && run({ action: 'delete', id })}
      >
        🗑 Delete
      </button>
      {pending ? <span className="cap"> saving…</span> : null}
      {err ? <span className="cap" role="alert"> ⚠️ {err}</span> : null}
    </span>
  )
}

// ＋ New task — a name and a date.
export function AddTask({
  defaultDate, category = 'production', basePath = '/production', placeholder = 'e.g. [FM Order] Pack 200 tofu paste', label = '＋ New task',
}: { defaultDate: string; category?: string; basePath?: string; placeholder?: string; label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [msg, setMsg] = useState('')
  const [channels, setChannels] = useState<string[]>(['IGR'])
  const social = category === 'social_plan'

  if (!open) {
    return (
      <button type="button" className="btn sync" onClick={() => setOpen(true)}>{label}</button>
    )
  }
  return (
    <form
      className="pt-add"
      onSubmit={e => {
        e.preventDefault()
        start(async () => {
          if (social && !channels.length) return setMsg('Tick at least one channel.')
          const r = await post({ action: 'add', title: withChannels(category, channels, title), date, category })
          if (!r.ok) return setMsg(r.message)
          if (r.message.includes('⚠️')) alert(r.message)
          setMsg('')
          setTitle('')
          setOpen(false)
          router.push(`${basePath}?m=${date.slice(0, 7)}`)
          router.refresh()
        })
      }}
    >
      {social ? <ChannelPicker value={channels} onChange={setChannels} /> : null}
      <input
        type="text"
        placeholder={placeholder}
        value={title}
        onChange={e => setTitle(e.target.value)}
        aria-label="Task"
        autoFocus
        required
      />
      <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" required />
      <button type="submit" className="btn sync" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      {msg ? <span className="cap" role="alert">⚠️ {msg}</span> : null}
    </form>
  )
}


// The Social Calendar's channels. Ticked ones become the post's tag,
// "[IGR/IGST] Seaweed Soup", which the sheet uses to pick the channel rows.
const CHANNELS = [
  { key: 'IGF', label: 'IGF · feed' },
  { key: 'IGR', label: 'IGR · reels' },
  { key: 'IGST', label: 'IGST · stories' },
]
function ChannelPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <span className="pt-channels" role="group" aria-label="Channels">
      {CHANNELS.map(c => (
        <label key={c.key} className={value.includes(c.key) ? 'on' : ''}>
          <input type="checkbox" checked={value.includes(c.key)}
            onChange={e => onChange(e.target.checked ? CHANNELS.map(x => x.key).filter(k => k === c.key || value.includes(k)) : value.filter(k => k !== c.key))} />
          {c.label}
        </label>
      ))}
    </span>
  )
}
const withChannels = (category: string, channels: string[], title: string) =>
  category === 'social_plan' && channels.length ? `[${channels.join('/')}] ${title.replace(/^\s*\[[^\]]*\]\s*/, '')}` : title

// ＋ on a calendar day: add an item on THAT date without picking it again.
export function DayAdd({ date, category = 'production', label }: { date: string; category?: string; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [channels, setChannels] = useState<string[]>(['IGR'])
  const [msg, setMsg] = useState('')
  const social = category === 'social_plan'
  if (!open) {
    return <button type="button" className="cal-add" title={`Add on ${label}`} aria-label={`Add on ${label}`} onClick={() => setOpen(true)}>＋</button>
  }
  return (
    <form
      className="cal-addform"
      onSubmit={e => {
        e.preventDefault()
        start(async () => {
          if (social && !channels.length) return setMsg('Tick at least one channel.')
          const r = await post({ action: 'add', title: withChannels(category, channels, title), date, category })
          if (!r.ok) return setMsg(r.message)
          if (r.message.includes('⚠️')) alert(r.message)
          setTitle(''); setMsg(''); setOpen(false)
          router.refresh()
        })
      }}
    >
      <b>{label}</b>
      {social ? <ChannelPicker value={channels} onChange={setChannels} /> : null}
      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={social ? 'What are we posting?' : "What's happening?"} aria-label="Title" autoFocus required />
      <span className="btnrow">
        <button type="submit" className="btn sync" disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {msg ? <span className="cap" role="alert">⚠️ {msg}</span> : null}
    </form>
  )
}

// 💡 Content ideas — the Social Calendar's notebook. Write an idea now, give it
// a date later (📅 Schedule turns it into a post on the calendar), or drop it.
export type Idea = { id: number; title: string; notes: string | null; status: string; created: string }

export function IdeasBoard({ ideas, today }: { ideas: Idea[]; today: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [scheduling, setScheduling] = useState<number | null>(null)
  const [date, setDate] = useState(today)
  const [showDropped, setShowDropped] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eNotes, setENotes] = useState('')

  const run = (body: object, after?: () => void) =>
    start(async () => {
      const r = await post(body)
      if (!r.ok) return setMsg(r.message)
      setMsg(r.message.includes('⚠️') ? r.message : '')
      after?.()
      router.refresh()
    })

  const open = ideas.filter(i => i.status !== 'dropped')
  const dropped = ideas.filter(i => i.status === 'dropped')

  return (
    <section className="ideas">
      <div className="ideas-head">
        <h2>💡 Content ideas</h2>
        <span className="cap" style={{ margin: 0 }}>{open.length} waiting · give one a date to put it on the calendar</span>
      </div>
      <form
        className="pt-add"
        onSubmit={e => {
          e.preventDefault()
          run({ action: 'idea_add', title, notes }, () => { setTitle(''); setNotes('') })
        }}
      >
        <input type="text" placeholder="The idea — e.g. Sundubu in 5 minutes, office lunch hack" value={title} onChange={e => setTitle(e.target.value)} aria-label="Idea" required />
        <input type="text" placeholder="Notes (optional): hook, channel, product…" value={notes} onChange={e => setNotes(e.target.value)} aria-label="Notes" />
        <button type="submit" className="btn sync" disabled={pending}>{pending ? 'Saving…' : '＋ Add idea'}</button>
      </form>
      {msg ? <p className="cap" role="alert">⚠️ {msg.replace('⚠️', '').trim()}</p> : null}
      {open.length === 0 ? (
        <p className="cap">No ideas yet — write the first one above.</p>
      ) : (
        <ul className="ideas-list">
          {open.map(i => (
            <li key={i.id}>
              {editing === i.id ? (
                <span className="pt-act pt-edit">
                  <input type="text" value={eTitle} onChange={e => setETitle(e.target.value)} aria-label="Idea" autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }} />
                  <input type="text" value={eNotes} onChange={e => setENotes(e.target.value)} aria-label="Notes" placeholder="Notes (optional)"
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }} />
                  <button type="button" className="pt-btn on" disabled={pending || !eTitle.trim()}
                    onClick={() => run({ action: 'edit', id: i.id, title: eTitle, notes: eNotes }, () => setEditing(null))}>Save</button>
                  <button type="button" className="pt-btn" onClick={() => setEditing(null)}>Cancel</button>
                </span>
              ) : (
              <>
              <div className="ideas-text">
                <b>{i.title}</b>
                {i.notes ? <span className="cap" style={{ margin: 0 }}>{i.notes}</span> : null}
              </div>
              <span className="pt-act">
                {scheduling === i.id ? (
                  <span className="pt-move">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Post date" />
                    <button type="button" className="pt-btn on" disabled={pending || !date} onClick={() => run({ action: 'idea_schedule', id: i.id, date }, () => setScheduling(null))}>Save</button>
                    <button type="button" className="pt-btn" onClick={() => setScheduling(null)}>Cancel</button>
                  </span>
                ) : (
                  <>
                    <button type="button" className="pt-btn" disabled={pending} onClick={() => { setETitle(i.title); setENotes(i.notes ?? ''); setEditing(i.id) }}>✏️ Edit</button>
                    <button type="button" className="pt-btn" disabled={pending} onClick={() => { setDate(today); setScheduling(i.id) }}>📅 Schedule</button>
                    <button type="button" className="pt-btn pt-del" disabled={pending} onClick={() => confirm(`Delete the idea "${i.title}"?`) && run({ action: 'delete', id: i.id })}>🗑 Delete</button>
                  </>
                )}
              </span>
              </>
              )}
            </li>
          ))}
        </ul>
      )}
      {dropped.length ? (
        <p className="cap">
          <button type="button" className="pt-btn" onClick={() => setShowDropped(v => !v)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
        </p>
      ) : null}
      {showDropped ? (
        <ul className="ideas-list dropped">
          {dropped.map(i => (
            <li key={i.id}>
              <div className="ideas-text"><b>{i.title}</b></div>
              <button type="button" className="pt-btn" disabled={pending} onClick={() => run({ action: 'idea_restore', id: i.id })}>↩ Bring back</button>
              <button type="button" className="pt-btn pt-del" disabled={pending} onClick={() => confirm(`Delete the idea "${i.title}"?`) && run({ action: 'delete', id: i.id })}>🗑 Delete</button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
