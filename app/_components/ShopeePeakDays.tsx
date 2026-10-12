// The two peak periods, month over month. Every month Shopee runs a double-digit
// campaign (1.1, 2.2 … 12.12) and the 25th is payday; sales start climbing the
// day before each. Each peak is listed against the same peak last month — orders,
// basket size and the eve/day split — so a weak one shows *why* it was weak.
type Day = { date: string; orders: number; revenue: number }

const pad = (n: number) => String(n).padStart(2, '0')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The day before an ISO date (1.1's eve is 31 Dec of the year before).
function prevDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

type Peak = {
  ym: string; label: string; month: string; ok: boolean
  eveLabel: string; dayLabel: string; eve: number; day: number; total: number; orders: number; aov: number
}

function Change({ now, before }: { now: number; before?: number }) {
  if (before == null || before <= 0) return <span className="pk-chg muted">—</span>
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return <span className="pk-chg muted">same</span>
  return <span className={`pk-chg ${pct > 0 ? 'up' : 'down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>
}

function PeakList({ title, note, list, color, m }: {
  title: string; note: string; list: Peak[]; color: string; m: (n: number) => string
}) {
  const done = list.filter(p => p.ok)
  if (!done.length) return null
  const max = Math.max(1, ...done.map(p => p.total))
  const best = done.reduce((a, b) => (b.total > a.total ? b : a))
  return (
    <div className="pk-block">
      <div className="pk-mhead"><b>{title}</b><span className="muted">{note}</span></div>
      {done.map((p, i) => {
        const prev = done[i + 1]   // newest first, so the month before is next
        return (
          <details className="pk-item" key={p.ym}>
            <summary className="pk-row">
              <span className="pk-tag">{p.label}<small>{p.month}</small></span>
              <div className="pk-mid">
                <div className="pk-bar">
                  <span className="b-eve" style={{ width: `${(p.eve / max) * 100}%` }} />
                  <span className={color} style={{ width: `${(p.day / max) * 100}%` }} />
                </div>
                <div className="pk-split">
                  <span><i className="b-eve" />{p.eveLabel}: <b>{m(p.eve)}</b></span>
                  <span><i className={color} />{p.dayLabel}: <b>{m(p.day)}</b></span>
                </div>
              </div>
              <span className="pk-num">{p.ym === best.ym && done.length > 1 ? '🏆 ' : ''}{m(p.total)}<small>total sales</small></span>
              <Change now={p.total} before={prev?.total} />
            </summary>
            <table className="pk-why">
              <thead><tr><td /><td>{p.month}</td><td>{prev ? prev.month : '—'}</td><td /></tr></thead>
              <tbody>
                <tr><td>Day before</td><td>{m(p.eve)}</td><td>{prev ? m(prev.eve) : '—'}</td><td><Change now={p.eve} before={prev?.eve} /></td></tr>
                <tr><td>Peak day</td><td>{m(p.day)}</td><td>{prev ? m(prev.day) : '—'}</td><td><Change now={p.day} before={prev?.day} /></td></tr>
                <tr><td>Orders</td><td>{p.orders.toLocaleString('en-MY')}</td><td>{prev ? prev.orders.toLocaleString('en-MY') : '—'}</td><td><Change now={p.orders} before={prev?.orders} /></td></tr>
                <tr><td>Avg order</td><td>{m(p.aov)}</td><td>{prev ? m(prev.aov) : '—'}</td><td><Change now={p.aov} before={prev?.aov} /></td></tr>
              </tbody>
            </table>
          </details>
        )
      })}
    </div>
  )
}

export default function ShopeePeakDays({
  days, today, currency, money, months = 12,
}: {
  days: Day[]
  today: string
  currency: string
  money: (n: number, currency: string) => string
  months?: number
}) {
  if (!days.length) return null
  const m = (n: number) => money(n, currency)
  const by = new Map(days.map(d => [d.date, d]))
  const first = days.reduce((min, d) => (d.date < min ? d.date : min), days[0].date)
  const get = (iso: string) => by.get(iso) ?? { date: iso, orders: 0, revenue: 0 }
  // A peak counts only once both its days are synced and over — zero there means zero sales.
  const known = (iso: string) => iso >= first && iso <= today

  const camp: Peak[] = [], pay: Peak[] = []
  const [ty, tm] = today.split('-').map(Number)
  for (let i = 0; i < months; i++) {
    const idx = ty * 12 + (tm - 1) - i
    const y = Math.floor(idx / 12)
    const mo = (idx % 12) + 1
    const ym = `${y}-${pad(mo)}`
    const month = `${MON[mo - 1]} ${y}`
    const peak = (day: string, label: string): Peak => {
      const eve = prevDay(day)
      const e = get(eve), d = get(day)
      const orders = e.orders + d.orders
      const total = e.revenue + d.revenue
      const dm = (iso: string) => `${Number(iso.slice(8))} ${MON[Number(iso.slice(5, 7)) - 1]}`
      return { ym, label, month, eveLabel: dm(eve), dayLabel: dm(day), ok: known(day) && known(eve), eve: e.revenue, day: d.revenue, total, orders, aov: orders ? total / orders : 0 }
    }
    camp.push(peak(`${ym}-${pad(mo)}`, `${mo}.${mo}`))
    pay.push(peak(`${ym}-25`, '25th'))
  }

  return (
    <section className="sp-card pk">
      <p className="nav-label" style={{ margin: '0 0 4px' }}>Peak periods · month over month</p>
      <p className="cap" style={{ margin: '0 0 10px' }}>
        <b>Sales = what buyers paid, before Shopee&apos;s commission and fees</b> (not what you receive). Each peak = the day before + the day itself. Tap a month to see why it moved — the eve, the day, orders and basket size vs the month before.
      </p>
      <div className="pk-legend">
        <span><i className="b-eve" />Day before</span>
        <span><i className="b-camp" />Campaign day</span>
        <span><i className="b-pay" />Payday</span>
      </div>
      <PeakList title="🔥 Campaign day" note="1.1, 2.2 … 12.12" list={camp} color="b-camp" m={m} />
      <PeakList title="💰 Payday" note="24th + 25th" list={pay} color="b-pay" m={m} />
    </section>
  )
}
