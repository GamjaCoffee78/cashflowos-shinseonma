import Link from 'next/link'
import { type AdRow, type Window, type AdMetrics, type GroupOrder, ranked, callouts, ctrOf, cpcOf, cur, prev, emptyMetrics, orderGroups, groupIsLive, adIsLive, periodOf } from '@/lib/ads-leaderboard'
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
  groupOrder = 'spend',
}: {
  rows: AdRow[]
  basePath: string          // "/tiktok-ads"
  w: Window
  s: SortKey
  d: 'asc' | 'desc'
  // How the campaign blocks are stacked. 'spend' is the original: biggest
  // spender on top. 'live-first' is what Meta Ads asks for — still-running
  // campaigns first, then newest by ad set end date, then best CTR.
  groupOrder?: GroupOrder
}) {
  if (!rows.length) return null
  const href = (q: Partial<{ w: Window; s: SortKey; d: 'asc' | 'desc' }>) => {
    const p = new URLSearchParams({ w, s, d, ...q } as Record<string, string>)
    return `${basePath}?${p}`
  }
  const top = ranked(rows, w).slice(0, 3)
  const notes = callouts(rows, w)
  const medals = ['🥇', '🥈', '🥉']

  // Live-first (Meta Ads) pulls every in-flight ad out into one section of its
  // own, ranked by performance, and leaves the finished ones grouped by
  // campaign below it. 'spend' mode keeps every ad in its campaign group.
  const liveAds = groupOrder === 'live-first' ? rows.filter(r => adIsLive(r, w)) : []
  const rest = groupOrder === 'live-first' ? rows.filter(r => !adIsLive(r, w)) : rows

  // Campaign groups, ordered by spend in the window; ads sorted as requested,
  // ads that didn't run in the window sink to the bottom.
  const groups = new Map<string, AdRow[]>()
  const labels = new Map<string, string>()
  for (const r of rest) {
    // Live-first buckets the finished ads by the period they ran; 'spend' mode
    // keeps the original campaign grouping.
    const { key, label } = groupOrder === 'live-first'
      ? periodOf(r)
      : { key: r.campaign || '(no campaign)', label: r.campaign || '(no campaign)' }
    labels.set(key, label)
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const sum = (list: AdRow[]) => list.reduce((t, r) => { const c = cur(r, w); t.spend += c.spend; t.impressions += c.impressions; t.clicks += c.clicks; t.video_views += c.video_views; t.conversions += c.conversions; return t }, emptyMetrics())
  const ordered = orderGroups(groups, w, groupOrder)
  const sortAds = (list: AdRow[]) =>
    [...list].sort((a, b) => {
      const ra = cur(a, w).impressions > 0 ? 0 : 1, rb = cur(b, w).impressions > 0 ? 0 : 1
      if (ra !== rb) return ra - rb
      const diff = val(cur(a, w), s) - val(cur(b, w), s)
      return d === 'asc' ? diff : -diff
    })
  const arrow = (k: SortKey) => (s === k ? (d === 'desc' ? ' ↓' : ' ↑') : '')
  const flip = (k: SortKey): 'asc' | 'desc' => (s === k && d === 'desc' ? 'asc' : 'desc')

  // One ad table. Used twice in live-first mode (the Live section and each
  // ended period) and once per group otherwise. Each row shows the ad's name
  // and nothing else under it — the group header carries the period.
  const AdTable = ({ list }: { list: AdRow[] }) => (
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
        {list.map(ad => {
          const c = cur(ad, w), p = prev(ad, w)
          const idle = c.impressions === 0
          const live = adIsLive(ad, w)
          return (
            <tr key={ad.ad_id} className={idle || !live ? 'lb-idle' : ''}>
              <td data-label="Ad">
                <div className="lb-ad">
                  <Thumb ad={ad} />
                  <div>
                    <span className="lb-ad-name">{ad.name}</span>
                    {live ? null : (
                      <span className={`lb-status ${idle ? 'other' : ad.status}`} title={ad.status_note || ad.status}>
                        {ad.status === 'completed' ? `\u2713 completed${ad.ends ? ` ${ad.ends.slice(0, 10)}` : ''}` : idle ? '\u25cb not running this period' : ad.status === 'paused' ? '\u25cb paused' : '\u25cb not delivering'}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td data-label="Spend">{rm2(c.spend)}</td>
              <td data-label="Impressions">{c.impressions.toLocaleString('en-MY')}</td>
              <td data-label="Clicks">{c.clicks.toLocaleString('en-MY')}</td>
              <td data-label="CTR">{pct(ctrOf(c))}</td>
              <td data-label="CPC">{c.clicks ? rm2(cpcOf(c)) : '\u2014'}</td>
              <td data-label="Video views">{c.video_views.toLocaleString('en-MY')}</td>
              <td data-label="CTR vs prev">{idle ? '\u2014' : <Delta now={ctrOf(c)} before={ctrOf(p)} />}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )


  return (
    <section className="lb">
      <div className="lb-head">
        <h2 className="ph" style={{ fontSize: 18 }}>Ads — which ones are working</h2>
        <div className="lb-toggle" role="tablist" aria-label="Period">
          <Link href={href({ w: '7' })} className={w === '7' ? 'on' : ''} role="tab" aria-selected={w === '7'}>7 days</Link>
          <Link href={href({ w: '30' })} className={w === '30' ? 'on' : ''} role="tab" aria-selected={w === '30'}>30 days</Link>
        </div>
      </div>
      <p className="cap">
        Ranked by CTR (clicks ÷ impressions). Ads need at least 500 impressions in the period to be ranked.
        {groupOrder === 'live-first' ? ' Live ads are pooled at the top, best CTR first; finished ads are grouped by the period they ran, newest first.' : ''}
      </p>

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

      {groupOrder === 'live-first' ? (
        <>
          <div className="lb-section">
            <h3 className="lb-section-h"><span className="lb-pill live">● Live</span> Running now</h3>
            <span className="lb-section-sum">
              {liveAds.length
                ? `${liveAds.length} ad${liveAds.length === 1 ? '' : 's'} · ${rm2(sum(liveAds).spend)} · ${compact(sum(liveAds).impressions)} impr · CTR ${pct(ctrOf(sum(liveAds)))}`
                : 'nothing in flight'}
            </span>
          </div>
          {liveAds.length ? (
            <AdTable list={sortAds(liveAds)} />
          ) : (
            <div className="empty">No ad is in flight right now — everything below has finished its run.</div>
          )}

          <div className="lb-section">
            <h3 className="lb-section-h"><span className="lb-pill done">✓ Ended</span> Past campaigns</h3>
            <span className="lb-section-sum">grouped by run period, newest first</span>
          </div>
        </>
      ) : null}

      {ordered.map(([campaign, list]) => {
        const t = sum(list)
        const live = groupIsLive(list, w)
        // Live-first mode opens what's still running and folds the finished
        // campaigns away, so the top of the list is only what you can act on.
        const open = groupOrder === 'live-first' ? live : t.impressions > 0
        return (
          <details className={`lb-group${groupOrder === 'live-first' && !live ? ' done' : ''}`} key={campaign} open={open}>
            <summary>
              <span className="lb-group-name">
                {groupOrder === 'live-first' && (
                  <span className={`lb-pill ${live ? 'live' : 'done'}`}>{live ? '● Live' : '✓ Ended'}</span>
                )}
                {labels.get(campaign) ?? campaign}
              </span>
              <span className="lb-group-sum">
                {list.length} ad{list.length === 1 ? '' : 's'} · {rm2(t.spend)} · {compact(t.impressions)} impr · {compact(t.clicks)} clicks · CTR {pct(ctrOf(t))}
              </span>
            </summary>
            <AdTable list={sortAds(list)} />
          </details>
        )
      })}
    </section>
  )
}
