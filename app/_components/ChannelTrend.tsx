import { rm, type ChannelTrend as Trend } from '@/lib/records'

// One sales channel, month on month, with the change from the month before —
// "is Shopee up or down, and by how much?"
//
// The percentage IS the answer here, so it gets its own column and the largest
// visual weight; the bar is context for how big the month was in absolute terms.
//
// Direction is never carried by colour alone: every change has a sign, an arrow,
// and a word in the screen-reader label. The green/red tint is the third signal,
// not the only one — which matters because a red-green colourblind reader sees
// almost no difference between the two.
//
// A percentage against a zero month is not shown as +∞ or +100%; it shows "—"
// with the honest reason, because there is no meaningful percentage change from
// nothing.
export default function ChannelTrend({ trend, period }: { trend: Trend | null; period: string | null }) {
  if (!trend?.months.length) return null

  const peak = Math.max(...trend.months.map(m => m.total), 1)
  const multiPart = trend.parts.length > 1

  return (
    <section className="ct" aria-labelledby="ct-h">
      <h2 id="ct-h">
        {trend.channel} — month on month{period ? ` · since ${period}` : ''}
      </h2>

      <table className="ct-table">
        <caption className="mm-sr">
          {trend.channel} sales by month, with the percentage change from the previous month
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {multiPart && trend.parts.map(p => <th key={p} scope="col">{p}</th>)}
            <th scope="col">{multiPart ? 'Total' : trend.channel}</th>
            <th scope="col">vs last month</th>
          </tr>
        </thead>
        <tbody>
          {trend.months.map(m => {
            const up = m.changePct !== null && m.changePct > 0
            const down = m.changePct !== null && m.changePct < 0
            return (
              <tr key={m.key}>
                <th scope="row" className="ct-month">{m.label}</th>

                {multiPart && m.parts.map((amount, i) => (
                  <td key={trend.parts[i]} className="ct-part" data-label={trend.parts[i]}>
                    {rm(amount)}
                  </td>
                ))}

                <td className="ct-total" data-label="Total">
                  <span className="mm-val">{rm(m.total)}</span>
                  <span className="mm-track" aria-hidden="true">
                    <span
                      className="mm-bar in"
                      style={{ width: `${Math.max((m.total / peak) * 100, m.total > 0 ? 1.5 : 0)}%` }}
                    />
                  </span>
                </td>

                <td className="ct-delta" data-label="vs last month">
                  {m.changePct === null ? (
                    <span className="ct-none" title="No earlier month to compare against">—</span>
                  ) : (
                    <span className={`ct-pct ${up ? 'up' : down ? 'down' : 'flat'}`}>
                      <span aria-hidden="true">{up ? '▲' : down ? '▼' : '■'}</span>{' '}
                      {m.changePct > 0 ? '+' : ''}
                      {Math.round(m.changePct)}%
                      <span className="mm-sr">
                        {' '}
                        {up ? 'up' : down ? 'down' : 'unchanged'} on the previous month
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
