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
import Pager from '@/app/_components/Pager'

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

// Three rows of covers before you have to page. Enough to scan, few enough that
// the numbers above stay on screen with them.
const PER_PAGE = 24

// The window every headline number is measured over. Lifetime totals on a
// two-year account mostly measure how long you've been posting — and here one
// reel from May 2025 carries a third of the total, so the lifetime figure
// describes that post rather than the business. A quarter is short enough to
// still be true and long enough to survive a quiet fortnight.
const WINDOW_DAYS = 90

const daysAgo = (n: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// Posts dated inside [from, to) — plain string compare, since due_date is
// already YYYY-MM-DD.
const between = (rows: Rec[], from: string, to: string) =>
  rows.filter(r => r.due_date && r.due_date >= from && r.due_date < to)

const sum = (rows: Rec[], f: (r: Rec) => number) => rows.reduce((t, r) => t + f(r), 0)

const medianOf = (ns: number[]) => {
  if (!ns.length) return 0
  const s = [...ns].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// "+18% vs the quarter before" — the number on its own can't tell you whether
// things are working. No previous quarter to compare against means no claim.
function delta(now: number, before: number) {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return 'level with the quarter before'
  return `${pct > 0 ? '+' : ''}${pct}% vs the quarter before`
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
  searchParams: Promise<{ platform?: string; sort?: string; page?: string }>
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

  // Everything above the grid describes the last quarter, and the quarter before
  // it is there purely to say which way each number is moving.
  const today = daysAgo(-1)
  const recent = between(rows, daysAgo(WINDOW_DAYS), today)
  const prior = between(rows, daysAgo(WINDOW_DAYS * 2), daysAgo(WINDOW_DAYS))

  // Reach, not views: reach counts accounts, views counts plays. The same person
  // watching a reel four times is four views and one account — and it's accounts
  // that can go on to buy.
  const reach = sum(recent, r => Number(r.meta?.reach ?? 0) || 0)
  const reachBefore = sum(prior, r => Number(r.meta?.reach ?? 0) || 0)

  // The median, not the average. One reel at 2.3M drags a mean so far off that it
  // describes no post you've actually made; half your posts beat the median.
  const median = medianOf(recent.map(viewsOf))
  const medianBefore = medianOf(prior.map(viewsOf))

  const recentViews = sum(recent, viewsOf)
  const engagement = recentViews
    ? (sum(recent, r => (Number(r.meta?.likes ?? 0) || 0) + (Number(r.meta?.comments ?? 0) || 0)) /
        recentViews) * 100
    : 0

  const link = (sort?: string, page?: number) => {
    const q = new URLSearchParams()
    if (active) q.set('platform', active)
    if (sort) q.set('sort', sort)
    if (page && page > 1) q.set('page', String(page))
    const s = q.toString()
    return s ? `/content?${s}` : '/content'
  }

  const pages = Math.max(Math.ceil(listed.length / PER_PAGE), 1)
  // A ?page= past the end lands on the last page rather than on nothing.
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), pages)
  const shown = listed.slice((page - 1) * PER_PAGE, page * PER_PAGE)

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
            <Stat
              label="Accounts reached"
              value={compact(reach)}
              hint={delta(reach, reachBefore) ?? 'last 90 days'}
            />
            <Stat
              label="Median post"
              value={compact(median)}
              hint={delta(median, medianBefore) ?? 'last 90 days'}
            />
            <Stat
              label="Engagement"
              value={`${engagement.toFixed(1)}%`}
              hint="likes + comments per view"
            />
            <Stat
              label="Posts published"
              value={recent.length}
              hint={`${prior.length} the quarter before`}
            />
          </div>

          <section className="pgw">
            <div className="pgw-head">
              <h2>
                {rows.length} posts
                {pages > 1 ? <span className="pgw-page"> · page {page} of {pages}</span> : null}
              </h2>
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
            <PostCards rows={shown} byMonth={!topFirst} />
            <Pager page={page} pages={pages} href={n => link(topFirst ? 'views' : undefined, n)} />
          </section>

          <ContentMonths months={byMonth(rows)} />
        </>
      )}
    </>
  )
}
