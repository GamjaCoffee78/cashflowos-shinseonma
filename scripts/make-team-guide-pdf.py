# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether, Preformatted)

OUT = "/home/user/cashflowos-shinseonma/docs/CashFlowOS-Team-Setup-Guide.pdf"

INK   = colors.HexColor("#14213D")
ACC   = colors.HexColor("#C1440E")
GREEN = colors.HexColor("#1B7F5B")
AMBER = colors.HexColor("#B77A00")
RED   = colors.HexColor("#A61B1B")
MUTED = colors.HexColor("#5A6472")
RULE  = colors.HexColor("#D6DBE3")
CODEBG= colors.HexColor("#F4F6F9")
BOXBG = colors.HexColor("#FBF3EE")

ss = getSampleStyleSheet()
def S(name, **kw):
    base = kw.pop("parent", ss["BodyText"])
    return ParagraphStyle(name, parent=base, **kw)

Body  = S("Body", fontName="Helvetica", fontSize=9.6, leading=14.2, textColor=INK,
          spaceAfter=7, alignment=TA_LEFT)
Lead  = S("Lead", parent=Body, fontSize=11, leading=16, textColor=MUTED, spaceAfter=10)
H1    = S("H1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=INK,
          spaceBefore=4, spaceAfter=3)
H2    = S("H2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=INK,
          spaceBefore=15, spaceAfter=5)
H3    = S("H3", fontName="Helvetica-Bold", fontSize=10.4, leading=14, textColor=ACC,
          spaceBefore=11, spaceAfter=3)
Kick  = S("Kick", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=ACC,
          spaceAfter=2)
Bul   = S("Bul", parent=Body, leftIndent=11, bulletIndent=2, spaceAfter=3.5)
Num   = S("Num", parent=Body, leftIndent=14, bulletIndent=2, spaceAfter=3.5)
Cell  = S("Cell", parent=Body, fontSize=8.6, leading=12, spaceAfter=0)
CellB = S("CellB", parent=Cell, fontName="Helvetica-Bold")
Note  = S("Note", parent=Body, fontSize=9, leading=13, spaceAfter=0)
Code  = ParagraphStyle("Code", fontName="Courier", fontSize=7.8, leading=10.4,
                       textColor=INK, spaceAfter=0)
Foot  = S("Foot", parent=Body, fontSize=7.6, leading=10, textColor=MUTED)

def P(t, st=Body): return Paragraph(t, st)
def B(items, st=Bul):
    return [Paragraph(t, st, bulletText="•") for t in items]
def OL(items, st=Num):
    return [Paragraph(t, st, bulletText="%d." % (i+1)) for i, t in enumerate(items)]

W = A4[0] - 40*mm

def _codebox(lines, title):
    body = Preformatted("\n".join(lines), Code)
    rows, styles = [], [
        ("BACKGROUND", (0,0), (-1,-1), CODEBG),
        ("BOX", (0,0), (-1,-1), 0.6, RULE),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]
    if title:
        rows.append([Paragraph("<b>%s</b>" % title, S("ct", parent=Body, fontSize=7.6,
                     leading=10, textColor=ACC, spaceAfter=0))])
        styles += [("LINEBELOW", (0,0), (0,0), 0.6, RULE),
                   ("BOTTOMPADDING", (0,0), (0,0), 5)]
    rows.append([body])
    t = Table(rows, colWidths=[W])
    t.setStyle(TableStyle(styles))
    return t

MAX_CODE_LINES = 58

def code(text, title=None):
    lines = text.strip("\n").split("\n")
    if len(lines) <= MAX_CODE_LINES:
        return _codebox(lines, title)
    out = []
    n = 0
    while n < len(lines):
        chunk = lines[n:n+MAX_CODE_LINES]
        t = title if n == 0 else (title + "  (continued)" if title else None)
        out.append(_codebox(chunk, t))
        n += MAX_CODE_LINES
        if n < len(lines):
            out.append(PageBreak())
    return out

def callout(title, lines, tone=ACC, bg=BOXBG):
    inner = [Paragraph("<b>%s</b>" % title, S("cot", parent=Note, textColor=tone,
             fontName="Helvetica-Bold", spaceAfter=3))]
    inner += [Paragraph(l, Note) for l in lines]
    t = Table([[inner]], colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LINEBEFORE", (0,0), (0,-1), 2.4, tone),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
    ]))
    return t

def table(head, rows, widths):
    data = [[Paragraph(h, S("th", parent=Cell, fontName="Helvetica-Bold",
             textColor=colors.white)) for h in head]]
    for r in rows:
        data.append([Paragraph(c, Cell) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), INK),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F7F9FB")]),
        ("GRID", (0,0), (-1,-1), 0.5, RULE),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    return t

# ---------------------------------------------------------------- page chrome
def later(canv, doc):
    canv.saveState()
    canv.setStrokeColor(RULE); canv.setLineWidth(0.6)
    canv.line(20*mm, A4[1]-15*mm, A4[0]-20*mm, A4[1]-15*mm)
    canv.setFont("Helvetica", 7.4); canv.setFillColor(MUTED)
    canv.drawString(20*mm, A4[1]-12.6*mm, "CashFlowOS — Team Setup & Collaboration Guide")
    canv.drawRightString(A4[0]-20*mm, A4[1]-12.6*mm, doc.section)
    canv.line(20*mm, 14*mm, A4[0]-20*mm, 14*mm)
    canv.drawString(20*mm, 10.4*mm, "Generated 2026-09-20 · docs/team-start-prompts.md")
    canv.setFont("Helvetica-Bold", 7.6); canv.setFillColor(INK)
    canv.drawRightString(A4[0]-20*mm, 10.4*mm, "Page %d" % doc.page)
    canv.restoreState()

