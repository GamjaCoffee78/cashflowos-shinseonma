// 👉 Halal status — each product's JAKIM halal certificate expiry, flagged from
//    3 months before. The product list + reminder rule live in lib/halal.ts;
//    rows are category='halal' (one per product, made on the first edit).
//    The Monday reminder rides Hui Yee's "Today" digest (app/api/cron-daily).
import { getRecords, todayISO } from '@/lib/records'
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

  return (
    <>
      <h1 className="ph">Halal status 🕌</h1>
      <p className="cap">
        {`Latest JAKIM halal certificate expiry per product, from the MYeHALAL directory. Flagged ${REMIND_MONTHS} months before expiry — and listed in Hui Yee's Monday Telegram digest until a new date is entered.`}
      </p>

      <div className="grid">
        <Stat label="Products" value={items.length} />
        <Stat label="Renew now" value={due} yes={due > 0} />
        <Stat label="Renewal submitted" value={renewing} />
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
              <td data-label="Status"><span className={`pill ${PILL[i.status]}`}>{LABEL[i.status]}</span></td>
              <td data-label="Update"><HalalActions productKey={i.key} expiry={i.expiry} renewing={i.renewing} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
