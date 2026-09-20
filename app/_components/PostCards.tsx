import { type Rec, m } from '@/lib/records'
import { coverFor } from '@/lib/covers'

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
export default function PostCards({ rows }: { rows: Rec[] }) {
  return (
    <div className="pg">
      {rows.map(r => {
        const thumb = (r.meta?.thumbnail_url as string | undefined) || coverFor(r.meta?.ig_id)
        const url = r.meta?.permalink as string | undefined
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
            </span>

            <span className="pg-body">
              <span className="pg-title">{r.title || 'Untitled'}</span>
              <span className="pg-meta">
                <span className="pg-views">
                  {views != null ? Number(views).toLocaleString('en-MY') : '—'}
                </span>
                <span className="pg-date">{r.due_date ?? '—'}</span>
              </span>
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