def cover(canv, doc):
    canv.saveState()
    canv.setFillColor(INK); canv.rect(0, A4[1]-95*mm, A4[0], 95*mm, stroke=0, fill=1)
    canv.setFillColor(ACC); canv.rect(0, A4[1]-97.6*mm, A4[0], 2.6*mm, stroke=0, fill=1)
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 9)
    canv.drawString(20*mm, A4[1]-28*mm, "CASHFLOWOS AI AGENTS")
    canv.setFont("Helvetica-Bold", 27)
    canv.drawString(20*mm, A4[1]-46*mm, "Team Setup &")
    canv.drawString(20*mm, A4[1]-58*mm, "Collaboration Guide")
    canv.setFont("Helvetica", 11); canv.setFillColor(colors.HexColor("#AEB8C8"))
    canv.drawString(20*mm, A4[1]-72*mm, "One shared repo. One Vercel app. One Telegram group.")
    canv.drawString(20*mm, A4[1]-79.5*mm, "Everyone on their own laptop, their own Claude account.")
    canv.setFont("Helvetica", 7.4); canv.setFillColor(MUTED)
    canv.drawString(20*mm, 10.4*mm, "Generated 2026-09-20 · GamjaCoffee78/cashflowos-shinseonma")
    canv.restoreState()

class Doc(BaseDocTemplate):
    section = "Introduction"
    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name == "H1":
            self.section = f.getPlainText()

doc = Doc(OUT, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
          topMargin=20*mm, bottomMargin=20*mm,
          title="CashFlowOS — Team Setup & Collaboration Guide",
          author="CashFlowOS", subject="Team onboarding: shared repo, Vercel, Telegram AI agent")
fr = Frame(20*mm, 18*mm, W, A4[1]-40*mm, id="n")
frc = Frame(20*mm, 18*mm, W, A4[1]-115*mm, id="c")
doc.addPageTemplates([PageTemplate("cover", [frc], onPage=cover),
                      PageTemplate("normal", [fr], onPage=later)])

s = []
def A(x):
    if isinstance(x, list): s.extend(x)
    else: s.append(x)

# ============================================================== COVER
A(P("<b>What this is.</b> Three copy-paste prompts and everything around them, so a team "
    "can stand up one shared CashFlowOS — a Next.js + Supabase money dashboard with a "
    "Telegram AI assistant — and then keep working on it together without overwriting "
    "each other.", Lead))
A(Spacer(1, 4))
A(table(["Section", "Who reads it", "Time"], [
    ["1. How the system fits together", "Everyone", "5 min read"],
    ["2. Roles: the Owner and the Teammates", "Everyone", "3 min"],
    ["3. Before you start — accounts & tools", "Owner", "15 min"],
    ["4. <b>Prompt A</b> — the Owner setup prompt", "Owner (once)", "60–90 min"],
    ["5. <b>Prompt B</b> — the Teammate join prompt", "Each teammate", "15 min"],
    ["6. <b>Prompt C</b> — the WhatsApp invite", "Owner sends", "1 min"],
    ["7. The Telegram group — how tagging works", "Everyone", "5 min"],
    ["8. Environment variables reference", "Owner", "reference"],
    ["9. Collaboration rules (git + areas)", "Everyone", "5 min"],
    ["10. Safety model — what the bot may never do", "Everyone", "3 min"],
    ["11. Troubleshooting", "Owner / builder", "reference"],
    ["12. Go-live checklist", "Owner", "10 min"],
], [W*0.46, W*0.32, W*0.22]))
A(Spacer(1, 10))
A(callout("The one rule that saves you", [
    "Exactly <b>one person</b> holds the Supabase, Vercel and Telegram keys. Everyone else "
    "contributes through GitHub pull requests and never sees a secret. If a teammate needs a "
    "key to do their job, the answer is to change the task — not to share the key."]))
A(PageBreak())
doc.handle_nextPageTemplate("normal")

