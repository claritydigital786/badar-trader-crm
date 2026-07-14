# Badar Trader CRM — Handoff

_Last updated: 2026-07-13, end of session. Written for a fresh Claude Code session with
zero memory of prior conversations — everything you need to orient should be here._

This replaces the previous version of this doc (also dated 2026-07-13, earlier the same
day). That version was itself accurate but became incomplete once this session discovered
and fixed a much bigger problem: **`main` and `feat/bot-human-handoff` had silently
diverged for ~2 weeks**, so most of what that doc called "done and verified live" was live
only on the Supabase *backend* — the CRM frontend on production had none of it. See below.

---

## Start here: repo state right now

```
$ git branch -v
  feat/bot-human-handoff              35bc329 [ahead 15] Redesign agent dashboard...
* integration/merge-bot-human-handoff c703d2c Merge feat/bot-human-handoff into...
  main                                15a7bf0 Redesign agent dashboard...
```

- **You are (or should be) on `integration/merge-bot-human-handoff`.** This branch is based
  off `main` with `feat/bot-human-handoff` merged into it. It has **not** been pushed to
  `origin`, and `main` has **not** been touched.
- There's one stash: `stash@{0}: On feat/bot-human-handoff: local claude settings before
  merge work` — just a local `.claude/settings.local.json` diff (Claude Code permissions,
  not product code). Safe to `git stash drop` whenever, or `git stash pop` if you care about
  those specific permission grants.
- Working tree is otherwise clean (`git status --short` shows nothing outside
  `node_modules/`, which is now gitignored).
- Remote: `https://github.com/claritydigital786/badar-trader-crm.git`, branch `main` is what
  Vercel auto-deploys to **https://crm.badartrader.com**.

## The actual problem this session found and fixed

`main` and `feat/bot-human-handoff` diverged on 2026-07-07 at commit `051cae4` and grew
apart independently for the following two weeks:
- `feat/bot-human-handoff` gained 20 commits `main` never got: the WhatsApp bot's
  language/menu flow, agent round-robin + nudge reminders, bot→human handoff (2-miss
  escalation), KYC/deposit-screenshot file storage, and **real** automation-rule firing
  (Postgres triggers → Edge Function → actual WhatsApp send / actual agent assignment).
- `main` gained 26 commits `feat` never got: Meta Ads dashboard fixes, a full branding pass
  (bull+chart favicon across pages), a thank-you page, a public track-record page, a ticker
  layout fix, and a fix for the conversations list's unread-state logic.

**Concretely verified** (not assumed) by loading the live production site: production's
`simulator.html` still shows pre-divergence bot copy, and the Leads tab has no "Needs Human"
filter — none of `feat`'s CRM-facing work had reached real users. Only the Supabase Edge
Functions and DB schema were live, because those get deployed straight from the CLI,
independent of git/Vercel.

**This session merged the two branches** into `integration/merge-bot-human-handoff`.
Real conflicts were confined to three files — `index.html`, `simulator.html`,
`supabase/schema.sql` — resolved as follows:

- **Conversations list** (`index.html`, `renderConversations()`): both branches edited the
  same function for unrelated reasons (`main` added an accurate unread-count nav badge,
  `feat` added tier filtering/`computeLeadTier`). Combined — both features coexist.
- **Simulator copy**: kept `main`'s live wording (Premium Signalling Group naming,
  no-asterisk referral codes, the real hosted `join.html` form URL — `feat` still pointed at
  a Google Form placeholder) and layered `feat`'s 2-miss handoff logic (`misses`,
  `handedOff`, `escalate()`) on top.
- **Dropped** `feat`'s unused `premiumFlow()` function and its course copy ($200/3-month) —
  it conflicts with *both* `main`'s version (free, no price stated, 1-month) *and* this
  doc's earlier claim of $250. **None of the three agree on the actual course price/duration
  — this is unresolved, flagged for Badar, not decided unilaterally.**
- **Schema**: `main`'s `signals` table (powers the track-record page) and `feat`'s Phase
  4/6/7/8 additions (bot state columns, KYC/deposit storage policies, automation triggers)
  are independent additive sections — kept both, no actual conflict in substance.
- **Cleanup, dropped from the merge as junk** (not product code): `node_modules/` (688 files
  had been accidentally committed on `feat`, no `.gitignore` existed anywhere — added one
  now), a stray base64-encoded HTML dump (`_push.txt`), four one-off local push/deploy
  AppleScripts, a random screenshot, a stale "delete me" marker file.

### Verified on the merged branch (with evidence, locally — not production)
- `node --check` on the extracted inline `<script>` of both `index.html` and
  `simulator.html` — no syntax errors.
- Demo mode (`enterDemoMode()` in the browser console — there's no UI button for it, it's
  dead-but-present code) on a local static server: Leads tab shows the "⚠ Needs Human" badge
  and filter; Automation tab's `submitAutomationRule` function includes the
  `assign_agent_id` fix; Conversations tab renders without console errors.
- **Clicked through the simulator end-to-end**: language → menu → two unanswerable
  messages → header badge flips to **HANDED OFF**, escalation message with the WhatsApp
  number appears, a third message gets no bot reply (silent, as designed). Screenshotted at
  each step.

