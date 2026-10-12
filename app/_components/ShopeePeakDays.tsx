// Campaign day vs payday, month by month. Every month Shopee runs a double-digit
// campaign (1.1, 2.2 … 12.12) and the 25th is payday; sales start climbing the
// day before each. This card puts the eve + the day next to an ordinary day of
// the same month, so the spike — and whether it's growing — is easy to read.
type Day = { date: string; orders: number; revenue: number }

const pad = (n: number) => String(n).padStart(2, '0')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The day before an ISO date (1.1's eve is 31 Dec of the year before).
function prevDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function Lift({ x }: { x: number | null }) {
  if (x == null) return <span className="pk-lift muted">—</span>
  const cls = x >= 1.5 ? 'up' : x < 1 ? 'down' : ''
  return <span className={`pk-lift ${cls}`}>{x.toFixed(1)}×</span>
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
  // A day counts only once it's both synced and over — zero there means zero sales.
  const known = (iso: string) => iso >= first && iso <= today

  // Newest month first, back to the first synced month.
  const [ty, tm] = today.split('-').map(Number)
  const rows = []
  for (let i = 0; i < months; i++) {
    const idx = ty * 12 + (tm - 1) - i
    const y = Math.floor(idx / 12)
    const mo = (idx % 12) + 1
    const ym = `${y}-${pad(mo)}`
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    if (`${ym}-${pad(lastDay)}` < first) break

    const dd = `${ym}-${pad(mo)}`          // double day: 10.10
    const pay = `${ym}-25`
    const peak = new Set([prevDay(dd), dd, prevDay(pay), pay])

    // An ordinary day = every finished, synced day of this month that isn't a peak day.
    let normTotal = 0, normDays = 0
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${ym}-${pad(d)}`
      if (peak.has(iso) || !known(iso)) continue
      normTotal += get(iso).revenue
      normDays++
    }
    const normal = normDays ? normTotal / normDays : 0

    const pair = (day: string) => {
      const eve = prevDay(day)
      const ok = known(day) && known(eve)
      const e = get(eve), d = get(day)
      const total = e.revenue + d.revenue
      return {
        label: `${Number(day.slice(8))}.${mo}`, ok, eve: e.revenue, day: d.revenue, total,
        orders: e.orders + d.orders,
        lift: ok && normal > 0 ? total / 2 / normal : null,   // average peak day vs ordinary day
      }
    }
    rows.push({ ym, name: `${MON[mo - 1]} ${y}`, normal, normDays, camp: pair(dd), pay: pair(pay) })
  }
  if (!rows.length) return null

  const max = Math.max(1, ...rows.flatMap(r => [r.camp.eve, r.camp.day, r.pay.eve, r.pay.day, r.normal]))
  const bar = (v: number, cls: string) => <span className={cls} style={{ width: `${Math.max(1.5, (v / max) * 100)}%` }} />

  // Headline: across the finished months, how big is each spike on average?
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const campAvg = avg(rows.map(r => r.camp.lift))
  const payAvg = avg(rows.map(r => r.pay.lift))

  return (
    <section className="sp-card pk">
      <p className="nav-label" style={{ margin: '0 0 4px' }}>Campaign day &amp; payday · by month</p>
      <p className="cap" style={{ margin: '0 0 12px' }}>
        <b>Campaign</b> = the double-digit day (10.10, 11.11 …) and the day before · <b>Payday</b> = the 24th + 25th ·
        <b> ×</b> = an average peak day vs an ordinary day that month
      </p>

      {(campAvg != null || payAvg != null) && (
        <div className="pk-head">
          <div><span className="k">Campaign days sell</span><b>{campAvg != null ? `${campAvg.toFixed(1)}×` : '—'}</b><span className="k">an ordinary day</span></div>
          <div><span className="k">Payday sells</span><b>{payAvg != null ? `${payAvg.toFixed(1)}×` : '—'}</b><span className="k">an ordinary day</span></div>
        </div>
      )}

      <div className="pk-legend">
        <span><i className="b-norm" />Ordinary day</span>
        <span><i className="b-eve" />Day before</span>
        <span><i className="b-camp" />Campaign day</span>
        <span><i className="b-pay" />Payday</span>
      </div>

      {rows.map(r => (
        <div className="pk-month" key={r.ym}>
          <div className="pk-mhead">
            <b>{r.name}</b>
            <span className="muted">ordinary day {m(r.normal)}{r.normDays ? '' : ' · no data'}</span>
          </div>
          <div className="pk-row">
            <span className="pk-tag">{r.camp.label}</span>
            <div className="pk-bars">
              {bar(r.normal, 'b-norm')}
              {r.camp.ok && bar(r.camp.eve, 'b-eve')}
              {r.camp.ok && bar(r.camp.day, 'b-camp')}
            </div>
            <span className="pk-num">{r.camp.ok ? m(r.camp.total) : 'upcoming'}</span>
            <Lift x={r.camp.lift} />
          </div>
          <div className="pk-row">
            <span className="pk-tag">25th</span>
            <div className="pk-bars">
              {bar(r.normal, 'b-norm')}
              {r.pay.ok && bar(r.pay.eve, 'b-eve')}
              {r.pay.ok && bar(r.pay.day, 'b-pay')}
            </div>
            <span className="pk-num">{r.pay.ok ? m(r.pay.total) : 'upcoming'}</span>
            <Lift x={r.pay.lift} />
          </div>
        </div>
      ))}
    </section>
  )
}