# ============================================================== 1
A(P("1. How the system fits together", H1))
A(P("Five moving parts. Understand these and every step below has a reason.", Lead))
A(table(["Part", "What it is", "Who can touch it"], [
    ["<b>GitHub repo</b>", "The code. One repo, everyone pushes branches, changes land on "
     "<font face='Courier' size='8'>main</font> via pull request.", "Whole team (Write access)"],
    ["<b>Supabase</b>", "The database — 5 tables plus a private photo Vault. Holds every "
     "money row, lead, task and content row.", "Owner only"],
    ["<b>Vercel</b>", "Hosts the Next.js app at a live URL, stores the environment variables, "
     "and runs the daily cron.", "Owner only"],
    ["<b>Telegram bot</b>", "“Abang” — answers questions, files receipts, proposes "
     "money actions for approval. Lives in your team group.", "Whole team (by allowlist)"],
    ["<b>Claude Code</b>", "Each person's own laptop and own Claude account, working in a clone "
     "of the same repo.", "Each person separately"],
], [W*0.18, W*0.56, W*0.26]))
A(Spacer(1, 8))
A(P("The flow, in one line", H3))
A(code(
"Your laptop (Claude Code)  ->  GitHub repo  ->  Vercel build  ->  live app URL\n"
"                                                     |\n"
"                                                     +--> Supabase  (the data)\n"
"                                                     +--> Telegram  (Abang, in your group)\n"
"                                                     +--> daily cron 08:15 -> morning brief"))
A(Spacer(1, 8))
A(callout("Two deployments are not one deployment", [
    "If your team runs more than one Vercel project from the same codebase, each one has its "
    "<b>own Supabase database</b>. A row added in one is invisible in the other. Never assume a "
    "data change in one deployment shows up in the other — or the reverse."], tone=AMBER,
    bg=colors.HexColor("#FDF6E7")))

# ============================================================== 2
A(P("2. Roles — the Owner and the Teammates", H2))
A(P("Two roles only. Picking them now prevents the single most common failure: two people "
    "silently doing the same job twice and undoing each other's work.", Body))
A(Spacer(1, 3))
A(table(["", "THE OWNER (one person)", "A TEAMMATE (everyone else)"], [
    ["Holds the keys", "Yes — Supabase, Vercel, Telegram bot token, all API keys.",
     "No. Never. Not even “just to test”."],
    ["Creates", "The repo, the database, the deployment, the bot, the group.",
     "Nothing infrastructural. Branches and pull requests."],
    ["Can change env vars", "Yes, in the Vercel dashboard.",
     "No — asks the owner, who makes the change and redeploys."],
    ["Can run <font face='Courier' size='8'>/undo</font> on the bot",
     "Yes — only <font face='Courier' size='8'>OWNER_CHAT_ID</font> can.", "No."],
    ["Approves money proposals", "Yes.", "Depends — owner decides who taps Approve."],
    ["Day-to-day work", "Owns one area of the app like everyone else.",
     "Owns an area: content, money, tasks, etc."],
], [W*0.22, W*0.40, W*0.38]))
A(Spacer(1, 8))
A(P("Give each person one <b>area</b> of the app — for example one person on content and "
    "the morning-brief schedule, another on the money side (real sales figures, the import "
    "scripts, the task reminder). Work inside your own area. Before changing something in "
    "someone else's area, say so in the pull request and let them decide.", Body))

A(PageBreak())
# ============================================================== 3
A(P("3. Before you start — accounts and tools", H1))
A(P("The owner needs all of these ready before pasting Prompt A. Fifteen minutes of signups "
    "now saves an hour of stalling later.", Lead))
A(table(["What", "Where", "Cost", "Notes"], [
    ["GitHub account", "github.com", "Free", "Owner and every teammate needs one."],
    ["Node.js 20+", "nodejs.org", "Free", "On every laptop that will run the app."],
    ["Git", "git-scm.com", "Free", "On every laptop."],
    ["Claude Code", "claude.com/claude-code", "Paid plan", "Each person uses their <b>own</b> "
     "account. Do not share a login."],
    ["Supabase account", "supabase.com", "Free tier", "Owner only. One project."],
    ["Vercel account", "vercel.com", "Hobby = free", "Owner only. Hobby allows <b>2 cron "
     "slots, once-per-day granularity</b>."],
    ["Anthropic API key", "console.anthropic.com", "Pay as you go", "Powers the bot's brain and "
     "the receipt photo reader."],
    ["Telegram", "telegram.org", "Free", "Everyone. Plus @BotFather and @userinfobot."],
], [W*0.20, W*0.24, W*0.14, W*0.42]))
A(Spacer(1, 8))
A(callout("Collect these three things from every teammate first", [
    "1. Their <b>GitHub username</b> — so you can add them as a repo collaborator.",
    "2. Their <b>numeric Telegram ID</b> — open Telegram, search <b>@userinfobot</b>, press "
    "Start, it replies with a number. Until that number is on the allowlist the bot ignores them "
    "completely.",
    "3. Which <b>area</b> of the app they will own."], tone=GREEN, bg=colors.HexColor("#EFF7F3")))

# ============================================================== 4
A(PageBreak())
A(P("4. Prompt A — the Owner setup prompt", H1))
A(P("Run once, by one person, in Claude Code, on the laptop that will hold the keys. Fill in "
    "the three angle-bracket placeholders first. Then paste the whole block and answer as it "
    "walks you through.", Lead))
