import { coverFor } from '@/lib/covers'
import { engagementFor } from '@/lib/insights'
import type { Suggestion } from '@/lib/ad-suggest'

// The "Ads suggestion" view of the Content tab: the reels most worth boosting
// on Meta, best first, each with the numbers that earned its place.
export default function AdSuggestions({ items }: { items: Suggestion[] }) {
  if (!items.length) {
    return <div className="empty">No reel has enough numbers yet (views, reach, saves) to judge for ads.</div>
  }
  return (
    <>
      <p className="cap">
        Reels ranked on how the video performed on its own — hook, saves &amp; shares, likes &amp; comments and reach,
        each compared with your typical reel. Ended giveaways are left out.
      </p>
      <ol className="as-list">
        {items.map((s, i) => {
          const r = s.row
          const thumb = (r.meta?.thumbnail_url as string | undefined) || coverFor(r.meta?.ig_id)
          const url = r.meta?.permalink as string | undefined
          const eng = engagementFor(r.meta)
          const n = (v: unknown) => (Number(v) || 0).toLocaleString('en-MY')
          return (
            <li key={r.id} className="as-item">
              <span className="as-rank">{i + 1}</span>
              <a className="as-thumb" href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="pg-ph">no cover</span>}
                {r.meta?.collab ? (
                  // Same label as the Content grid: posted from the founder's account.
                  <span className="pg-collab" title={`Posted from @${String(r.meta?.account ?? '')}`}>collab</span>
                ) : null}
              </a>
              <div className="as-body">
                <div className="as-head">
                  {url ? (
                    <a className="as-title" href={url} target="_blank" rel="noopener noreferrer">{r.title || 'Untitled'}</a>
                  ) : (
                    <span className="as-title">{r.title || 'Untitled'}</span>
                  )}
                  <span className="as-score" title="Ad fit: average of where this reel ranks on each signal, 0–100">
                    Ad fit {s.score}
                  </span>
                </div>
                <div className="as-nums">
                  {r.due_date ?? '—'} · {n(r.meta?.views)} views · {n(r.meta?.reach)} reached
                  {eng ? ` · ${n(eng.saved)} saved · ${n(eng.shares)} shared` : ''}
                </div>
                <ul className="as-why">
                  {s.strengths.map(t => <li key={t} className="good">✓ {t}</li>)}
                  {s.weaknesses.map(t => <li key={t} className="bad">⚠ {t}</li>)}
                  {!s.strengths.length && !s.weaknesses.length ? <li>Close to your typical reel on every signal — no standout strength</li> : null}
                </ul>
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}
