import Link from 'next/link'

// A single label + value card (the money row + counts). Set `yes` to give it the
// amber "needs your attention" look; pass `href` to make the whole card a link
// (e.g. the 🙋 count links to /approvals). Styles: .stat in globals.css.
export default function Stat({
  label,
  value,
  yes,
  href,
  hint,
}: {
  label: string
  value: string | number
  yes?: boolean
  href?: string
  // A short line under the number — the window it covers, or how it moved.
  // A headline figure with no context invites the wrong comparison.
  hint?: string
}) {
  const card = (
    <div className={`stat${yes ? ' yes' : ''}`}>
      <p className="l">{label}</p>
      <p className="v">{value}</p>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {card}
      </Link>
    )
  }
  return card
}
