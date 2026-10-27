// 👉 Halal status — each product's JAKIM halal certificate expiry, flagged from
//    3 months before. The product list + reminder rule live in lib/halal.ts;
//    rows are category='halal' (one per product, made on the first edit).
//    The Monday reminder rides Hui Yee's "Today" digest (app/api/cron-daily).
import { getRecords, todayISO, BUSINESS_TZ } from '@/lib/records'
import { halalItems, REMIND_MONTHS, type HalalStatus } from '@/lib/halal'
import Stat from '@/app/_components/Stat'
import HalalActions from '@/app/_components/HalalActions'

export const dynamic = 'force-dynamic'

const fmt = (iso: string) => iso.split('-').reverse().join('/')
const LABEL: Record<HalalStatus, string> = { ok: 'OK', renew: 'renew now', renewing: 'renewal submitted', expired: 'expired' }
const PILL: Record<HalalStatus, string> = { ok: 'done', renew: 'overdue', renewing: 'pending', expired: 'expired' }

export default async function HalalStatus() {
  const today = todayISO()
  const items = halalItems(await getRecords(), today)
  const due = items.filter(i => i.status === 'renew' || i.status === 'expired').length
  const renewing = items.filter(i => i.renewing && i.status !== 'expired').length
  const next = items.find(i => i.status !== 'expired')
  const flagged = items.filter(i => i.flag).length
  // The daily MYeHALAL check (lib/halal-check.ts) stamps checked_at on every row it reads.
  const lastCheck = items.map(i => i.checkedAt).filter(Boolean).sort().at(-1) ?? null
  const stale = !lastCheck || Date.now() - Date.parse(lastCheck) > 2 * 86_400_000
  const when = lastCheck
    ? new Intl.DateTimeFormat('en-MY', { timeZone: BUSINESS_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(lastCheck))
    : null

  return (
    <>
      <h1 className="ph">Halal status 🕌</h1>
      <p className="cap">
        {`Latest JAKIM halal certificate expiry per product, from the MYeHALAL directory. Flagged ${REMIND_MONTHS} months before expiry — and listed in Hui Yee's Monday Telegram digest until a new date is entered.`}
      </p>
      <p className="cap" style={stale ? { color: 'var(--rust)' } : undefined}>
        {when
          ? `🔎 Checked against MYeHALAL daily — last successful check ${when}.${stale ? ' The check has not worked for over 2 days; press 🔄 Sync now to see why.' : ''}`
          : '🔎 Checked against MYeHALAL every morning — it has not run successfully yet. Press 🔄 Sync now to try it.'}
      </p>

      <div className="grid">
        <Stat label="Products" value={items.length} />
        <Stat label="Renew now" value={due} yes={due > 0} />
        <Stat label="Renewal submitted" value={renewing} />
        {flagged ? <Stat label="MYeHALAL flags" value={flagged} yes /> : null}
        {next ? <Stat label="Next expiry" value={fmt(next.expiry)} /> : null}
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>Product</th>
            <th>Expiry</th>
            <th>Days left</th>
            <th>Remind from</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.key}>
              <td data-label="Product">
                <div>
                  {i.name}
                  <div className="cap" style={{ fontSize: 12, margin: 0 }}>{i.directoryName}</div>
                </div>
              </td>
              <td data-label="Expiry">{fmt(i.expiry)}</td>
              <td data-label="Days left" style={i.status === 'renew' || i.status === 'expired' ? { color: 'var(--rust)' } : undefined}>
                {i.daysLeft}
              </td>
              <td data-label="Remind from">{fmt(i.remindFrom)}</td>
              <td data-label="Status">
                <div>
                  <span className={`pill ${PILL[i.status]}`}>{LABEL[i.status]}</span>
                  {i.flag ? <div className="cap" style={{ color: 'var(--rust)', fontSize: 12, margin: '4px 0 0' }}>⚠️ {i.flag}</div> : null}
                </div>
              </td>
              <td data-label="Update"><HalalActions productKey={i.key} expiry={i.expiry} renewing={i.renewing} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
