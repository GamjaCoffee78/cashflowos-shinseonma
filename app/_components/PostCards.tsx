import { type Rec, m } from '@/lib/records'
import { coverFor } from '@/lib/covers'
import { engagementFor } from '@/lib/insights'

// The posts themselves, as cards you can click straight through to the post.
//
// The cover comes from one of two places, in order: a `meta.thumbnail_url` on
// the row, or a file committed at public/covers/<ig_id>.jpg.
//
// The committed file is the reliable one. Instagram's CDN links are signed and
// expire within days, so a URL saved in the database is a broken image on a
// timer; the files were fetched once from the Graph API and now need no token
// and no refresh. A post with neither gets a labelled placeholder, never a
// broken picture.
const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

const monthTitle = (d: string | null) => {
  if (!d) return 'No date'
  const [y, mo] = d.split('-')
  return `${MONTHS[Number(mo) - 1]} ${y}`
}

// Cards in month blocks when they're in date order — a heading every few rows
// gives the eye somewhere to land, and answers "when was this?" without reading
// each date. In views order the months are interleaved and a heading would lie,
// so the grid runs flat instead.
export default function PostCards({ rows, byMonth }: { rows: Rec[]; byMonth?: boolean }) {
  if (!byMonth) return <Grid rows={rows} />

  const blocks: { title: string; rows: Rec[] }[] = []
  for (const r of rows) {
    const title = monthTitle(r.due_date)
    const last = blocks[blocks.length - 1]
    if (last && last.title === title) last.rows.push(r)
    else blocks.push({ title, rows: [r] })
  }

  return (
    <>
      {blocks.map(b => (
        <section key={b.title} className="pg-month">
          <h3>{b.title}</h3>
          <Grid rows={b.rows} />
        </section>
      ))}
    </>
  )
}

function Grid({ rows }: { rows: Rec[] }) {
  return (
    <div className="pg">
      {rows.map(r => {
        const thumb = (r.meta?.thumbnail_url as string | undefined) || coverFor(r.meta?.ig_id)
        const url = r.meta?.permalink as string | undefined
        const eng = engagementFor(r.meta)
        const views = r.meta?.views
        const status = (r.status || '').toLowerCase()
        const inner = (
          <>
            <span className="pg-thumb">
              {thumb ? (
                // Plain <img>, not next/image: a committed file needs no
                // optimiser, and a third-party URL that has expired should
                // degrade to empty space rather than fail a build.
                <img src={thumb} alt="" loading="lazy" />
              ) : (
                <span className="pg-ph">no cover</span>
              )}
              <span className="pg-chip">{m(r, 'format')}</span>
              {r.meta?.collab ? (
                // Posted from the founder's account rather than the brand's.
                // Worth marking: that account is nearly three times the size,
                // so these reach further for reasons the brand page can't
                // claim credit for.
                <span className="pg-collab" title={`Posted from @${String(r.meta?.account ?? '')}`}>
                  collab
                </span>
              ) : null}
            </span>

            <span className="pg-body">
              <span className="pg-title">{r.title || 'Untitled'}</span>
              <span className="pg-meta">
                <span className="pg-views">
                  {views != null ? Number(views).toLocaleString('en-MY') : '—'}
                </span>
                <span className="pg-date">{r.due_date ?? '—'}</span>
              </span>
              {eng ? (
                // Saves and shares, not likes: a like is a reflex, a save is
                // intent and a share is reach you didn't pay for.
                <span className="pg-eng">
                  {eng.saved.toLocaleString('en-MY')} saved
                  <span aria-hidden="true"> · </span>
                  {eng.shares.toLocaleString('en-MY')} shared
                </span>
              ) : null}

              {status && status !== 'posted' ? (
                <span className={`pill ${status}`}>{r.status}</span>
              ) : null}
            </span>
          </>
        )

        // Only a posted item has somewhere to go; a draft is just a card.
        return url ? (
          <a key={r.id} className="pg-card" href={url} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <div key={r.id} className="pg-card">{inner}</div>
        )
      })}
    </div>
  )
}