A(code("""
You are my hands-on setup co-pilot for CashFlowOS - a Next.js + Supabase money
dashboard with a Telegram AI assistant ("Abang"). I am the OWNER of this project
and the only person who will ever hold the secret keys. I am not a strong coder,
so do the work yourself and explain in plain words.

MY TEAM
- Team size: <how many people, including me>
- What our business does: <one line>
- We will all work on the same repo from our own laptops and our own Claude accounts.

HARD RULES - these override anything I say later
- Never print, echo, commit or paste any secret: SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET,
  APP_PASSCODE. Tell me where to paste them; I type them myself.
- Never commit `.env`. It stays gitignored.
- Never add a second Vercel cron - Hobby allows two and one is used by the
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
     (SUPABASE_URL - base URL only, and SUPABASE_SERVICE_ROLE_KEY).
   - Then confirm the app reads it: `npm run dev`, I open localhost:3000,
     enter my APP_PASSCODE, and you check the tabs render.

3. DEPLOY (Vercel)
   - Import the repo into Vercel, add EVERY variable from `.env` to Production,
     deploy, and give me the live URL.
   - Show me how to Add to Home Screen on my phone.

4. TELEGRAM BOT
   - Walk me through @BotFather -> /newbot -> token, and @userinfobot -> my numeric ID.
   - Add ANTHROPIC_API_KEY, the Telegram vars and a random CRON_SECRET in Vercel,
     then redeploy (env changes need a redeploy).
   - Run `npm run webhook:set -- https://<my-live-url>` and verify with
     `npm run webhook:info` that there is no pending error.

5. THE TEAM GROUP (this is the part I care about most)
   - Have me create a Telegram group, add every teammate, and add the bot.
   - Have me message @BotFather -> /setprivacy -> my bot -> Disable, so the bot can
     actually read messages that mention it in the group. Explain why.
   - Get the group ID: I type `/id` in the group and the bot replies with it.
     Keep the minus sign - group IDs are negative.
   - Wire it up:
     * TELEGRAM_ALLOWED_USER_IDS = every teammate's numeric Telegram ID,
       comma separated, no spaces. This list is FAIL-CLOSED: anyone not on it
       gets refused, and in a group they get silence rather than a reply.
     * OWNER_CHAT_ID = my own ID.
     * TELEGRAM_TEAM_CHAT_IDS = the group ID.
   - Leave the default behaviour in `app/api/telegram/route.ts` alone: in a group
     the bot SPEAKS ONLY WHEN SPOKEN TO - when someone @mentions it, replies to
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
     for an Approve tap.
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
     `git fetch && git log --oneline main..origin/main` and rebase - never
     force-push, never touch a branch you didn't create."
   - Commit and push everything except `.env`.

FINISH BY GIVING ME
- the live app URL, the bot's @username, and the exact WhatsApp message to send
  my team so they can join. Do not put the passcode in that message - I'll say it
  out loud.
""", "PROMPT A — paste into Claude Code (owner, once)"))
A(Spacer(1, 8))
A(P("Why each step is there", H3))
A(table(["Step", "What it prevents"], [
    ["Private repo + Write collaborators", "Your real sales figures sitting in a public repo."],
    ["Branch protection on <font face='Courier' size='8'>main</font>",
     "Two Claude sessions pushing over each other. This happens; protect against it on day one."],
    ["Base URL only for Supabase", "Using the <font face='Courier' size='8'>/rest/v1</font> URL "
     "— every request fails."],
    ["service_role, not anon key", "The anon key can't read past row security, so the app looks "
     "empty and you debug the wrong thing for an hour."],
    ["Redeploy after env changes", "Vercel does not pick up new variables until you redeploy."],
    ["Privacy mode Disabled", "Without it the bot cannot see group messages at all — tagging "
     "it does nothing."],
    ["Verify <font face='Courier' size='8'>allowedUsers</font> count",
     "Handing your team a bot that silently ignores half of them."],
    ["Never approve while testing", "Approving a real money proposal by accident."],
], [W*0.34, W*0.66]))

# ============================================================== 5
A(PageBreak())
A(P("5. Prompt B — the Teammate join prompt", H1))
A(P("Every person who is not the owner pastes this, on their own laptop, in their own Claude "
    "Code session. Fill in the four placeholders from the owner's invite first.", Lead))
A(code("""
You are my co-pilot for joining a CashFlowOS project that a teammate already set
up. I am NOT the owner. I do not hold the Supabase, Vercel or Telegram keys and I
never will - if something needs a key, my job is to tell the owner, not to work
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
   add it to `allowedUserIds` in `abang/config.ts` and push - that path needs no
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
""", "PROMPT B — paste into Claude Code (each teammate)"))
A(Spacer(1, 8))
A(callout("What a teammate can and cannot do locally", [
    "<b>Works without keys:</b> reading and editing code, the UI, layout, components, docs, "
    "writing new agents, opening pull requests.",
    "<b>Needs the owner:</b> anything that reads real data locally, sending Telegram messages, "
    "running the import scripts, firing the brief, changing an environment variable.",
    "The honest workflow is: build against the live deployment the owner controls, and let the "
    "owner run the key-holding commands."], tone=GREEN, bg=colors.HexColor("#EFF7F3")))

# ============================================================== 6
A(PageBreak())
A(P("6. Prompt C — the invite the owner sends", H1))
A(P("Paste into WhatsApp with the two placeholders filled in. Deliberately does <b>not</b> "
    "contain the passcode — say that out loud on a call.", Lead))
A(code("""
We're all on one app now

1. Open <live app URL> on your phone -> Share -> Add to Home Screen.
   The passcode I'll tell you on the call - don't put it in this chat.

2. Telegram: search @userinfobot, press Start, send me the number it gives you.
   That's how I let you in - until I add you, the bot will just ignore you.

3. Press Start on <@botname>, then join our group <group link>.

In the group, tag the bot to make it do something:
  @<botname> what needs my attention today?
  @<botname> cash in this week?
  @<botname> add task: chase supplier Friday
  @<botname> who owes me?

Small stuff it just does. Money stuff it asks first - someone taps Approve.
It will never message a customer and never move money. Those are welded shut.
Every morning it posts the brief in here.
""", "PROMPT C — paste into WhatsApp"))

