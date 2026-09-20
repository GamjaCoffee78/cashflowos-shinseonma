import Link from 'next/link'

// A year switcher. Plain links with a ?year= param, so the page stays a server
// component — no client JS, and no flash of the wrong year on load. Same shape
// as PlatformTabs on Content, and it reuses the same .tabs/.tab styles.
//
// "All time" is always first: it is the only view that answers "how big is this
// overall", and it is where the year-on-year comparison lives.
export default function YearTabs({
  years,
  active,
  counts,
  base,
  label = 'Year',
}: {
  years: string[]
  active: string
  counts: Record<string, number>
  base: string
  label?: string
}) {
  const tabs = [{ key: 'all', text: 'All time' }, ...years.map(y => ({ key: y, text: y }))]
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map(t => (
        <Link
          key={t.key}
          href={t.key === 'all' ? base : `${base}?year=${t.key}`}
          className={`tab${t.key === active ? ' on' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.text}
          <span className="n">{counts[t.key] ?? 0}</span>
        </Link>
      ))}
    </nav>
  )
}
