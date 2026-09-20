// Where the quarter's numbers actually came from.
//
// Collaboration posts sit in the same grid as the brand's own, which is right —
// they're all Okmaya content. But @seonma_shin is close to three times the size
// of @okmaya.official, so a single blended figure flatters the brand account for
// reach it didn't earn. This splits the same window two ways so both questions
// can be answered: how is the brand page doing, and what are the collabs adding.
//
// A table rather than more tiles: two rows of the same four measures is a
// comparison, and a comparison belongs in rows and columns.
export type AccountRow = {
  key: string
  label: string
  posts: number
  reach: number
  median: number
  kept: number
}

export default function AccountSplit({
  rows,
  fmt,
}: {
  rows: AccountRow[]
  fmt: (n: number) => string
}) {
  // Nothing to compare against — one source means the headline numbers already
  // say everything this would.
  if (rows.length < 2) return null

  const peak = Math.max(...rows.map(r => r.reach), 1)

  return (
    <section className="as" aria-labelledby="as-h">
      <h2 id="as-h">Where it came from — last 90 days</h2>

      <table className="as-table">
        <caption className="mm-sr">
          Posts, accounts reached, median post and saves plus shares, split by account
        </caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Reached</th>
            <th scope="col">Posts</th>
            <th scope="col">Median</th>
            <th scope="col">Saved &amp; shared</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row" className="as-acct">@{r.label}</th>

              <td className="as-cell" data-label="Reached">
                <span className="as-val">{fmt(r.reach)}</span>
                <span className="as-track" aria-hidden="true">
                  <span
                    className={`as-bar${r.key === 'collab' ? ' collab' : ''}`}
                    style={{ width: `${Math.max((r.reach / peak) * 100, r.reach > 0 ? 1.5 : 0)}%` }}
                  />
                </span>
              </td>

              <td className="as-num" data-label="Posts">{r.posts}</td>
              <td className="as-num" data-label="Median">{fmt(r.median)}</td>
              <td className="as-num" data-label="Saved &amp; shared">{fmt(r.kept)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