# ============================================================== 7
A(Spacer(1, 10))
A(P("7. The Telegram group — how tagging works", H1))
A(P("This is the part most teams get wrong, so here is exactly what happens to a message in "
    "your group.", Lead))
A(P("The bot speaks only when spoken to", H3))
A(P("In a group the bot replies in exactly three cases. Everything else is your team's own "
    "conversation and it stays out of it.", Body))
A(table(["Trigger", "Example", "Result"], [
    ["An <b>@mention</b> of the bot",
     "<font face='Courier' size='8'>@Alabang_bot who owes me?</font>", "It answers."],
    ["A <b>reply</b> to one of its own messages",
     "Reply to its brief with “and last month?”",
     "It answers, with the last few turns remembered."],
    ["A command addressed to it",
     "<font face='Courier' size='8'>/help@Alabang_bot</font>", "It answers."],
    ["Anything else", "Normal team chatter", "Silence. By design."],
], [W*0.30, W*0.40, W*0.30]))
A(Spacer(1, 7))
A(callout("Three settings that make or break the group", [
    "<b>1. @BotFather &gt; /setprivacy &gt; your bot &gt; Disable.</b> With privacy mode ON "
    "(the default) Telegram never delivers group messages to your bot, so an @mention does "
    "nothing at all. The Approve buttons still work either way — which is why this bug is "
    "so confusing when it hits.",
    "<b>2. The allowlist is fail-closed.</b> If "
    "<font face='Courier' size='8'>TELEGRAM_ALLOWED_USER_IDS</font> and "
    "<font face='Courier' size='8'>abang/config.ts &gt; allowedUserIds</font> are both empty, "
    "<i>nobody</i> is authorised. An unknown sender in a group gets silence rather than having "
    "their numeric ID published to everyone.",
    "<b>3. Group IDs are negative.</b> Type <font face='Courier' size='8'>/id</font> in the group "
    "and keep the minus sign — they look like "
    "<font face='Courier' size='8'>-1004424648501</font>."]))
A(Spacer(1, 8))
A(P("What you can ask it, in the group", H3))
A(code("""
Money      "cash in this week?"  "who owes me?"  "overdue invoices?"
Pipeline   "open leads?"  "pipeline value?"  "pending vs won?"
Tasks      "what's due this week?"  "add task: chase supplier Friday"
Content    "what's scheduled?"
People     "who do I follow up with?"
Triage     "what needs my attention today?"
Admin      /help   /id   /undo  (owner only)
"""))
A(P("It chains tool calls, so multi-part questions work — <i>“who do I need to chase, "
    "and how much do they owe me?”</i> — and it remembers the last few turns, so a "
    "follow-up like <i>“…and last month?”</i> just works.", Body))
A(Spacer(1, 6))
A(P("Two chattiness modes", H3))
A(table(["Mode", "How", "When to use it"], [
    ["<b>Mention-only</b> (default, recommended)", "Do nothing. This is the built-in behaviour.",
     "Almost always. Keeps the group readable."],
    ["<b>Reply to everything</b>",
     "<font face='Courier' size='8'>GROUP_REPLY_TO_ALL=true</font> in Vercel, plus the bot "
     "needs to be a group admin.",
     "A live demo, or a workshop where people keep mistyping the @name."],
], [W*0.28, W*0.40, W*0.32]))

# ============================================================== 8
A(PageBreak())
A(P("8. Environment variables — full reference", H1))
A(P("All of these live in the owner's <font face='Courier' size='8'>.env</font> locally and in "
    "Vercel &gt; Project &gt; Settings &gt; Environment Variables (Production). "
    "<b>Changing one in Vercel requires a redeploy before it takes effect.</b>", Lead))
