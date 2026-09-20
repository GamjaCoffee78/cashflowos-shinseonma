import { type Rec, m } from '@/lib/records'

// The posts themselves, as cards you can click straight through to the post.
//
// The cover image comes from `meta.thumbnail_url` when the import saved one.
// Nothing does yet — the Instagram import keeps the permalink and the numbers,
// not the image — so most cards show a labelled placeholder instead of a broken
// picture. The slot is real; fill `thumbnail_url` at import time and covers
// appear with no change here.
export default function PostCards({ rows }: { rows: Rec[] }) {
  return (
    <div className="pg">
      {rows.map(r => {
        const thumb = r.meta?.thumbnail_url as string | undefined
        const url = r.meta?.permalink as string | undefined
        const views = r.meta?.views
        const status = (r.status || '').toLowerCase()
        const inner = (
          <>
            <span className="pg-thumb">
              {thumb ? (
                // Plain <img>: these are third-party URLs that expire, and a
                // broken one should degrade to empty space, not a build error.
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