### NOT verified — and exactly why
- **Saving a whatsapp/assign_agent automation rule against the real database** — needs an
  authenticated admin session. Claude Code will not type a password into a login form
  (hard rule, applies even to your own site) — this needs a human to click through it once,
  or a service-role key handed to a script.
- **The full trigger chain firing live** (lead insert → Postgres trigger → `fire-automation`
  Edge Function → real WhatsApp send) — testable, but only by writing a test lead into the
  production DB, which wasn't done without explicit go-ahead (and needs a decision on what
  phone number to use so nothing real gets messaged by accident).
- **Live WhatsApp round-trip** — needs an actual message sent to +92 371 5773903 from a
  real phone; outside what a coding session can do by itself.

---

## 🔴 Open items, in rough priority order

### 1. Push `integration/merge-bot-human-handoff` — decide when/how
This is the biggest lever available: right now the branch is fully reconciled and locally
tested, sitting on disk, not pushed. Options, cheapest first:
- Push the branch to origin (`git push -u origin integration/merge-bot-human-handoff`), open
  a PR into `main`, let Badar/whoever review, then merge normally.
- Or just merge it straight into local `main` and push `main` — higher trust, no PR step.
Either way, merging into `main` triggers an immediate Vercel production deploy, so this
should be a deliberate, confirmed decision, not something to do reflexively.

### 2. Course price/duration mismatch (see above) — needs Badar's answer
Three different claims exist across the codebase's history: $200/3-months (old `feat` copy,
now dropped from the merge), free/no-price/1-month (current `main` copy, what the merge
kept), $250/free (this doc's own earlier — possibly also stale — claim). Get a real answer
from Badar and make the simulator, the webhook's fallback copy, and this doc all agree.

### 3. Automation rules: real firing exists now, but is genuinely untested end-to-end
The Postgres triggers + `fire-automation` Edge Function are real code (not the pure-CRUD
"Test button only" state described in the prior version of this doc), deployed to the live
Supabase project. But nobody has watched a real lead event actually produce a real WhatsApp
send or a real agent reassignment. Worth a deliberate, permissioned test before trusting it.

### 4. Ad creatives — copy finalized, images not yet generated
Five Meta ad creative prompts are finalized (Batch 24, "Forex Mastery Programme" as the
course name — note this conflicts with whatever gets decided in item 2 above — leads with
the Premium Signals Group + free course offer, "$500 in your account" instead of "deposit",
no em dashes, footer stripped to logo only, "FREE" as an enlarged badge). Muhammad still
needs to run these through an image generator and confirm the results — the last one tested
was creative #5; #1–#4 haven't been re-tested with the latest copy fixes.

### 5. `.claude/settings.local.json` stash
Trivial, but don't forget it's sitting in `git stash list` — local Claude Code permission
grants, not product code. Pop or drop whenever convenient.

---

## Key facts & where things live

- **Production site:** https://crm.badartrader.com (Vercel, deploys from `main` only —
  not from any feature branch, confirmed this session).
- **Supabase project:** `vfskqzgphrunjxquqpks`. WhatsApp credentials live in the
  `public.settings` table (`wa_access_token`, `wa_phone_number_id`) — not Edge Function
  secrets, though the secrets are also kept updated as a fallback.
- **Campaign number:** +92 371 5773903 — live, registered, webhooks subscribed, Meta app
  published (Live mode).
- **Agents:** Ehsan Wazir, Muhammad Hanzala. Syed Hamza removed/suspended.
- **Referral links:** Exness `https://one.exnesstrack.org/a/eatgh2cl7y` (code eatgh2cl7y);
  Do Prime `https://my.dooprime.com/links/go/45031` (code 45031).
- **Public simulator:** [simulator.html](simulator.html) — browser demo of the bot flow.
  On `integration/merge-bot-human-handoff` this now includes the 2-miss handoff logic; on
  `main` (production) it currently does not.
- **Storage buckets:** `kyc-documents`, `deposit-screenshots` — both private, admin full
  access + agent read-only for their own assigned leads.
- **Cron job:** `nudge-agents-every-5-min` (pg_cron + pg_net), fires `nudge-agents` Edge
  Function every 5 minutes. (Existence of the cron job itself wasn't independently
  re-verified this session — inherited claim from the prior handoff doc.)
- **Anon/publishable key is hardcoded in `index.html`/`simulator.html`/`landing.html`** —
  this is intentional (RLS protects the actual data; the anon key is meant to be public for
  a Supabase-backed static site), not a leak.
- **`.claude/launch.json`** now exists (added by the `feat` branch, carried through the
  merge) — a `static` config that runs `python3 -m http.server 8743` for local testing via
  the Browser pane's `preview_start`.

## Demo script (no WhatsApp needed)

Open [simulator.html](simulator.html) (on `integration/merge-bot-human-handoff` or after it
reaches production): pick a language, walk the main menu → join flow → pick a broker → the
$500 requirement → see the Premium Signalling Group confirmation. Send two messages the FAQ
engine can't match in a row to see the bot hand off to a human and go silent.
