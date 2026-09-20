import Link from 'next/link'

// Page links for a long list. Plain <a>s with a ?page= param — the back button
// works, a page can be bookmarked, and nothing needs client JS.
//
// Every page gets a number while there are few enough to show. Past that the
// list collapses around the page you're on, because a row of forty numbers is
// harder to use than a short one.
export default function Pager({
  page,
  pages,
  href,
}: {
  page: number
  pages: number
  href: (page: number) => string
}) {
  if (pages <= 1) return null

  const nums: (number | 'gap')[] = []
  if (pages <= 9) {
    for (let i = 1; i <= pages; i++) nums.push(i)
  } else {
    const near = [page - 1, page, page + 1].filter(n => n > 1 && n < pages)
    const set = [1, ...near, pages]
    let prev = 0
    for (const n of set) {
      if (n - prev > 1) nums.push('gap')
      nums.push(n)
      prev = n
    }
  }

  return (
    <nav className="pager" aria-label="Pages">
      <Link
        href={href(page - 1)}
        className={`pg-step${page === 1 ? ' off' : ''}`}
        aria-disabled={page === 1 || undefined}
        // A disabled step still renders, so the row doesn't reflow as you page.
        tabIndex={page === 1 ? -1 : undefined}
      >
        ← Newer
      </Link>

      <span className="pg-nums">
        {nums.map((n, i) =>
          n === 'gap' ? (
            <span key={`gap${i}`} className="pg-gap" aria-hidden="true">…</span>
          ) : (
            <Link
              key={n}
              href={href(n)}
              className={`pg-num${n === page ? ' on' : ''}`}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </Link>
          )
        )}
      </span>

      <Link
        href={href(page + 1)}
        className={`pg-step${page === pages ? ' off' : ''}`}
        aria-disabled={page === pages || undefined}
        tabIndex={page === pages ? -1 : undefined}
      >
        Older →
      </Link>
    </nav>
  )
}
