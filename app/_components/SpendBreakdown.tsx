// 👉 "What are we spending on?" — the analysis that sits above the Cash Out
// ledger. The list below it answers "what did we pay, and when"; this answers
// "where is the money going", which a date-ordered list cannot.
//
// Three reads, in the order the question is usually asked:
//   1. Which sections take the money, and what share of the total.
//   2. Inside a section, which line items — open a section to see them.
//   3. Month by month, so a cost that is GROWING looks different from a
//      one-off that happened to be large.
//
// A section is the row's meta.group ("Product Orders", "Packaging",
// "Marketing & Advertising", "Fixed & Operating Costs", "Miscellaneous") —
// the same five sections as the owner sheet's EXPENDITURE block. The line item
// is the row's title.
import { rm, todayISO, type Rec } from '@/lib/records'

const UNTAGGED = 'Not assigned to a section'

const sectionOf = (r: Rec) => String(r.meta?.group ?? '').trim() || UNTAGGED

// "Packaging — Innovative Shield" reads as "Innovative Shield" once it is
// already sitting under the Packaging heading. Only the part before the FIRST
// em-dash is dropped, so "Rental, Packing" and "Staff Salary" are untouched.
const lineOf = (r: Rec) => {
  const t = String(r.title ?? '').trim()
  const i = t.indexOf(' — ')
  return (i >= 0 ? t.slice(i + 3).trim() : t) || t || 'Untitled'
}

const monthLabel = (key: string) => {
  const d = new Date(`${key}-01T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

const sum = (rs: Rec[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)

// A share bar. Width never drops below a hairline for a non-zero amount, so a
// tiny line item still shows something rather than reading as zero.
function Bar({ pct }: { pct: number }) {
  return (
    <span className="mm-track" aria-hidden="true">
      <span className="mm-bar out" style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%` }} />
    </span>
  )
}

export default function SpendBreakdown({ rows, period }: { rows: Rec[]; period: string | null }) {
  const total = sum(rows)
  if (!rows.length || total <= 0) return null

  // One entry per section, biggest first — that ordering IS the answer to
  // "what are we spending on", so it must not depend on how rows arrived.
  const sections = [...new Set(rows.map(sectionOf))]
    .map(name => {
      const rs = rows.filter(r => sectionOf(r) === name)
      const amount = sum(rs)
      // Line items within the section, biggest first.
      const lines = [...new Set(rs.map(lineOf))]
        .map(line => {
          const lrs = rs.filter(r => lineOf(r) === line)
          return { line, amount: sum(lrs), count: lrs.length }
        })
        .sort((a, b) => b.amount - a.amount || a.line.localeCompare(b.line))
      return { name, amount, count: rs.length, share: (amount / total) * 100, lines }
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))

  // Month by month. Only months that actually have spending — no invented
  // empty months, none dropped from the middle.
  const perMonth = new Map<string, Rec[]>()
  for (const r of rows) {
    const key = (r.due_date || todayISO()).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    perMonth.set(key, [...(perMonth.get(key) ?? []), r])
  }
  const months = [...perMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rs]) => {
      const amount = sum(rs)
      // The section that took the most that month, and how much of it.
      const top = [...new Set(rs.map(sectionOf))]
        .map(name => ({ name, amount: sum(rs.filter(r => sectionOf(r) === name)) }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))[0]
      return { key, label: monthLabel(key), amount, top }
    })
  const peak = Math.max(...months.map(mo => mo.amount), 1)

  const biggest = sections[0]

  return (
    <section className="ct" aria-labelledby="sb-h">
      <h2 id="sb-h">
        Where the money goes{period ? ` · since ${period}` : ''}
      </h2>

      <p className="cap" style={{ marginBottom: 18 }}>
        {biggest.name} is the largest at {rm(biggest.amount)} — {Math.round(biggest.share)}% of
        the {rm(total)} going out. Open a section to see its line items.
      </p>

      <table className="ct-table">
        <caption className="mm-sr">
          Spending by section, largest first, with each section&apos;s share of the total
        </caption>
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(s => (
            <tr key={s.name}>
              <th scope="row" className="ct-month">{s.name}</th>
              <td className="ct-total" data-label="Amount">
                <span className="mm-val">{rm(s.amount)}</span>
                <Bar pct={s.share} />
              </td>
              <td className="ct-delta" data-label="Share">
                <span className="ct-pct flat">{Math.round(s.share)}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Line items, one collapsible block per section. <details> keeps this a
          server component — no JavaScript needed to open a section. */}
      <p className="rowlabel" style={{ marginTop: 22 }}>Line items</p>
      {sections.map(s => (
        <details key={s.name} className="sb-sec">
          <summary>
            <span className="sb-name">{s.name}</span>
            <span className="sb-amt">
              {rm(s.amount)} · {s.lines.length} line{s.lines.length === 1 ? '' : 's'}
            </span>
          </summary>
          <table className="ct-table">
            <thead>
              <tr>
                <th scope="col">Line item</th>
                <th scope="col">Amount</th>
                <th scope="col">Of section</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map(l => (
                <tr key={l.line}>
                  <th scope="row" className="ct-month">
                    {l.line}
                    {l.count > 1 ? <span className="sb-n"> ×{l.count}</span> : null}
                  </th>
                  <td className="ct-total" data-label="Amount">
                    <span className="mm-val">{rm(l.amount)}</span>
                    <Bar pct={(l.amount / s.amount) * 100} />
                  </td>
                  <td className="ct-delta" data-label="Of section">
                    <span className="ct-pct flat">{Math.round((l.amount / s.amount) * 100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}

      {/* Month by month — this is what separates a cost that is growing from a
          one-off that happened to be large. */}
      <p className="rowlabel" style={{ marginTop: 22 }}>Month by month</p>
      <table className="ct-table">
        <caption className="mm-sr">
          Total spending each month, with the section that took the most that month
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Out</th>
            <th scope="col">Biggest section</th>
          </tr>
        </thead>
        <tbody>
          {months.map(mo => (
            <tr key={mo.key}>
              <th scope="row" className="ct-month">{mo.label}</th>
              <td className="ct-total" data-label="Out">
                <span className="mm-val">{rm(mo.amount)}</span>
                <Bar pct={(mo.amount / peak) * 100} />
              </td>
              <td className="mm-srccell" data-label="Biggest section">
                {mo.top ? (
                  <>
                    <span className="mm-src">{mo.top.name}</span>
                    <span className="mm-srcamt">
                      {rm(mo.top.amount)} · {Math.round((mo.top.amount / mo.amount) * 100)}% of the month
                    </span>
                  </>
                ) : (
                  <span className="ct-none">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
