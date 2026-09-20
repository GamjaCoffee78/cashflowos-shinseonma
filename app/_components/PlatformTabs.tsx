import Link from 'next/link'

// The channel switcher on Content. Plain links with a ?platform= param, so the
// page stays a server component — no client JS, no flash of the wrong tab.
//
// Every tab is always shown, including ones with nothing in them yet. A tab that
// reads 0 is information: it says "we haven't logged anything here", which is the
// honest state while TikTok and Xiaohongshu are still being wired up. Hiding it
// would make the gap invisible.
export default function PlatformTabs({
  tabs,
  active,
  counts,
}: {
  tabs: { key: string; label: string }[]
  active: string
  counts: Record<string, number>
}) {
  return (
    <nav className="tabs" aria-label="Platform">
      {tabs.map(t => (
        <Link
          key={t.key || 'all'}
          href={t.key ? `/content?platform=${t.key}` : '/content'}
          className={`tab${t.key === active ? ' on' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
          <span className="n">{counts[t.key] ?? 0}</span>
        </Link>
      ))}
    </nav>
  )
}
