import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { SCHEDULED, type ProposalDraft } from '@/agents/registry'
import { getRecords } from '@/lib/records'
import { propose, proposeAndNotify } from '@/lib/actions'

// "Run now" — fire ONE head on demand from the AI Employees tab.
//
// This is the app-side twin of the /<agent-key> Telegram command: same check(),
// same idempotency keys, same claim-check funnel. It CREATES proposals only —
// nothing is executed here, so every draft still waits for a human YES on the
// Approvals tab (and in Telegram, when OWNER_CHAT_ID is set).
//
// Reachable only with the APP_PASSCODE cookie — proxy.ts gates /api/agents/*
// like every tab (it is deliberately NOT in the matcher's exclusion list).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const key = String(body?.key || '').trim()
  const agent = SCHEDULED.find((a) => a.key === key)
  if (!agent) {
    return NextResponse.json({ ok: false, message: 'That robot has no on-demand run.' }, { status: 400 })
  }

  let drafts: ProposalDraft[] = []
  try {
    drafts = agent.check(await getRecords(), todayISO())
  } catch (e) {
    console.error(`[CFO] on-demand check "${agent.key}" threw:`, e)
    return NextResponse.json({ ok: false, message: 'It hit an error — logged, nothing was done.' })
  }

  if (drafts.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'Nothing needs you right now.' })
  }

  // 🟡 ASK-FIRST only. `auto` drafts are ignored on this path on purpose: a
  // button press should never silently execute something.
  const owner = process.env.OWNER_CHAT_ID?.trim()
  let created = 0
  for (const d of drafts.filter((x) => !x.auto)) {
    const row = owner
      ? await proposeAndNotify({
          agentKey: agent.key,
          idempotencyKey: d.idempotencyKey,
          payload: d.payload,
          chatId: owner,
          text: d.text,
        })
      : await propose({ agentKey: agent.key, idempotencyKey: d.idempotencyKey, payload: d.payload })
    if (row) created++
  }

  revalidatePath('/', 'layout')
  return NextResponse.json({
    ok: true,
    created,
    message:
      created === 0
        ? `Already drafted today — check Approvals.`
        : `${created} draft${created === 1 ? '' : 's'} waiting for you in Approvals.`,
  })
}
