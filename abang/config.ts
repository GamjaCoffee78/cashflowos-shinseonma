// 👉 THIS FILE IS YOURS TO EDIT — it's Abang's personality and business knowledge.
//
// Out of the box Abang is a generic assistant. Fill this in and it becomes YOUR
// assistant: it knows your business name, what you sell, who you serve, how you
// talk, and what matters to you every morning.
//
// Four knobs — same idea as the agent template, but for the bot itself:
//   👉 WHO   — the business it works for
//   👉 VOICE — how it talks back to you
//   👉 WATCH — what it should bring up first
//   👉 NEVER — your own red lines, on top of the ones welded into the code
//
// Don't have the answers yet? Run the interview: paste the prompt in
// `abang/my-abang.md` into Claude Code and it fills this file for you.

export const ABANG = {
  // ── 👉 WHO ────────────────────────────────────────────────────────────────
  /** What your business is called. Abang introduces itself with this. */
  businessName: '',            // e.g. 'Bright Cafe'
  /** What Abang should call you. */
  ownerName: '',               // e.g. 'boss' · 'Kingsley'
  /** What you sell, in one line. */
  whatYouSell: '',             // e.g. 'coffee catering for corporate events'
  /** Who you sell to, in one line. */
  whoYouServe: '',             // e.g. 'HR and office managers at KL companies'

  // ── 👉 VOICE ──────────────────────────────────────────────────────────────
  /** How Abang should talk to you. Keep it short. */
  voice: 'Short, warm and direct. No corporate fluff.',
  /** Your money symbol. */
  currency: 'RM',

  // ── 👉 WATCH ──────────────────────────────────────────────────────────────
  /**
   * What matters most in your business — Abang leads with these when you ask
   * "what needs my attention today?". 2–4 lines is plenty.
   */
  watch: [] as string[],       // e.g. ['unpaid invoices past 7 days', 'leads quiet 3+ days']

  // ── 👉 NEVER ──────────────────────────────────────────────────────────────
  /**
   * Extra red lines specific to YOU. These stack ON TOP of the built-in ones
   * (never message a customer, never move money, never delete) — which are in
   * the code and can't be switched off from here.
   */
  never: [] as string[],       // e.g. ['never discuss pricing with anyone but me']

  // ── 👉 MORNING BRIEF ─────────────────────────────────────────────────────
  /**
   * Extra Telegram ids that get the daily brief, on top of OWNER_CHAT_ID /
   * TELEGRAM_TEAM_CHAT_IDS in Vercel. Lets a teammate with GitHub access (the
   * deputy) add themselves without touching the owner's secrets. Each person
   * must have pressed Start on the bot first, or Telegram won't deliver.
   */
  briefRecipients: [] as string[],

  /**
   * WHERE the morning brief goes. When this is non-empty it REPLACES
   * OWNER_CHAT_ID / TELEGRAM_TEAM_CHAT_IDS entirely — the brief stops going to
   * the owner's private chat and goes here instead. (briefRecipients above is
   * different: it always ADDS people on top of whatever is set.)
   *
   * Use it to send the brief to a team group. Get a group's id by typing
   * `/id` in that group — the bot replies with it. Group ids are NEGATIVE, so
   * keep the minus sign. The bot must be a member of the group (and an admin
   * if the group restricts who may post).
   *
   * Empty = behave as before: the owner's DM, or TELEGRAM_TEAM_CHAT_IDS.
   */
  briefChatIds: ['-1004424648501'] as string[],   // the OMY group

  /**
   * Extra Telegram user ids allowed to command the bot, ON TOP of
   * TELEGRAM_ALLOWED_USER_IDS in Vercel. Lets an owner who can edit this repo
   * add themselves without an env change and a redeploy.
   *
   * Still FAIL CLOSED: if this list and the env var are both empty, nobody is
   * authorised. Find an id by sending /id to the bot in a PRIVATE chat — in a
   * group the bot stays silent for unknown senders rather than publish an id.
   *
   * NOTE: this repo is public, so ids listed here are readable by anyone. A
   * Telegram user id on its own does not let a stranger message you, but keep
   * them in TELEGRAM_ALLOWED_USER_IDS instead if you would rather not publish.
   */
  allowedUserIds: ['8956330282'] as string[],   // the owner

  /**
   * REPORT MONEY FROM this date (YYYY-MM-DD). The database keeps the full
   * history, but the Dashboard, the Cash In / Cash Out tabs and the morning
   * brief count only from here — so the headline figures are the period you are
   * actually managing, not four years of everything.
   *
   * Only cash_in / cash_out are affected. Leads, content, tasks and the funnel
   * are never filtered. A row with no due_date is always counted, so a receipt
   * filed today is never hidden.
   *
   * Empty = report everything. MONEY_FROM in Vercel overrides this.
   */
  moneyFrom: '2026-01-01',

  /**
   * Give ONE sales channel its own month-on-month section on the Dashboard,
   * with the percentage change from the month before.
   *
   * Matched as a prefix against a row's `meta.group`, case-insensitively, so
   * 'Shopee' covers both "Shopee MY" and "Shopee SG" and breaks them out as
   * separate columns. 'Shopee MY' would narrow it to one.
   *
   * Empty = no channel section.
   */
  focusChannel: 'Shopee',

  /**
   * The sales target for one year, and the year it belongs to. The Dashboard
   * shows progress towards it and the gap still to close.
   *
   * `amount: 0` hides the target section.
   */
  salesTarget: { year: 2026, amount: 3_000_000 },

  // ── 👉 TIKTOK ADS ─────────────────────────────────────────────────────────
  /**
   * The TikTok Ads tab + the "🎯 TikTok" line in the morning brief. Numbers are
   * pulled through Composio (the ad account is linked there) by the daily cron
   * and stored as `tiktok_ads` records — one row per day — so the tab, Gamja
   * and the brief all read the same table. Needs COMPOSIO_API_KEY in Vercel;
   * without it the tab shows a calm setup note and nothing else changes.
   *
   * advertiserId / composioAccount are ids, not secrets. `syncDays` is how far
   * back each morning re-pulls (TikTok revises the last few days); the first
   * ever sync backfills `backfillDays`.
   */
  tiktokAds: {
    advertiserId: '7613249567527387137',       // "Okmaya Official0304" (MYR)
    composioAccount: 'ca_q1f8jnNxnpt4',        // the TikTok Ads connection in the Composio project
    syncDays: 3,
    backfillDays: 90,
  },

  // ── 👉 META ADS ───────────────────────────────────────────────────────────
  /**
   * The Meta Ads tab (Facebook + Instagram ads). Same shape as TikTok: the
   * daily cron pulls yesterday from Meta's Marketing API and stores one
   * `meta_ads` record per day. Needs META_ADS_TOKEN in Vercel (a long-lived
   * System User token with ads_read); without it the tab shows a setup note.
   */
  metaAds: {
    adAccountId: 'act_3910350865950897',   // "Okmaya" (MYR), business 옥마야 Okmaya
    syncDays: 3,
    backfillDays: 90,
  },

  // ── 👉 SHOPEE ─────────────────────────────────────────────────────────────
  /**
   * The live Shopee link (lib/shopee.ts). The daily cron pulls the last
   * `syncDays` of orders straight from Shopee's Open API and writes the SAME
   * `cash_in` rows the xlsx import used to — keyed on the order id, so the two
   * can never double-count. Needs SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY in
   * Vercel, and one visit to /api/shopee/authorize per shop.
   *
   * Each shop's region and currency come from Shopee itself (MY, SG, …), so a
   * second shop only needs authorising — no setting here changes.
   * `fetchNet` asks Shopee for the escrow (after-fees) amount per order, so the
   * tabs can show sales before AND after Shopee's cut. One call per order, but
   * only for orders without a net yet, inside a small time budget per sync.
   */
  shopee: {
    syncDays: 7,          // the daily top-up
    backfillDays: 45,     // a shop's FIRST sync, so the 30-day figures are real
    fetchNet: true,
  },

  // ── 👉 CALENDAR ───────────────────────────────────────────────────────────
  /**
   * The Calendar tab. The daily cron copies Google Calendar events (past
   * `pastDays` → next `futureDays`) into `event` records through Composio, where
   * the Google account is linked. Read-only: the app never writes to Google.
   * Reuses COMPOSIO_API_KEY; the ids below are not secrets.
   */
  calendar: {
    calendarId: 'huiyee.lee@okmayaofficial.com',   // the account Composio is linked to
    // Everyone whose calendar shows on the Calendar tab. Each person shares their
    // Google Calendar with the account above ("See all event details"); one that
    // isn't shared yet is skipped and named in the Sync now answer.
    people: [
      { name: 'Seonma', calendarId: 'seonma.shin@okmayaofficial.com', color: '#E0312A' },
      { name: 'Hui Yee', calendarId: 'huiyee.lee@okmayaofficial.com', color: '#1E5FC4' },
      { name: 'Cindy', calendarId: 'cindy.j@okmayaofficial.com', color: '#1F9D55' },
      { name: 'Ivy', calendarId: 'ivy.joo@okmayaofficial.com', color: '#D63384' },
    ],
    composioAccount: 'ca_joPzpFAk1MLz',   // the Google Calendar connection in the Composio project
    pastDays: 14,
    futureDays: 60,
  },

  // ── 👉 OWNER SHEET ───────────────────────────────────────────────────────
  /**
   * The Google Sheet the Dashboard's money comes from: "okmaya_owner_v5_fix",
   * the Monthly Tracker (line items down, months across). Pressing 🔄 Sync now
   * re-reads it and RECONCILES — a changed cell updates its row, a new cell adds
   * one, and a row the sheet no longer mentions is reported, never deleted.
   *
   * `source` must stay 'okmaya_owner_v5_fix': it is the meta.source tag the
   * original import wrote, and it is how the sync finds the rows it already
   * owns instead of adding a second copy of your revenue (see CLAUDE.md).
   *
   * `tab` empty = the first tab, which is the Monthly Tracker. The Annual P&L
   * tab is a summary OF that tab, so importing it too would double-count.
   *
   * composioAccount empty = reuse the Google connection the Calendar uses. That
   * account needs spreadsheets.readonly; without it the sync says so and writes
   * nothing.
   */
  ownerSheet: {
    spreadsheetId: '1I-dYtDtTlzL39sswb0JOBEVC8a2CQPMAsl62KLeg1PA',
    tab: '',
    source: 'okmaya_owner_v5_fix',
    composioAccount: '',
  },

  // ── 👉 PRODUCTION SHEET (write-back) ──────────────────────────────────────
  /**
   * Every Done / Move / New task on the Production Timeline is mirrored into
   * ONE tab of the team's Google Sheet ("Okmaya Project WIP", the Google Sheets
   * copy — not the old .xlsx). The app owns that tab and rewrites it on every
   * change; it never touches any other tab, so the calendar grid is safe.
   *
   * composioAccount: the Google Sheets connection in the Composio project
   * (ca_…). It needs EDIT access to Sheets. Empty = the sheet isn't written,
   * and the app still saves every change.
   */
  productionSheet: {
    spreadsheetId: '1J2r65t2fm_1msjlW6Wi7jAAdVz9tiMWaNCSNyYexumE',  // [NEW] Okmaya Project WIP (Hui Yee's, from 2026-09-24)
    tab: 'App updates',
    composioAccount: 'ca_kw8p5M9618Ko',   // Google Sheets connection (Hui Yee), edit access
  },
}

