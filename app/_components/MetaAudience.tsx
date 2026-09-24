// "Audience by age" on the Meta Ads tab — who the ads reached and who clicked,
// from Meta's age × gender breakdown (lib/meta-ads.ts → fetchMetaAudience).
// Shopee shares no buyer age, so this is the closest honest answer to "how old
// are my customers": the people Meta shows the ads to and who act on them.
import { fetchMetaAudience } from '@/lib/meta-ads'

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default async function MetaAudience() {
  let rows: Awaited<ReturnType<typeof fetchMetaAudience>> = []
  let error = ''
  try { rows = await fetchMetaAudience(30) } catch (e: any) { error = String(e?.message || e) }
  if (!rows.length && !error) return null

  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const buys = rows.reduce((s, r) => s + r.purchases, 0)
  const female = rows.reduce((s, r) => s + r.female, 0)
  const male = rows.reduce((s, r) => s + r.male, 0)
  const max = Math.max(1, ...rows.map(r => r.clicks))

  return (
    <section className="sp-card" style={{ marginTop: 18 }}>
      <div className="sp-card-head">
        <p className="nav-label" style={{ margin: 0 }}>Audience by age · last 30 days</p>
        {female + male > 0 && <span className="cap" style={{ margin: 0 }}>Clicks: {pct(female, female + male)}% women · {pct(male, female + male)}% men</span>}
      </div>
      {error ? (
        <p className="cap">Couldn&apos;t load the age breakdown from Meta: {error}</p>
      ) : (
        <>
          <table className="sp-months">
            <tbody>
              {rows.map(r => (
                <tr key={r.age}>
                  <td className="mn">{r.age}</td>
                  <td className="mb"><span style={{ width: `${Math.max(2, (r.clicks / max) * 100)}%` }} /></td>
                  <td className="mo">
                    {pct(r.clicks, clicks)}% of clicks{buys > 0 ? ` · ${r.purchases.toLocaleString('en-MY')} bought` : ''} · {pct(r.female, r.female + r.male)}% women
                  </td>
                  <td className="mr">{rm(r.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cap" style={{ marginTop: 8 }}>
            From Meta: the people your Facebook + Instagram ads reached, by age. The bar is each age group&apos;s clicks; the right column is ad spend on them. Shopee doesn&apos;t share buyer age, so this is the closest guide.
          </p>
        </>
      )}
    </section>
  )
}
