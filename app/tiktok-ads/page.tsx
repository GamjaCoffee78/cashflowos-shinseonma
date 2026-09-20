// 👉 TikTok Ads 🎯 — how the ad account is doing, from the `tiktok_ads` rows the
// daily cron stores (one per day, see lib/tiktok-ads.ts). Reads the ONE
// `records` table like every other tab; no live API call happens here.
import { getRecords, rm } from '@/lib/records'
import { tiktokDays, tiktokTotals, tiktokConfigured, compact, daysAgoISO } from '@/lib/tiktok-ads'
import Stat from '@/app/_components/Stat'
import SyncNow from './SyncNow'

export const dynamic = 'force-dynamic'
// The 90-day backfill behind the Sync now button can take a while.
export const maxDuration = 60

const pct = (n: number) => `${n.toFixed(2)}%`
const rm2 = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default async function TikTokAds() {
  const all = await getRecords()
  const days = tiktokDays(all)
  const t7 = tiktokTotals(days, 7)
  const t30 = tiktokTotals(days, 30)
  const last = days[days.length - 1]

  // The 30-day strip: one bar per calendar day, zero-filled so gaps show as gaps.
  const from = daysAgoISO(30)
  const byDate = new Map(days.map(d => [d.date, d]))
  const strip: { date: string; spend: number }[] = []
  for (let i = 30; i >= 1; i--) {
    const date = daysAgoISO(i)
    if (date < from) continue
    strip.push({ date, spend: byDate.get(date)?.spend ?? 0 })
  }
  const max = Math.max(1, ...strip.map(s => s.spend))

  return (
    <>
      <h1 className="ph">TikTok Ads 🎯</h1>
      <p className="cap">
        Okmaya Official on TikTok Ads — synced every morning with the brief.
        {last ? ` Last day loaded: ${dayLabel(last.date)}.` : ''}
      </p>

      {tiktokConfigured && <SyncNow />}

      {days.length === 0 ? (
        <div className="empty">
          {tiktokConfigured ? (
            <>No TikTok days synced yet — press <b>Sync now</b> above to pull the last 90 days, or wait for the 8:15am run.</>
          ) : (
            <>
              TikTok isn&apos;t wired yet. Add <code>COMPOSIO_API_KEY</code> to Vercel (the account that has TikTok Ads linked in Composio),
              redeploy, and the next morning run fills this tab. See <code>abang/config.ts → tiktokAds</code>.
            </>
          )}
        </div>
      ) : (
        <>
          <p className="nav-label" style={{ margin: '0 0 8px' }}>Last 7 days</p>
          <div className="grid">
            <Stat label="Spend" value={rm2(t7.spend)} />
            <Stat label="Impressions" value={compact(t7.impressions)} />
            <Stat label="Clicks" value={compact(t7.clicks)} />
            <Stat label="CTR" value={pct(t7.ctr)} />
            <Stat label="CPC" value={rm2(t7.cpc)} />
          </div>

          <p className="nav-label" style={{ margin: '0 0 8px' }}>Last 30 days</p>
          <div className="grid">
            <Stat label="Spend" value={rm2(t30.spend)} />
            <Stat label="Impressions" value={compact(t30.impressions)} />
            <Stat label="Clicks" value={compact(t30.clicks)} />
            <Stat label="CTR" value={pct(t30.ctr)} />
            <Stat label="CPC" value={rm2(t30.cpc)} />
            <Stat label="CPM" value={rm2(t30.cpm)} />
          </div>

          <p className="nav-label" style={{ margin: '0 0 8px' }}>Daily spend · last 30 days</p>
          <div className="tt-strip" role="img" aria-label="Daily TikTok ad spend for the last 30 days">
            {strip.map(s => (
              <div className="tt-col" key={s.date} title={`${dayLabel(s.date)} · ${rm(s.spend)}`}>
                <div className="tt-bar" style={{ height: `${Math.max(2, (s.spend / max) * 100)}%`, opacity: s.spend ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="tt-axis">
            <span>{dayLabel(strip[0].date)}</span>
            <span>{dayLabel(strip[strip.length - 1].date)}</span>
          </div>

          <table className="tbl" style={{ marginTop: 24 }}>
            <thead>
              <tr>
                <th>Day</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Video views</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().slice(0, 14).map(d => (
                <tr key={d.date}>
                  <td data-label="Day">{dayLabel(d.date)}</td>
                  <td data-label="Spend">{rm2(d.spend)}</td>
                  <td data-label="Impressions">{d.impressions.toLocaleString('en-MY')}</td>
                  <td data-label="Clicks">{d.clicks.toLocaleString('en-MY')}</td>
                  <td data-label="CTR">{pct(d.ctr)}</td>
                  <td data-label="Video views">{d.video_views.toLocaleString('en-MY')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