/**
 * Renders the business block that goes at the TOP of Abang's system prompt.
 * Anything left blank is simply left out, so a half-filled config still works.
 *
 * 🔒 Note for the curious: this is CONTEXT, not permission. The safety rules are
 * appended AFTER this in the prompt, and the dangerous actions don't exist in any
 * executor — so nothing written here can widen what Abang is allowed to do.
 */
export function abangIdentity(): string {
  const j = ABANG
  const lines: string[] = []

  if (j.businessName) {
    lines.push(`You are Abang, the problem solver for ${j.businessName}.`)
  } else {
    lines.push(`You are Abang, the problem solver that runs a small business owner's Okmaya on Telegram.`)
  }
  if (j.ownerName) lines.push(`You're talking to ${j.ownerName} — the owner.`)
  if (j.whatYouSell) lines.push(`The business sells: ${j.whatYouSell}.`)
  if (j.whoYouServe) lines.push(`Its customers are: ${j.whoYouServe}.`)
  if (j.currency && j.currency !== 'RM') lines.push(`Money is in ${j.currency}.`)
  if (j.voice) lines.push(`How to talk: ${j.voice}`)
  if (j.watch.length) {
    lines.push(`What matters most here (lead with these when asked what needs attention): ${j.watch.join(' · ')}.`)
  }
  if (j.never.length) {
    lines.push(`The owner's own rules you must respect: ${j.never.join(' · ')}.`)
  }
  return lines.join(' ') + '\n'
}

/** The business name for greetings/cards, with a safe fallback. */
export const abangName = () => ABANG.businessName || 'Okmaya'
