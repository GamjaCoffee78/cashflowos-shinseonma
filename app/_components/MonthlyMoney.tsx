import { rm, type MonthMoney } from '@/lib/records'

// Money month by month, on the Dashboard. Two series — money in and money out —
// as paired horizontal bars, one pair per month, all scaled to the same maximum
// so month-to-month comparison is honest.
//
// Why bars and not a line: the reader's job here is "compare magnitude, and tell
// in from out", not "follow a trend through time". Bars do that; a two-line chart
// would invite reading the gap between the lines, which is the net — and the net
// is already a number in the row.
//
// Colour: --money-in (blue) and --money-out (clay) in globals.css. That pair was
// picked by running the palette validator, not by eye: the obvious green/red
// choice collapses to ΔE 5.0 under deuteranopia — two bars a red-green colourblind
// reader cannot tell apart. Blue/clay scores 18.9 and passes every check.
//
// Colour is never the only signal anyway: every bar is directly labelled with its
// value, and the rows are a real table for screen readers.
export default function MonthlyMoney({
  months,
  period,
}: {
  months: MonthMoney[]
  period: string | null
}) {
  if (!months.length) return null

  // One shared scale across every bar — otherwise each month looks equally big.
  const peak = Math.max(...months.flatMap(m => [m.cashIn, m.cashOut]), 1)
  const width = (v: number) => `${Math.max((v / peak) * 100, v > 0 ? 1.5 : 0)}%`

  return (
    <section className="mm" aria-labelledby="mm-h">
      <h2 id="mm-h">
        Sales by month{period ? ` — since ${period}` : ''}
      </h2>

      <p className="mm-legend">
        <span><i className="mm-sw in" aria-hidden="true" /> Money in</span>
        <span><i className="mm-sw out" aria-hidden="true" /> Money out</span>
      </p>

      <table className="mm-table">
        <caption className="mm-sr">Money in, money out and net, by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Money in</th>
            <th scope="col">Biggest source</th>
            <th scope="col">Money out</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr key={m.key}>
              <th scope="row" className="mm-month">{m.label}</th>

              <td className="mm-cell" data-label="Money in">
                <span className="mm-val">{rm(m.cashIn)}</span>
                <span className="mm-track" aria-hidden="true">
                  <span className="mm-bar in" style={{ width: width(m.cashIn) }} />
                </span>
              </td>

              <td className="mm-cell mm-srccell" data-label="Biggest source">
                {m.topSource ? (
                  <>
                    <span className="mm-src">{m.topSource.name}</span>
                    <span className="mm-srcamt">
                      {rm(m.topSource.amount)} · {Math.round(m.topSource.share * 100)}% of sales
                    </span>
                  </>
                ) : (
                  <span className="mm-srcamt">— no sales —</span>
                )}
              </td>

              <td className="mm-cell" data-label="Money out">
                <span className="mm-val">{rm(m.cashOut)}</span>
                <span className="mm-track" aria-hidden="true">
                  <span className="mm-bar out" style={{ width: width(m.cashOut) }} />
                </span>
              </td>

              <td className="mm-cell mm-netcell" data-label="Net">
                <span className={`mm-net ${m.net < 0 ? 'neg' : 'pos'}`}>
                  {m.net < 0 ? `−${rm(Math.abs(m.net))}` : rm(m.net)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