A(table(["Variable", "Required", "What it is / where to get it"], [
    ["<font face='Courier' size='8'>SUPABASE_URL</font>", "Yes",
     "Supabase &gt; Settings &gt; Data API &gt; Project URL. <b>Base URL only</b> "
     "(<font face='Courier' size='8'>https://xxxx.supabase.co</font>) — not the "
     "<font face='Courier' size='8'>/rest/v1</font> one."],
    ["<font face='Courier' size='8'>SUPABASE_SERVICE_ROLE_KEY</font>", "Yes",
     "Settings &gt; API Keys &gt; service_role &gt; Reveal. <b>Secret</b> — it bypasses "
     "all row security. Server-only, never in a browser. Not the anon key."],
    ["<font face='Courier' size='8'>APP_PASSCODE</font>", "Recommended",
     "The lock on the web app's door. Any phrase the team remembers. Blank = no lock."],
    ["<font face='Courier' size='8'>ANTHROPIC_API_KEY</font>", "Yes for AI",
     "console.anthropic.com &gt; API Keys. Powers the bot and the receipt photo reader. "
     "Missing = calm “add your key” messages, never a crash."],
    ["<font face='Courier' size='8'>TELEGRAM_BOT_TOKEN</font>", "Yes for bot",
     "@BotFather &gt; <font face='Courier' size='8'>/newbot</font>."],
    ["<font face='Courier' size='8'>TELEGRAM_WEBHOOK_SECRET</font>", "Yes for bot",
     "A long random string you invent. Telegram sends it back on every webhook so fake calls are "
     "rejected. <font face='Courier' size='8'>npm run webhook:set</font> registers it."],
    ["<font face='Courier' size='8'>TELEGRAM_ALLOWED_USER_IDS</font>", "Yes",
     "Every teammate's numeric ID from @userinfobot, comma separated, <b>no spaces</b>. "
     "Fail-closed."],
    ["<font face='Courier' size='8'>OWNER_CHAT_ID</font>", "Yes",
     "The owner's own numeric ID. Where notifications go, and the only ID that may "
     "<font face='Courier' size='8'>/undo</font>."],
    ["<font face='Courier' size='8'>TELEGRAM_TEAM_CHAT_IDS</font>", "Optional",
     "Extra chat IDs that also receive broadcasts — your team group. Negative number, keep "
     "the minus sign."],
    ["<font face='Courier' size='8'>CRON_SECRET</font>", "Yes",
     "A long random string guarding <font face='Courier' size='8'>/api/cron-daily</font>, which "
     "can spend credit. Fails <b>closed</b>: unset = 401 for everyone."],
    ["<font face='Courier' size='8'>EXPENSE_APPROVAL_THRESHOLD</font>", "Optional",
     "The autonomy dial, in your currency. At or under = files itself. Over = asks first. "
     "Default 200."],
    ["<font face='Courier' size='8'>GROUP_REPLY_TO_ALL</font>", "Optional",
     "<font face='Courier' size='8'>true</font> makes the bot answer every group message. Leave "
     "unset for mention-only."],
], [W*0.30, W*0.13, W*0.57]))
A(Spacer(1, 8))
A(callout("Three mistakes that break everything", [
    "<b>1. A trailing newline or space in a key.</b> Copy the value exactly. A stray newline is "
    "an illegal HTTP header and crashes every request.",
    "<b>2. Using the <font face='Courier' size='8'>/rest/v1</font> URL</b> for "
    "<font face='Courier' size='8'>SUPABASE_URL</font>. Base URL only.",
    "<b>3. Using the anon / publishable key</b> instead of service_role. The anon key can't read "
    "past row security, so you get an empty app and no error."], tone=RED,
    bg=colors.HexColor("#FBEEEE")))
A(Spacer(1, 8))
A(P("Settings that live in code, not in Vercel", H3))
A(P("<font face='Courier' size='8'>abang/config.ts</font> is the file a teammate with repo "
    "access can change <b>without holding any secret</b> — which is exactly why it exists.",
    Body))
A(table(["Field", "What it does"], [
    ["<font face='Courier' size='8'>businessName, ownerName, whatYouSell, whoYouServe</font>",
     "WHO — the business the bot works for. Fills the generic bot in."],
    ["<font face='Courier' size='8'>voice, currency</font>", "VOICE — how it talks back."],
    ["<font face='Courier' size='8'>watch</font>",
     "WATCH — what it leads with on “what needs my attention today?”"],
    ["<font face='Courier' size='8'>never</font>",
     "NEVER — your own red lines, stacked <i>on top of</i> the built-in ones."],
    ["<font face='Courier' size='8'>allowedUserIds</font>",
     "Extra people allowed to command the bot, on top of the env var. No redeploy secret needed."],
    ["<font face='Courier' size='8'>briefRecipients</font>",
     "<b>Adds</b> people to the morning brief. Each must have pressed Start on the bot first."],
    ["<font face='Courier' size='8'>briefChatIds</font>",
     "<b>Replaces</b> where the brief goes — set it to the group ID and the owner's private "
     "brief stops."],
], [W*0.40, W*0.60]))

# ============================================================== 9
A(PageBreak())
A(P("9. Collaboration rules", H1))
A(P("Two people, two Claude sessions, one repo. These rules are the difference between a team "
    "and a mess.", Lead))
