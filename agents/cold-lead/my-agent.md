# 🎯 Head of Sales — Cold-Lead Follow-up

> Installed 2026-09-20 from `docs/ai-csuite-blueprint.md` (claude-malaysia-glcc/cashflowos-ai-agents).
> The FIRST head turned on. The other three (Marketing, Finance, Ops) stay gallery
> placeholders until this one has earned its keep.

**Owner (who it works for):** Okmaya owner / closer
**Approver (whose YES it needs):** the same person — every single nudge

---

## 1. WHEN → `manualOnly` in `registry.ts`
**Manual only.** No Vercel cron slot spent (Hobby allows 2, both already
accounted for — the 08:15 brief and the task reminder). It fires on:
- `/cold-lead` to **AI Abang (@Alabang_bot)** in Telegram
- **▶️ Run now** on the AI Employees tab

## 2. LOOK AT → `lookAt` in `definition.ts`
`lead` rows that are **not** closed / lost / nurture, and have had **no contact
for more than 3 days** (`meta.last_contact` → `meta.last_touch` → `created_at`).

## 3. SUGGEST → `prompt.ts`
A warm, casual **Malaysian English** check-in using their first name and, when
the row records it, what they were last asking about. Short enough to send as-is.

## 4. ASK-BEFORE → `askBefore` in `definition.ts`
**Always.** `askBefore: () => true` — no exceptions, no threshold.

---

## The autonomy dial
- 🟢 **AUTOPILOT**: *none.* Deliberately empty. This head has no 🟢 zone at all.
- 🟡 **ASK-FIRST**: every nudge, every time — Approve/Reject in Telegram, and on
  the Approvals tab.
- 🔴 **NEVER**: message the lead itself · delete a lead · promise a price.
  Not a setting — the `draftOnly` executor has no network call in it, so the
  code that could send simply doesn't exist.

## How I'll know it's earning its keep in 2 weeks
Count the drafts approved and sent vs. ignored. If most get sent roughly as
written, tighten the quiet window or add a second head. If most get ignored,
the 3-day dial is too twitchy — raise `QUIET_DAYS` in `definition.ts`.
