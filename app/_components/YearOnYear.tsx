import { rm, type YearMoney, type TargetProgress } from '@/lib/records'

// Two things the rest of the Dashboard cannot show:
//
//   1. Progress to this year's sales target — a single ratio against a limit,
//      so a meter, not a chart. The gap and the monthly run-rate needed to
//      close it are the numbers that change a decision.
//   2. Sales year on year. This section alone ignores the reporting window,
//      because a year-on-year table that starts this January has nothing to
//      compare against.
//
// Years missing months are marked. 2026 has nine months of data and 2025 has
// twelve, so "−11%" is not a like-for-like fall and the table says so rather
// than letting the percentage imply otherwise.
export default function YearOnYear({
  years,
  target,
}: {
  years: YearMoney[]
  target: TargetProgress | null
}) {
  if (!years.length && !target) return null

  return (
    <section className="yy" aria-labelledby="yy-h">
      <h2 id="yy-h">Year on year — sales</h2>

      {target && (
        <div className="yy-target">
          <div className="yy-thead">
            <span className="yy-tlabel">{target.year} target</span>
            <span className="yy-tamt">{rm(target.target)}</span>
          </div>

          <div
            className="yy-meter"
            role="meter"
            aria-valuenow={Math.round(target.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(target.pct)} percent of the ${target.year} sales target`}
          >
            <span className="yy-fill" style={{ width: `${Math.min(target.pct, 100)}%` }} />
          </div>

          <div className="yy-tstats">
            <span>
              <b>{rm(target.achieved)}</b> so far · {target.pct.toFixed(1)}%
            </span>
            {target.gap > 0 ? (
              <span className="yy-gap">
                <b>{rm(target.gap)}</b> to go
              </span>
            ) : (
              <span className="yy-hit">Target met</span>
            )}
          </div>

          {target.perMonthNeeded !== null && (
            <p className="yy-run">
              {target.monthsLeft} month{target.monthsLeft === 1 ? '' : 's'} left — that is{' '}
              <b>{rm(target.perMonthNeeded)}</b> a month from here.
            </p>
          )}
        </div>
      )}

      {years.length > 0 && (
        <table className="yy-table">
          <caption className="mm-sr">Sales, costs and net by year, with the change on the previous year</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Sales</th>
              <th scope="col">vs last year</th>
              <th scope="col">Costs</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => {
              const up = y.changePct !== null && y.changePct > 0
              const down = y.changePct !== null && y.changePct < 0
              return (
                <tr key={y.year}>
                  <th scope="row" className="yy-year">
                    {y.year}
                    {y.partial && (
                      <span className="yy-partial" title={`Only ${y.monthsWithData} months of data`}>
                        {y.monthsWithData} mth
                      </span>
                    )}
                  </th>

                  <td className="yy-cell" data-label="Sales">{rm(y.sales)}</td>

                  <td className="yy-cell yy-delta" data-label="vs last year">
                    {y.changePct === null ? (
                      <span className="ct-none">—</span>
                    ) : (
                      <span className={`ct-pct ${up ? 'up' : down ? 'down' : 'flat'}`}>
                        <span aria-hidden="true">{up ? '▲' : down ? '▼' : '■'}</span>{' '}
                        {y.changePct > 0 ? '+' : ''}
                        {Math.round(y.changePct)}%
                        <span className="mm-sr">
                          {' '}
                          {up ? 'up' : down ? 'down' : 'unchanged'} on the previous year
                        </span>
                      </span>
                    )}
                  </td>

                  <td className="yy-cell yy-soft" data-label="Costs">{rm(y.costs)}</td>

                  <td className="yy-cell" data-label="Net">
                    <span className={`mm-net ${y.net < 0 ? 'neg' : 'pos'}`}>
                      {y.net < 0 ? `−${rm(Math.abs(y.net))}` : rm(y.net)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {years.some(y => y.partial) && (
        <p className="yy-note">
          Years marked with a month count are incomplete — their totals are not
          comparable with a full year.
        </p>
      )}
    </section>
  )
}
