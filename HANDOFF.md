# Badar Trader CRM — Handoff

_Last updated: 2026-07-14 (mid-session, cut short by usage limit — written fast, verify
claims before trusting them further). For a fresh Claude Code session with zero memory of
prior conversations._

Prior version of this doc (2026-07-13) covered the main/feat branch-divergence discovery
and merge into `integration/merge-bot-human-handoff`. That merge is still the base — a
**different session** (not the one that wrote the 07-13 doc) then did 10 more commits on
top of it, described below. This doc adds that work; the 07-13 context about the branch
divergence itself is still accurate and not repeated in full here.

---

## Repo state right now

```
$ git branch --show-current
integration/merge-bot-human-handoff   (still NOT pushed to origin, NOT merged to main)
$ git log --oneline -11
0812f83 feat: Meta Lead Ads webhook — create CRM record + WhatsApp welcome on new lead
cf8a916 fix: explain and log WhatsApp send failures instead of a silent toast
3e89e96 fix: add Broker ID and split First/Last Name to the leads CSV export
a8031f1 fix: conversion-hook was silently failing on every single call
dec900b feat: quick-links panel, Comm Log status filter, agent follow-ups widget
67c7f4a fix: render WhatsApp screenshots inline in Conversations; sync stale webhook
0c738fd feat: add signals-form.html and course-form.html lead-capture pages
1e86c71 feat: add Comm Log tab to the agent dashboard
3a36768 feat: add Conversations tab to the agent dashboard
4c2de73 fix: slow nudge-agents reminders to 15 min, restrict to 9am-6pm PKT
105f98c docs: rewrite handoff for a fresh session — branch divergence + merge status
```
Only uncommitted change is `.claude/settings.local.json` (local Claude Code permissions,
not product code — ignore it or commit it, doesn't matter). There's also an old stash
(`stash@{0}`, same file, from the earlier merge session) — safe to drop.

**index.html has a known, not-yet-fixed bug right now**: `saveLeadNotes` is defined twice
(lines 3304 and 3315), byte-identical, so it's harmless dead code — but it was found
mid-audit and never actually removed. Trivial fix, just delete lines 3315–3324.

## What the last session (this one, cut short) actually did

### 1. Diagnosed why agent WhatsApp replies were silently failing — FIXED, verified
Not a credentials or CORS problem (both tested directly and ruled out — bot sends worked
fine same-day, and a direct API call from the browser got a clean response, not a CORS
block). Real cause: **WhatsApp's 24-hour customer-service window** — free-form replies are
rejected after 24h of lead silence; only pre-approved templates work after that. Confirmed
against live data: 4 assigned leads (Syed Shair Yazdan, Farhan Ilyas, Usama Chandr, Abdul
Wasay) were already past the window. Fixed and shipped:
- Failed sends are now logged (previously only a toast, no record — undiagnosable after
  the fact).
- A warning banner shows agents *before* they try replying to a stale conversation.
- **NOT fixed**: no WhatsApp message template exists to actually re-open a stale
  conversation. If leads regularly go quiet 24h+, this needs a template submitted to Meta.

### 2. Meta Lead Ads webhook (`meta-leadgen-webhook`) — built, deployed, partially blocked
Built and deployed. Verified end-to-end with a disposable test lead: insert → DB trigger
fired → automation rule matched → WhatsApp template rendered → real Meta API call attempted
(logged, only failed on the fake test phone number's format — proves it reached Meta
correctly). Test lead + rule cleaned up afterward.
**Blocked, not verified, needs Badar/you to act — not fixable from a coding session:**
- The stored Meta token's scopes are `ads_management, ads_read,
  whatsapp_business_management, whatsapp_business_messaging` — **missing
  `leads_retrieval`**, required to actually fetch Lead Ads submissions. Every real webhook
  call will fail until this is granted (Business Settings → System users → wa-bot →
  Generate token → tick `leads_retrieval` + `pages_read_engagement` if listed → paste into
  CRM's Meta Access Token field). If `leads_retrieval` isn't offered, the app needs the
  "Lead Ads" use case added first (App Dashboard → Use cases → Add).
- The webhook isn't subscribed yet in Meta's console (App → Webhooks → Page object →
  `leadgen` field → this function's URL + verify token), and Badar's Facebook Page needs to
  be linked to the app.
- App Review status for `leads_retrieval` in production — can't be checked remotely.
- The welcome-message template is a **draft, left inactive** on purpose — didn't want
  unapproved copy going to real leads: *"Hi {{name}}! 👋 Thanks for your interest in Badar
  Trader. A member of our team will be in touch with you shortly on this number."*
  Editable/activatable from the Automation tab whenever approved.

### 3. Agent dashboard ticker cut-off — UNVERIFIED, unresolved
User reports it's "still cut" after a claimed fix attempt. The browser verification tool
had an outage during the prior session (tried 3 times, stayed down) — so the only check
done was a **code-level diff** between admin's and agent's ticker markup, which came back
byte-identical. That rules out a code difference but does **not** confirm the ticker
actually renders correctly — this needs a real screenshot check with the browser tool,
which hasn't happened yet. Don't assume this is fixed.

### 4. Task 1 from the handover doc (Agents Dashboard audit) — IN PROGRESS, cut off mid-check
Was auditing the agent login/init flow, the follow-ups widget, dashboard stats population,
and tab builders for correctness/admin-only gating. Found the `saveLeadNotes` duplicate
(above). Was about to check whether the KYC tab and Comms tab builders properly gate
admin-only actions when rendered for an agent — **that check never happened**. Pick this up
next: grep for where agent-vs-admin views branch on KYC/Comms tab rendering and confirm
agents can't hit admin-only actions (e.g. approving their own KYC, seeing other agents'
comms) through the UI.

### 5. `nudge-agents` was spamming agents' personal WhatsApp — cron unscheduled, ROOT CAUSE NOT FOUND
2026-07-14: Badar reported agents (screenshot evidence: Muhammad Hanzala's phone) getting
**duplicate** "Reminder: a lead in the CRM is still waiting on you" messages — 4 identical
ones stamped 2:30pm, 2 more at 2:45pm, none acknowledged. That's not the intended ~15-min
cadence; something is causing multiple sends per cron invocation (or multiple overlapping
cron entries). Immediate action taken: both cron jobs were unscheduled live —
```sql
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'nudge-agents%';
```
— confirmed via the SQL Editor returning 2 rows, both `true`. **No reminders fire at all
right now, to anyone.** The `nudge-agents` Edge Function itself is still deployed (nothing
else in the codebase calls it directly, so this is safe), just not scheduled.
**Explicitly deferred by Badar — root cause not investigated yet.** Before ever
re-scheduling this: check for duplicate/overlapping `cron.job` entries (the schema has a
history of stale job names — see the `nudge-agents-every-5-min` vs `-every-15-min` rename in
`supabase/schema.sql` §23), and check whether `nudge-agents/index.ts` itself can send more
than one message per invocation per lead (e.g. a loop bug, or querying the same
not-yet-acknowledged lead more than once). Also worth revisiting whether pinging agents'
*personal* WhatsApp numbers this way was ever explicitly signed off by Badar at all, versus
just being an assumed-reasonable default from an earlier build session — surfaced as a
direct concern this session, not resolved.

---

## Open items carried over from the 07-13 merge (still open)

1. **Push `integration/merge-bot-human-handoff` to `main`** — still not done. 10 more
   commits have landed on it since, all real product work, none pushed to origin. This is
   the single biggest thing sitting undeployed.
2. **Course price/duration mismatch** — unresolved, needs Badar's actual answer (see 07-13
   handoff section for the three conflicting claims: $200/3mo vs free/1mo vs $250/free).
3. **Automation rule firing** — real code exists and was proven to work with a test lead,
   but no real production lead has gone through it live yet.
4. **Ad creatives** — images still not generated (Muhammad's task, not a coding task).
5. From the original CRM_Handover_Tasks list: conversation short links (2), lead form fields
   matching Badar's exact list — first/last name, email, broker ID, screenshot upload (6),
   WhatsApp-shared screenshots saving into the CRM record (8b), the All Leads filter bug (9),
   OCR/anti-fraud beyond manual review (7), full mirror-dashboard with locked sections (10 —
   blocked on Badar's decision re: which sections stay locked vs. hidden entirely).

## Key facts (unchanged from 07-13 doc)

- Production: https://crm.badartrader.com (Vercel, deploys from `main` only).
- Supabase project: `vfskqzgphrunjxquqpks`.
- Campaign WhatsApp number: +92 371 5773903.
- Agents: Ehsan Wazir, Muhammad Hanzala.
- Full detail on branches, buckets, cron jobs, referral links: see git history of this file
  (`git log -p -- HANDOFF.md`) for the fuller 07-13 version if needed.

## Rule this session was operating under (keep following it)

Never say "Fixed" without end-to-end test evidence. Anything untestable gets labeled
UNVERIFIED with the exact reason it couldn't be tested. Keep going through inspect →
implement → test → correct until actually verified — don't stop at "should work."
