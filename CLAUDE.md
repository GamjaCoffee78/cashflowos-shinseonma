# READ THIS FIRST — two people share this repo

Okmaya is run by **two owners, each with their own Claude Code session and their
own Telegram bot**, working on this one repo at the same time. On 2026-09-19 the
two sessions silently did the same job twice and renamed each other's bot. This
file exists so that stops happening.

## The shared things (change these only on purpose)

| Shared | Detail |
| --- | --- |
| **Supabase** | ONE project: `cfuybrmybakzelftumwu`. Both deployments read and write the same `records` table. There is no second database — `bjequzxigjuntameerzl` is empty. |
| **This repo** | `GamjaCoffee78/cashflowos-shinseonma`. Both sessions push to `main`. |
| **Vercel crons** | Hobby allows **2 slots, once-per-day granularity**. Spending a slot is a shared decision. |

There are also **two deployments**: `cashflowos-shinseonma` (Okmaya, the current
one, team build) and `cashflowos-seonhwa` (the older personal one). They share the
one database, so a data change shows up in both.

## Who owns what (as of 2026-09-19)

- **Seonhwa** — Instagram/content, and the morning-brief schedule.
- **Her husband** — the money side: real sales/bank figures, `scripts/import.mjs`,
  `scripts/purge-demo.mjs`, and the task-reminder cron.

Work inside your own area. Before changing something in the other person's area,
say so in your reply so the owner can decide — don't just do it.

## Decisions already made — don't silently reverse these

1. **The morning brief runs at 08:15 Malaysia time** (`15 0 * * *` UTC in
   `vercel.json`). Chosen deliberately: it staggers this brief behind the 08:00
   content-ideas ping on the *other* deployment so the two don't land together.
   The branch `claude/relaxed-lovelace-79o5xp` moves it back to `0 1 * * *` (9am)
   — that part must not be merged as-is. Hobby's 1-hour cron window means the
   actual send time drifts; don't "fix" that by changing the schedule.
2. **The bot persona is `🐱 Abang`**, matching the Telegram bot this app actually
   sends from: **AI Abang (@Alabang_bot)**, the husband's bot. It was briefly
   renamed to "Gamja" on 2026-09-19 and reverted the same day — Gamja
   (**@GamjaAI_bot**) is the *other* owner's bot and belongs to the separate
   `cashflowos-seonhwa` deployment, so signing this app's messages "Gamja" was
   wrong. Change the persona only with the owners' agreement; it appears in
   `app/api/cron-daily/route.ts`, `abang/config.ts`, `agents/registry.ts` and
   `lib/bot-actions.ts`.
3. **The demo/seed rows are already gone.** The database was wiped and reloaded on
   2026-09-19. `supabase/schema.sql` must not re-seed demo rows.

## Rules for touching the database

- **Never blanket-delete `records`.** Delete by explicit id or exact title, the way
  `scripts/purge-demo.mjs` does. `scripts/reset-data.mjs` does NOT do this — it
  deletes every row (`id=gte.0`) in `records`, `agent_actions`, `agent_runs` and
  `bot_memory`. Running it destroys the other owner's work, so ask first.
- **Back up before any destructive change** and say where the backup is.
- The table currently holds **138 real Instagram `content` rows** (account
  `okmaya.official`, tagged `meta.source = "instagram_import"`). Cash, leads,
  customers and tasks are intentionally **empty** until the money import lands.

## Before you push

Run `git fetch && git log --oneline main..origin/main`. If the other session moved
`main`, rebase — don't force-push, and don't touch branches you didn't create.
