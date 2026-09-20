// 🎯 HEAD OF SALES — Cold-Lead Follow-up
//
// The first C-suite head installed from docs/ai-csuite-blueprint.md.
// Three of the four knobs live here (WHEN, LOOK-AT, ASK-BEFORE); the fourth
// (SUGGEST — the words) is next door in prompt.ts. The executor is the locked
// draftOnly one: it CANNOT message a lead, so the 🔴 zone isn't a setting.
//
// The owner's canvas answers (2026-09-20):
//   • Dial          — 🟡 draft-only, ALWAYS ask. No 🟢 autopilot at all.
//   • Quiet rule    — no contact in more than 3 days.
//   • Voice         — warm + casual Malaysian English (see prompt.ts).
//   • Schedule      — manual only. No Vercel cron slot is spent (Hobby has 2,
//     both accounted for), so this one is marked `manualOnly` in registry.ts.

import type { Rec } from '@/lib/records'
import { suggest } from './prompt'
import type { AgentDefinition } from '../_template/definition'

// How many days of silence make a lead "gone quiet". The owner's dial: 3.
export const QUIET_DAYS = 3

// Stages that are finished business — a closed/lost/parked lead is never nudged.
const DONE_STAGES = new Set(['closed', 'lost', 'nurture', 'reversed'])

// The last time a human actually touched this lead. Real rows use `last_touch`;
// newer bot-written rows use `last_contact`. Fall back to when the row was
// created, so a lead with no touch history still surfaces instead of hiding.
export function lastTouch(r: Rec): string | null {
  return r.meta?.last_contact || r.meta?.last_touch || r.created_at?.slice(0, 10) || null
}

// Whole days of silence since that last touch (0 when we can't tell).
export function daysQuiet(r: Rec, today: string): number {
  const last = lastTouch(r)
  if (!last) return 0
  return Math.floor((Date.parse(today) - Date.parse(last)) / 86_400_000)
}

export const definition: AgentDefinition = {
  key: 'cold-lead',

  // WHEN — 'daily' is the only trigger shape the engine knows, but this head is
  // registered as manualOnly, so the cron skips it. It wakes on /cold-lead in
  // Telegram or the Run now button on the AI Employees tab.
  when: 'daily',

  // LOOK-AT — open leads that have gone quiet past the dial.
  lookAt: (rows) =>
    rows.filter(
      (r) =>
        r.category === 'lead' &&
        !DONE_STAGES.has((r.status || '').toLowerCase()) &&
        daysQuiet(r, new Date().toISOString().slice(0, 10)) > QUIET_DAYS,
    ),

  // ASK-BEFORE — always true. Messaging a real person is never autopilot, and
  // the owner set the dial to draft-only for every single nudge.
  askBefore: () => true,

  suggest,
}
