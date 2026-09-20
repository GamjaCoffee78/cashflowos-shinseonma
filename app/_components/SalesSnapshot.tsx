import type { SalesSnapshot } from '@/lib/records'

// The Dashboard's top row: the three numbers the owner wants first —
// total Views, units sold this year, and the best-selling item.
//
// It replaces the five-stage funnel, which described a lead pipeline this
// business does not run: the money arrives through marketplaces, not through
// appointments. Pure presentation; the numbers come from getSalesSnapshot().
const n = (v: number) => v.toLocaleString('en-MY')

export default function SalesSnapshot({ snap }: { snap: SalesSnapshot }) {
  return (
    <div className="funnel">
      <h2>The Numbers — what people saw, and what they bought</h2>
      <div className="snap">
        <div className="snapcell">
          <p className="l">👀 Views</p>
          <p className="v">{n(snap.views)}</p>
          <p className="s">everything posted, all time</p>
        </div>
        <div className="snapcell">
          <p className="l">📦 Units sold in {snap.year}</p>
          <p className="v">{n(snap.units)}</p>
          <p className="s">
            {snap.channels
              ? `${snap.channels} marketplace${snap.channels === 1 ? '' : 's'}`
              : 'press 🔄 Sync now to pull them from your sheet'}
          </p>
        </div>
        <div className="snapcell">
          <p className="l">🏆 Best selling item</p>
          <p className="v sm">{snap.best ? snap.best.title : '—'}</p>
          <p className="s">{snap.best ? `${n(snap.best.units)} units in ${snap.year}` : 'no units counted yet'}</p>
        </div>
      </div>
    </div>
  )
}