A(P("Git", H3))
for f in OL([
    "Branch off <font face='Courier' size='8'>main</font>. Never commit straight to it.",
    "Before every push: <font face='Courier' size='8'>git fetch &amp;&amp; git log --oneline "
    "main..origin/main</font>. If someone else moved <font face='Courier' size='8'>main</font>, "
    "<b>rebase</b>.",
    "<b>Never force-push.</b> Never touch a branch you did not create.",
    "Open a pull request and say what changed and why. Branch protection means this is the only "
    "way in.",
    "If a change touches someone else's area, say so in the PR and let them decide — do not "
    "just do it.",
]): A(f)
A(Spacer(1, 4))
A(P("The database", H3))
for f in B([
    "<b>Never blanket-delete <font face='Courier' size='8'>records</font>.</b> Delete by explicit "
    "id or exact title, the way <font face='Courier' size='8'>scripts/purge-demo.mjs</font> does.",
    "Beware any reset script that deletes every row "
    "(<font face='Courier' size='8'>id=gte.0</font>) across "
    "<font face='Courier' size='8'>records</font>, "
    "<font face='Courier' size='8'>agent_actions</font>, "
    "<font face='Courier' size='8'>agent_runs</font> and "
    "<font face='Courier' size='8'>bot_memory</font>. Running one destroys other people's work. "
    "Ask first.",
    "<b>Back up before any destructive change</b> and say where the backup is.",
    "Show what you will import <i>before</i> importing, and say in plain words what you skipped.",
]): A(f)
A(Spacer(1, 4))
A(P("The cron slots", H3))
for f in B([
    "Vercel Hobby gives <b>2 slots, once-per-day granularity</b>. Spending one is a team decision.",
    "Hobby fires crons within a <b>1-hour window</b>, so an 08:15 brief means “shortly after "
    "08:15”. Do not “fix” that by changing the schedule.",
    "<b>Never put a <font face='Courier' size='8'>\"//\"</font> comment key in "
    "<font face='Courier' size='8'>vercel.json</font>.</b> Vercel validates strictly and every "
    "deploy then fails with <i>“Invalid request: should NOT have additional property "
    "//”</i>. JSON has no comments — notes go in "
    "<font face='Courier' size='8'>CLAUDE.md</font>.",
]): A(f)
A(Spacer(1, 4))
A(P("<font face='Courier' size='8'>CLAUDE.md</font> is the team's shared memory", H3))
A(P("Every person's Claude session reads it automatically at the start of a session. Put in it: "
    "who owns which area, which decisions must not be silently reversed and <i>why</i>, the "
    "database rules, and the pre-push routine. When a decision gets made in chat, write it here "
    "or it will be undone by someone else next week.", Body))

# ============================================================== 10
A(Spacer(1, 8))
A(P("10. The safety model — the dial, not the leash", H1))
A(P("A good employee does not ask permission to staple paper, but must ask before spending your "
    "money. Every agent in the system works the same five steps: <b>LOOK &gt; ASSESS &gt; ASK "
    "&gt; ACT &gt; RECORD</b>, and everything it does lands in the audit trail.", Lead))
A(table(["Zone", "What it covers", "What happens"], [
    ["<b>GREEN — small and reversible</b>",
     "Add a task, add a lead, file a small receipt, back up a photo.",
     "It just does it, then tells you. There is an <font face='Courier' size='8'>/undo</font>."],
    ["<b>AMBER — consequential</b>",
     "Log cash in, mark an invoice paid, move a lead's stage, an expense over the threshold.",
     "It proposes and waits. Someone taps Approve before anything writes."],
    ["<b>RED — never, ever</b>",
     "Move money, delete records, message a customer on its own.",
     "The bot literally cannot. It is welded shut in the code and no setting opens it."],
], [W*0.26, W*0.40, W*0.34]))
A(Spacer(1, 7))
A(P("Ask it to draft a customer follow-up and it hands you copy-paste text — there is no "
    "send button in its hands. The <font face='Courier' size='8'>EXPENSE_APPROVAL_THRESHOLD</font> "
    "is a dial you set: new agent &gt; dial low; trusted agent &gt; dial up. You do not "
    "approve everything; you set the dial.", Body))
A(Spacer(1, 4))
A(callout("Never tap Approve to “see what happens”", [
    "Pending proposals in a live deployment can be real money. When you or your Claude session is "
    "testing, create a proposal and leave it pending — the owner decides."], tone=RED,
    bg=colors.HexColor("#FBEEEE")))

# ============================================================== 11
A(PageBreak())
A(P("11. Troubleshooting", H1))
A(table(["Symptom", "Most likely cause", "Fix"], [
    ["Tagging the bot in the group does nothing",
     "Telegram privacy mode is still ON.",
     "@BotFather &gt; <font face='Courier' size='8'>/setprivacy</font> &gt; your bot &gt; "
     "<b>Disable</b>. Then try again."],
    ["The bot ignores one teammate",
     "Their numeric ID is not on the allowlist. In a group it stays silent rather than publishing "
     "their ID.",
     "Have them send <font face='Courier' size='8'>/id</font> in a <b>private</b> chat, add it to "
     "<font face='Courier' size='8'>TELEGRAM_ALLOWED_USER_IDS</font>, redeploy."],
    ["Nobody can use the bot at all",
     "Both the env var and <font face='Courier' size='8'>allowedUserIds</font> are empty — "
     "fail-closed means nobody.",
     "Add at least the owner's ID and redeploy."],
    ["App loads but every tab is empty",
     "Using the anon key instead of service_role.",
     "Swap in the service_role key and redeploy."],
    ["Every request crashes",
     "A trailing newline or space inside a key.",
     "Re-paste the value exactly, with no extra line."],
    ["Supabase calls all fail",
     "<font face='Courier' size='8'>SUPABASE_URL</font> includes "
     "<font face='Courier' size='8'>/rest/v1</font>.", "Use the base project URL only."],
    ["Changed a variable, nothing changed",
     "Vercel needs a redeploy to pick up env changes.", "Redeploy, then re-check."],
    ["Every deploy fails: “should NOT have additional property //”",
     "A <font face='Courier' size='8'>\"//\"</font> comment key in "
     "<font face='Courier' size='8'>vercel.json</font>.",
     "Delete it. Put the note in <font face='Courier' size='8'>CLAUDE.md</font>."],
    ["Morning brief never arrives",
     "No recipient set, or the person never pressed Start on the bot.",
     "Set <font face='Courier' size='8'>OWNER_CHAT_ID</font> / "
     "<font face='Courier' size='8'>TELEGRAM_TEAM_CHAT_IDS</font>, press Start, then "
     "<font face='Courier' size='8'>npm run brief:test -- https://your-app.vercel.app</font>."],
    ["Brief arrives at the wrong time",
     "Hobby's 1-hour cron window. Not a bug.",
     "Treat the schedule as “shortly after”. Do not change it."],
    ["Webhook looks dead",
     "Webhook points at an old domain, or has a pending error.",
     "<font face='Courier' size='8'>npm run webhook:info</font>, then "
     "<font face='Courier' size='8'>npm run webhook:set -- https://your-app.vercel.app</font>."],
    ["AI features show “add your key”",
     "<font face='Courier' size='8'>ANTHROPIC_API_KEY</font> missing. Degrades calmly by design.",
     "Add it in Vercel and redeploy."],
], [W*0.28, W*0.34, W*0.38]))
A(Spacer(1, 8))
A(P("The safe health check", H3))
A(P("Fetch <font face='Courier' size='8'>https://your-app.vercel.app/api/telegram</font>. It "
    "reveals only <i>whether</i> values exist — never the values — so it is safe to "
    "read out or screenshot. The <font face='Courier' size='8'>allowedUsers</font> count must "
    "equal the number of people you added.", Body))

