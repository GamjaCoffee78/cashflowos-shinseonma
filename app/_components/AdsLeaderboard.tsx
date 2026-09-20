import Link from 'next/link'
import { type AdRow, type Window, type AdMetrics, ranked, callouts, ctrOf, cpcOf, cur, prev, emptyMetrics } from '@/lib/ads-leaderboard'
import { compact } from '@/lib/ads-daily'

// The per-ad section of an ad-platform tab: 🏆 Top 3, plain-English callouts,
// then every ad grouped by campaign in a sortable leaderboard. Server-rendered;
// the 7d/30d toggle and column sorting are plain links (?w=…&s=…&d=…), so it
// works with no JavaScript and matches the rest of the app.

type SortKey = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'views'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'views', label: 'Video views' },
]
const val = (m: AdMetrics, k: SortKey) =>
  k === 'ctr' ? ctrOf(m) : k === 'cpc' ? cpcOf(m) : k === 'views' ? m.video_views : m[k]

const rm2 = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => `${n.toFixed(2)}%`

// Change vs the previous window, as a small arrow. `up` = a rise is good.
function Delta({ now, before, up = true }: { now: number; before: number; up?: boolean | null }) {
  if (!before && !now) return null
  if (!before) return <span className="dlt flat" title="nothing in the previous period">new</span>
  const diff = now - before
  if (Math.abs(diff) < 1e-9) return <span className="dlt flat">–</span>
  const better = up === null ? null : (diff > 0) === up
  return (
    <span className={`dlt ${better === null ? 'flat' : better ? 'good' : 'bad'}`} title="vs previous period">
      {diff > 0 ? '▲' : '▼'} {Math.abs(Math.round((diff / before) * 100))}%
    </span>
  )
}

function Thumb({ ad, big }: { ad: AdRow; big?: boolean }) {
  const cls = `lb-thumb${big ? ' big' : ''}`
  // eslint-disable-next-line @next/next/no-img-element
  return ad.thumbnail ? <img className={cls} src={ad.thumbnail} alt="" /> : <span className={`${cls} ph`} aria-hidden="true">🎬</span>
}

