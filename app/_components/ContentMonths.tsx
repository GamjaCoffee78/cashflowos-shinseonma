// Views month by month, on Content. One bar per month, every bar on the same
// scale, each directly labelled with its own number.
//
// Why bars and not a line: reach is spiky. One reel can out-perform a whole
// quarter, and a line drawn through that invites reading a "trend" between two
// points that have nothing to do with each other. Bars compare magnitude, which
// is the real question — "was this month bigger than that one?"
//
// It's a real <table>, like Sales by month: a screen reader gets the numbers as
// data, and the bars are decoration layered on top (aria-hidden). The single
// series needs no legend — the heading names it.
export type ContentMonth = { key: string; label: string; views: number; posts: number }

export default function ContentMonths({ months }: { months: ContentMonth[] }) {
  if (!months.length) return null

  // One shared scale. A month with views but a hairline bar still gets 1.5% so
  // it never reads as zero.
  const peak = Math.max(...months.map(m => m.views), 1)
  const width = (v: number) => `${Math.max((v / peak) * 100, v > 0 ? 1.5 : 0)}%`

  const busiest = months.reduce((a, m) => (m.views > a.views ? m : a), months[0])

  return (
    <section className="cm" aria-labelledby="cm-h">
      <h2 id="cm-h">
        Views by month — {months[0].label} to {months[months.length - 1].label}
      </h2>

      <table className="cm-table">
        <caption className="mm-sr">Views and number of posts, by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Views</th>
            <th scope="col">Posts</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr key={m.key}>
              <th scope="row" className="cm-month">{m.label}</th>

              <td className="cm-cell" data-label="Views">
                <span className="cm-val">{m.views.toLocaleString('en-MY')}</span>
                <span className="cm-track" aria-hidden="true">
                  <span
                    className={`cm-bar${m.key === busiest.key ? ' peak' : ''}`}
                    style={{ width: width(m.views) }}
                  />
                </span>
              </td>

              <td className="cm-posts" data-label="Posts">
                {m.posts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