# ============================================================== 12
A(PageBreak())
A(P("12. Go-live checklist", H1))
A(P("Tick every line before you tell the team it is ready.", Lead))
def check(title, items, tone=INK):
    rows = [[Paragraph("<b>%s</b>" % title, S("chk", parent=Cell,
             fontName="Helvetica-Bold", textColor=colors.white))]]
    for i in items:
        rows.append([Paragraph("[  ]&nbsp;" + i, Cell)])
    t = Table(rows, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), tone),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F7F9FB")]),
        ("GRID", (0,0), (-1,-1), 0.5, RULE),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 4.5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4.5),
    ]))
    return KeepTogether([t, Spacer(1, 8)])

A(check("Repo", [
    "Repo created from the template and set to <b>private</b>",
    "Every teammate added as a collaborator with Write access",
    "<font face='Courier' size='8'>main</font> protected — pull request required before merge",
    "<font face='Courier' size='8'>.env</font> is gitignored and was never committed",
    "<font face='Courier' size='8'>CLAUDE.md</font> written: areas, decisions, database rules, "
    "pre-push routine",
]))
A(check("Database and app", [
    "Supabase project created and <font face='Courier' size='8'>supabase/schema.sql</font> run in full",
    "<font face='Courier' size='8'>SUPABASE_URL</font> is the base URL, key is <b>service_role</b>",
    "<font face='Courier' size='8'>npm run dev</font> works and the tabs render",
    "Deployed on Vercel with <b>every</b> variable in Production",
    "Live URL opens on a phone and Add to Home Screen works",
    "<font face='Courier' size='8'>APP_PASSCODE</font> set, and told to the team <b>out loud</b> "
    "— never pasted into a group chat",
]))
A(check("Bot and group", [
    "Bot created via @BotFather and the token is in Vercel",
    "<font face='Courier' size='8'>npm run webhook:set</font> run against the live domain",
    "<font face='Courier' size='8'>npm run webhook:info</font> shows the right domain, no pending error",
    "@BotFather &gt; <font face='Courier' size='8'>/setprivacy</font> &gt; <b>Disable</b> done",
    "Group created, every teammate in it, the bot in it",
    "Group ID captured with <font face='Courier' size='8'>/id</font>, minus sign kept",
    "<font face='Courier' size='8'>TELEGRAM_ALLOWED_USER_IDS</font> holds every teammate, no spaces",
    "<font face='Courier' size='8'>OWNER_CHAT_ID</font> is the owner's own ID",
    "<font face='Courier' size='8'>/api/telegram</font> shows the right "
    "<font face='Courier' size='8'>allowedUsers</font> count",
    "Everyone has pressed <b>Start</b> on the bot in a private chat",
]))
A(check("Proven working", [
    "Someone other than the owner @mentions the bot in the group and gets an answer",
    "A small receipt files itself; one over the threshold asks first (left pending, not approved)",
    "<font face='Courier' size='8'>npm run brief:test</font> delivers the brief to the group",
    "<font face='Courier' size='8'>abang/config.ts</font> filled in — the bot talks like "
    "your business, not a generic bot",
    "Invite (Prompt C) sent, with the passcode said out loud separately",
]))
A(Spacer(1, 4))
A(callout("Day two", [
    "Feed it your real numbers — 10–20 rows to start. In Claude Code: "
    "<i>“Here are my real business numbers. Import them into my Supabase records table using "
    "scripts/import.mjs. Show me what you'll import first, and tell me in plain words anything "
    "you skipped.”</i>",
    "Then build your first custom agent from the template in "
    "<font face='Courier' size='8'>agents/_template/</font>, and start it on the low end of the "
    "dial."], tone=GREEN, bg=colors.HexColor("#EFF7F3")))
A(Spacer(1, 10))
A(P("End of guide · The source markdown lives at "
    "<font face='Courier' size='8'>docs/team-start-prompts.md</font> in the repo, so it stays "
    "editable and reviewable alongside the code.", Foot))

doc.build(s)
print("OK", OUT)
