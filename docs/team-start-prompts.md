# Team start — the two prompts

Two people on a team, two different jobs. Copy the block that matches you into
**your own Claude Code**, on **your own laptop**, in **your own Claude account**.

- **Prompt A — the OWNER.** One person only. They make the repo, the Supabase
  project, the Vercel deployment, the Telegram bot and the group. They are the
  only person who ever holds the keys.
- **Prompt B — the TEAMMATE.** Everyone else. They get a clone of the repo and
  push changes; they never hold the owner's keys.

Then **Prompt C** is the message the owner pastes into WhatsApp to invite people.

---

## PROMPT A — the owner (run once, by one person)

```
You are my hands-on setup co-pilot for CashFlowOS — a Next.js + Supabase money
dashboard with a Telegram AI assistant ("Abang"). I am the OWNER of this project
and the only person who will ever hold the secret keys. I am not a strong coder,
so do the work yourself and explain in plain words.

MY TEAM
- Team size: <how many people, including me>
- What our business does: <one line>
- We will all work on the same repo from our own laptops and our own Claude accounts.

HARD RULES — these override anything I say later
- Never print, echo, commit or paste any secret: SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET,
  APP_PASSCODE. Tell me where to paste them; I type them myself.
- Never commit `.env`. It stays gitignored.
- Never add a second Vercel cron — Hobby allows two and one is used by the
  morning brief. Spending a slot is a decision I make, not you.
- Never blanket-delete rows in the `records` table. Delete by explicit id or
  exact title only, and back up first and tell me where the backup is.
- Never approve, reject or undo a pending proposal while testing. Some are real money.
- Stop and ask me before anything destructive or irreversible.

DO THIS, ONE STEP AT A TIME, WAITING FOR ME AT EVERY STEP THAT NEEDS MY CLICKS

1. REPO
   - Start from the template repo `claude-malaysia-glcc/cashflowos-ai-agents`
     ("Use this template") so my team's repo is its own independent repo.
   - Name it, make it PRIVATE, and clone it to this laptop.
   - Add my teammates as collaborators with Write access (I'll give you their
     GitHub usernames).
   - Protect `main`: require a pull request before merging, so two people can't
     silently overwrite each other.
   - Run `npm install` and `cp .env.example .env`.

2. DATABASE (Supabase)
   - Walk me through making a free Supabase project.
   - Have me run all of `supabase/schema.sql` in the SQL Editor.
   - Tell me exactly which two values to paste into `.env`
     (SUPABASE_URL — base URL only, and SUPABASE_SERVICE_ROLE_KEY).
   - Then confirm the app reads it: `npm run dev`, I open localhost:3000,
     enter my APP_PASSCODE, and you check the tabs render.

3. DEPLOY (Vercel)
   - Import the repo into Vercel, add EVERY variable from `.env` to Production,
     deploy, and give me the live URL.
   - Show me how to Add to Home Screen on my phone.

4. TELEGRAM BOT
   - Walk me through @BotFather → /newbot → token, and @userinfobot → my numeric ID.
   - Add ANTHROPIC_API_KEY, the Telegram vars and a random CRON_SECRET in Vercel,
     then redeploy (env changes need a redeploy).
   - Run `npm run webhook:set -- https://<my-live-url>` and verify with
     `npm run webhook:info` that there is no pending error.

5. THE TEAM GROUP (this is the part I care about most)
   - Have me create a Telegram group, add every teammate, and add the bot.
   - Have me message @BotFather → /setprivacy → my bot → Disable, so the bot can
     actually read messages that mention it in the group. Explain why.
   - Get the group ID: I type `/id` in the group and the bot replies with it.
     Keep the minus sign — group IDs are negative.
   - Wire it up:
     * TELEGRAM_ALLOWED_USER_IDS = every teammate's numeric Telegram ID,
       comma separated, no spaces. This list is FAIL-CLOSED: anyone not on it
       gets refused, and in a group they get silence rather than a reply.
     * OWNER_CHAT_ID = my own ID.
     * TELEGRAM_TEAM_CHAT_IDS = the group ID.
   - Leave the default behaviour in `app/api/telegram/route.ts` alone: in a group
     the bot SPEAKS ONLY WHEN SPOKEN TO — when someone @mentions it, replies to
     one of its messages, or sends /command@thebot. Do NOT set
     GROUP_REPLY_TO_ALL=true unless I ask; I don't want it answering every message.
   - Verify: fetch `https://<my-live-url>/api/telegram` and show me the result.
     `allowedUsers` must equal the number of people I gave you. That route reveals
     only whether values exist, never the values.