export default function AdsLeaderboard({
  rows,
  basePath,
  w,
  s,
  d,
}: {
  rows: AdRow[]
  basePath: string          // "/tiktok-ads"
  w: Window
  s: SortKey
  d: 'asc' | 'desc'
}) {
  if (!rows.length) return null
  const href = (q: Partial<{ w: Window; s: SortKey; d: 'asc' | 'desc' }>) => {
    const p = new URLSearchParams({ w, s, d, ...q } as Record<string, string>)
    return `${basePath}?${p}`
  }
  const top = ranked(rows, w).slice(0, 3)
  const notes = callouts(rows, w)
  const medals = ['🥇', '🥈', '🥉']

  // Campaign groups, ordered by spend in the window; ads sorted as requested,
  // ads that didn't run in the window sink to the bottom.
  const groups = new Map<string, AdRow[]>()
  for (const r of rows) groups.set(r.campaign || '(no campaign)', [...(groups.get(r.campaign || '(no campaign)') ?? []), r])
  const sum = (list: AdRow[]) => list.reduce((t, r) => { const c = cur(r, w); t.spend += c.spend; t.impressions += c.impressions; t.clicks += c.clicks; t.video_views += c.video_views; t.conversions += c.conversions; return t }, emptyMetrics())
  const ordered = [...groups.entries()].sort(([, a], [, b]) => sum(b).spend - sum(a).spend)
  const sortAds = (list: AdRow[]) =>
    [...list].sort((a, b) => {
      const ra = cur(a, w).impressions > 0 ? 0 : 1, rb = cur(b, w).impressions > 0 ? 0 : 1
      if (ra !== rb) return ra - rb
      const diff = val(cur(a, w), s) - val(cur(b, w), s)
      return d === 'asc' ? diff : -diff
    })
  const arrow = (k: SortKey) => (s === k ? (d === 'desc' ? ' ↓' : ' ↑') : '')
  const flip = (k: SortKey): 'asc' | 'desc' => (s === k && d === 'desc' ? 'asc' : 'desc')

  return (
    <section className="lb">
      <div className="lb-head">
        <h2 className="ph" style={{ fontSize: 18 }}>Ads — which ones are working</h2>
        <div className="lb-toggle" role="tablist" aria-label="Period">
          <Link href={href({ w: '7' })} className={w === '7' ? 'on' : ''} role="tab" aria-selected={w === '7'}>7 days</Link>
          <Link href={href({ w: '30' })} className={w === '30' ? 'on' : ''} role="tab" aria-selected={w === '30'}>30 days</Link>
        </div>
      </div>
      <p className="cap">Ranked by CTR (clicks ÷ impressions). Ads need at least 500 impressions in the period to be ranked.</p>

      {top.length ? (
        <div className="lb-top">
          {top.map((ad, i) => {
            const c = cur(ad, w)
            return (
              <div className={`lb-card rank${i + 1}`} key={ad.ad_id}>
                <div className="lb-card-head">
                  <span className="lb-medal" aria-label={`Rank ${i + 1}`}>{medals[i]}</span>
                  <Thumb ad={ad} big />
                </div>
                <p className="lb-name" title={ad.name}>{ad.name}</p>
                <p className="lb-camp" title={ad.campaign}>{ad.campaign && ad.campaign !== ad.name ? ad.campaign : ad.adset && ad.adset !== ad.name ? ad.adset : '\u00a0'}</p>
                <div className="lb-nums">
                  <div><span className="l">CTR</span><span className="v">{pct(ctrOf(c))} <Delta now={ctrOf(c)} before={ctrOf(prev(ad, w))} /></span></div>
                  <div><span className="l">Spend</span><span className="v">{rm2(c.spend)}</span></div>
                  <div><span className="l">Clicks</span><span className="v">{compact(c.clicks)}</span></div>
                  <div><span className="l">CPC</span><span className="v">{rm2(cpcOf(c))} <Delta now={cpcOf(c)} before={cpcOf(prev(ad, w))} up={false} /></span></div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty">No ad reached 500 impressions in the last {w} days.</div>
      )}

      {notes.length ? (
        <ul className="lb-notes">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      ) : null}

      {ordered.map(([campaign, list]) => {
        const t = sum(list)
        return (
          <details className="lb-group" key={campaign} open={t.impressions > 0}>
            <summary>
              <span className="lb-group-name">{campaign}</span>
              <span className="lb-group-sum">
                {list.length} ad{list.length === 1 ? '' : 's'} · {rm2(t.spend)} · {compact(t.impressions)} impr · {compact(t.clicks)} clicks · CTR {pct(ctrOf(t))}
              </span>
            </summary>
            <table className="tbl lb-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  {SORTS.map(c => (
                    <th key={c.key}><Link href={href({ s: c.key, d: flip(c.key) })}>{c.label}{arrow(c.key)}</Link></th>
                  ))}
                  <th>CTR vs prev</th>
                </tr>
              </thead>
              <tbody>
                {sortAds(list).map(ad => {
                  const c = cur(ad, w), p = prev(ad, w)
                  const idle = c.impressions === 0
                  return (
                    <tr key={ad.ad_id} className={idle || ad.status !== 'active' ? 'lb-idle' : ''}>
                      <td data-label="Ad">
                        <div className="lb-ad">
                          <Thumb ad={ad} />
                          <div>
                            <span className="lb-ad-name">{ad.name}</span>
                            <span className={`lb-status ${idle ? 'other' : ad.status}`} title={ad.status_note || ad.status}>
                              {ad.status === 'completed' ? `✓ completed${ad.ends ? ` ${ad.ends.slice(0, 10)}` : ''}` : idle ? '○ not running this period' : ad.status === 'active' ? '● active' : ad.status === 'paused' ? '○ paused' : '○ not delivering'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Spend">{rm2(c.spend)}</td>
                      <td data-label="Impressions">{c.impressions.toLocaleString('en-MY')}</td>
                      <td data-label="Clicks">{c.clicks.toLocaleString('en-MY')}</td>
                      <td data-label="CTR">{pct(ctrOf(c))}</td>
                      <td data-label="CPC">{c.clicks ? rm2(cpcOf(c)) : '—'}</td>
                      <td data-label="Video views">{c.video_views.toLocaleString('en-MY')}</td>
                      <td data-label="CTR vs prev">{idle ? '—' : <Delta now={ctrOf(c)} before={ctrOf(p)} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        )
      })}
    </section>
  )
}
