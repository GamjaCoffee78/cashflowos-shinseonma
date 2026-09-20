// 👉 This is a normal tab — safe to tweak. It reads the ONE `records` table,
// filters to category==='content', and shows your marketing calendar. Copy this
// file's shape (see docs/add-a-tab-prompt.md) when you add your own tab.
import Link from 'next/link'
import { getRecords, m, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'
import PlatformTabs from '@/app/_components/PlatformTabs'
import ContentMonths, { type ContentMonth } from '@/app/_components/ContentMonths'
import PostCards from '@/app/_components/PostCards'

export const dynamic = 'force-dynamic'

// The same video goes out on Instagram, TikTok and Xiaohongshu, and each one
// keeps its own views, its own post date and its own status — so each is its own
// row, tagged in `meta.platform`. These tabs are how you look at one channel.
const PLATFORMS = [
  { key: '', label: 'All' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'xhs', label: 'XHS' },
]

// `meta.platform` carries whatever spelling the import wrote, so each tab matches
// the names that channel actually goes by rather than one exact string.
const ALIASES: Record<string, string[]> = {
  instagram: ['instagram', 'ig', 'reels'],
  tiktok: ['tiktok', 'tik tok', 'douyin'],
  xhs: ['xhs', 'xiaohongshu', 'xiao hong shu', 'rednote', 'red note', 'little red book'],
}

const platformOf = (r: Rec) => String(r.meta?.platform ?? '').trim().toLowerCase()
const isOn = (r: Rec, key: string) =>
  !key || (ALIASES[key] ?? [key]).includes(platformOf(r))

const viewsOf = (r: Rec) => Number(r.meta?.views ?? 0) || 0

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Big numbers are hard to read in full, and the exact digit rarely matters at a
// glance — 6.6M lands, 6,648,045 doesn't. The full number is always in the table.
function compact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

// Views summed per calendar month, oldest first, with no gaps invented — a month
// with nothing posted simply isn't a row.
function byMonth(rows: Rec[]): ContentMonth[] {
  const acc = new Map<string, ContentMonth>()
  for (const r of rows) {
    if (!r.due_date) continue
    const key = r.due_date.slice(0, 7)
    const cur = acc.get(key)
    if (cur) {
      cur.views += viewsOf(r)
      cur.posts += 1
    } else {
      const [y, mo] = key.split('-')
      acc.set(key, { key, label: `${MONTHS[Number(mo) - 1]} ${y.slice(2)}`, views: viewsOf(r), posts: 1 })
    }
  }
  return [...acc.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}

// The marketing calendar. category==='content'. Posts, reels, carousels AND ads
// all live here — the kind is in `meta.format`, the channel in `meta.platform`.
// A content item moves draft → scheduled → posted (its `status`).
export default async function Content({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; sort?: string }>
}) {
  const sp = await searchParams
  // An unknown ?platform= falls back to All rather than showing an empty page.
  const active = PLATFORMS.some(p => p.key === sp.platform) ? (sp.platform as string) : ''
  const topFirst = sp.sort === 'views'

  const all = await getRecords()
  const content = all.filter(r => r.category === 'content')
  const rows = content.filter(r => isOn(r, active))

  const counts: Record<string, number> = {}
  for (const p of PLATFORMS) counts[p.key] = content.filter(r => isOn(r, p.key)).length

  // Newest first by default — the calendar's most useful end is the recent one.
  const listed = rows.slice().sort((a, b) =>
    topFirst
      ? viewsOf(b) - viewsOf(a)
      : (b.due_date ?? '').localeCompare(a.due_date ?? '')
  )

  const views = rows.reduce((t, r) => t + viewsOf(r), 0)
  const likes = rows.reduce((t, r) => t + (Number(r.meta?.likes ?? 0) || 0), 0)
  const comments = rows.reduce((t, r) => t + (Number(r.meta?.comments ?? 0) || 0), 0)

  // The median, not the average. One reel at 2.3M drags a mean so far off that it
  // describes no post you've actually made; half your posts beat the median.
  const ranked = rows.map(viewsOf).sort((a, b) => a - b)
  const median = ranked.length ? ranked[Math.floor(ranked.length / 2)] : 0
  const engagement = views ? ((likes + comments) / views) * 100 : 0

  const link = (sort?: string) => {
    const q = new URLSearchParams()
    if (active) q.set('platform', active)
    if (sort) q.set('sort', sort)
    const s = q.toString()
    return s ? `/content?${s}` : '/content'
  }

  return (
    <>
      <h1 className="ph">Content 📣</h1>
      <p className="cap">Your marketing calendar — posts, reels, carousels & ads.</p>

      <PlatformTabs tabs={PLATFORMS} active={active} counts={counts} />

      {rows.length === 0 ? (
        <Empty label="content" />
      ) : (
        <>
          <div className="grid">
            <Stat label="Total views" value={compact(views)} />
            <Stat label="Median post" value={compact(median)} />
            <Stat label="Engagement" value={`${engagement.toFixed(1)}%`} />
            <Stat label="Posts" value={rows.length} />
          </div>

          <ContentMonths months={byMonth(rows)} />

          <section className="pgw">
            <div className="pgw-head">
              <h2>{rows.length} posts</h2>
              <div className="sortbar" role="group" aria-label="Order">
                <Link
                  href={link()}
                  className={`sortlink${topFirst ? '' : ' on'}`}
                  aria-current={topFirst ? undefined : 'true'}
                >
                  Newest
                </Link>
                <Link
                  href={link('views')}
                  className={`sortlink${topFirst ? ' on' : ''}`}
                  aria-current={topFirst ? 'true' : undefined}
                >
                  Most viewed
                </Link>
              </div>
            </div>
            <PostCards rows={listed} />
          </section>
        </>
      )}
    </>
  )
}