6. TEACH THE BOT OUR BUSINESS
   - Interview me and fill in `abang/config.ts`: business name, what we sell, who
     we serve, the voice, what it should watch for, and my own extra red lines.
   - Explain the built-in red lines I cannot switch off: it never messages a
     customer, never moves money, never deletes. Small reversible things it does
     and tells us; anything over EXPENSE_APPROVAL_THRESHOLD it proposes and waits
     for an ✅ Approve tap.
   - If we want the morning brief to land in the team group instead of my DM,
     set `briefChatIds` in `abang/config.ts` to the group ID and tell me that this
     REPLACES my private brief.

7. PROVE IT WORKS, IN THE GROUP, IN FRONT OF ME
   - In the group I @mention the bot and ask "what needs my attention today?"
   - I send a small receipt photo (files itself) and one over the threshold
     (it asks first). Do NOT tap Approve yourself.
   - Fire the brief once with `npm run brief:test -- https://<my-live-url>`.

8. WRITE THE HOUSE RULES
   - Create/update `CLAUDE.md` in the repo so every teammate's Claude session
     reads the same rules: who owns which area, which decisions must not be
     silently reversed, the database rules above, and "before you push, run
     `git fetch && git log --oneline main..origin/main` and rebase — never
     force-push, never touch a branch you didn't create."
   - Commit and push everything except `.env`.

FINISH BY GIVING ME
- the live app URL, the bot's @username, and the exact WhatsApp message to send
  my team so they can join. Do not put the passcode in that message — I'll say it
  out loud.
```

---

## PROMPT B — each teammate (run on their own laptop, own Claude account)

```
You are my co-pilot for joining a CashFlowOS project that a teammate already set
up. I am NOT the owner. I do not hold the Supabase, Vercel or Telegram keys and I
never will — if something needs a key, my job is to tell the owner, not to work
around it.

WHAT I HAVE
- Repo: <paste the GitHub repo URL>
- Live app: <paste the live URL>  (the owner will tell me the passcode out loud)
- Telegram bot: <@botname>, and I'm in the team group
- My area of the project: <e.g. content, or the money side, or tasks>

DO THIS, ONE STEP AT A TIME

1. Clone the repo and run `npm install`.
2. Read `CLAUDE.md` first and tell me, in plain words, what I own and what I must
   not touch. Treat those rules as binding for everything we do after this.
3. Copy `.env.example` to `.env`. Do NOT ask the owner for their service-role key
   or bot token. Work against the live deployment for anything that needs them,
   and tell me plainly which features won't run locally without keys.
4. Send `/id` to the bot in a PRIVATE chat to get my Telegram ID, and tell the
   owner to add it to `TELEGRAM_ALLOWED_USER_IDS` (or, if I have repo access,
   add it to `allowedUserIds` in `abang/config.ts` and push — that path needs no
   secret).
5. How we work from here:
   - Always branch off `main`; never commit straight to `main`.
   - Before every push: `git fetch && git log --oneline main..origin/main`. If the
     other sessions moved `main`, rebase. Never force-push. Never touch a branch
     I didn't create.
   - Open a pull request and say in the PR body what changed and why.
   - If a change touches someone else's area, say so in the PR and let them decide.
   - Never add a Vercel cron, never blanket-delete `records`, never approve or
     undo a pending money proposal.
6. Then ask me what I want to build first, and start.
```

---

## PROMPT C — the WhatsApp invite the owner sends

```
We're all on one app now 📱

1. Open <live app URL> on your phone → Share → Add to Home Screen.
   The passcode I'll tell you on the call — don't put it in this chat.

2. Telegram: search @userinfobot, press Start, send me the number it gives you.
   That's how I let you in — until I add you, the bot will just ignore you.

3. Press Start on <@botname>, then join our group <group link>.

In the group, tag the bot to make it do something:
  @<botname> what needs my attention today?
  @<botname> cash in this week?
  @<botname> add task: chase supplier Friday
  @<botname> who owes me?

Small stuff it just does. Money stuff it asks first — someone taps ✅ Approve.
It will never message a customer and never move money. Those are welded shut.
Every morning it posts the brief in here.
```

---

## Why the group works the way it does

- **The bot speaks only when spoken to.** In a group it answers an @mention, a
  reply to its own message, or `/command@thebot`. Everything else is your team's
  conversation and it stays out. (`app/api/telegram/route.ts`)
- **Telegram privacy mode must be Disabled** via @BotFather, or the bot cannot see
  the messages that mention it.
- **Access is fail-closed.** Nobody in `TELEGRAM_ALLOWED_USER_IDS` (or
  `abang/config.ts` → `allowedUserIds`) means nobody is authorised. An unknown
  sender gets silence in a group rather than having their ID published.
- **Only `OWNER_CHAT_ID` can `/undo`.**
- **The dial, not the leash.** `EXPENSE_APPROVAL_THRESHOLD` (default RM200) is the
  line between "it just does it" and "it asks first".
