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

### 3. Agent dashboard ticker cut-off — FIXED and verified in-browser (2026-07-14)
Root cause found by finally rendering it live: the TradingView ticker-tape widget is 46px
on wide screens but switches to a **74px two-row layout below ~1280px viewport width**
(confirmed 74px at 1024px, 700px, and 375px). The CRM hard-coded 46px for the bar and
every layout offset (.app-shell, .sidebar, .main-content), so on laptops/mobile the
price row was clipped in half — identical markup for admin and agent, which is why the
old code diff came back clean. Fix (index.html): all offsets now derive from a
`--ticker-h` CSS variable, kept in sync with the iframe's real rendered height by a small
script before `</body>` (ResizeObserver + MutationObserver + 1.5s backstop poll). Verified
by screenshot at 1280 (46px, single row), 1024 and 375 (74px, both rows fully visible,
content shifted down, no overlap), and ≤560px-height viewports (ticker hidden, var goes
to 0, app fills the screen — pre-existing behavior preserved). NOT yet deployed — lives
on this unpushed branch like everything else.
Separate cosmetic issue spotted: the `PSX:KSE100` symbol shows a red error badge — Meta
widget can't resolve PSX data. Ask Badar whether to drop it or pick a substitute; left
as-is deliberately (don't change user-facing content without showing him first).

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

### 6. ALL agents blocked from sending WhatsApp replies — ROOT CAUSE FOUND, SQL fix ready, needs one paste
2026-07-14: Badar's team escalated hard (10+ pings, screenshot from Muhammad Hanzala's
agent account): every Send attempt in Conversations shows *"WhatsApp token not set — go to
Meta Integration and save your credentials first."* The token IS set — that message is a
red herring. Real cause: `sendConvMessage()` (index.html ~line 4631) fetches
`wa_phone_number_id`/`wa_access_token` from `public.settings` **in the agent's browser
session**, but the `"settings: admin only"` RLS policy (schema §"SETTINGS: admin only")
hides every settings row from non-admins. RLS denial on SELECT returns zero rows, *not an
error*, so the code falls into its "credentials empty" branch. Admin sends work; every
agent fails. Bot sends were never affected (edge functions use the service role).
Fix written as **schema.sql §30 (Phase 12)**: an RLS policy exposing only those two keys
to authenticated users. **Not applied yet** — needs the §30 block pasted into Supabase
SQL Editor (no service-role access from these sessions). Agent `communications` INSERT
policies were checked and are fine — the settings read is the only blocker, so sends
should work immediately after the paste. UNVERIFIED until an actual agent send succeeds.
UPDATE, same day: §30 was pasted and ran ("Success. No rows returned") — the unblock is
LIVE on production. Awaiting an agent's confirmation of an actual successful send.
Known trade-off, flagged to Badar: with §30 applied, any agent's browser can read the raw
WhatsApp access token.

The proper follow-up is now BUILT but NOT DEPLOYED: `supabase/functions/send-wa-message`
is a JWT-verified Edge Function proxy (checks caller is admin or the lead's assigned
agent, reads credentials server-side via the same env-first/settings-fallback pattern as
whatsapp-webhook, sends, logs to communications; failures go to communication_logs).
`sendConvMessage` in index.html now tries it first and falls back to the legacy
in-browser send when the function is unreachable. Fallback detection was verified against
the live project: an undeployed function surfaces in the browser as a CORS/fetch failure
with NO http status (not a 404!) — the code treats any response-less error as
"unavailable". Page loads clean, all send functions defined, zero console errors.
To finish (in order, after the frontend branch is deployed):
1. `supabase login && supabase functions deploy send-wa-message` (keep JWT verification
   ON, i.e. no --no-verify-jwt flag) — or paste the function in Dashboard → Edge Functions.
2. Have one agent and one admin send successfully (their sends now go through the proxy).
3. Drop the §30 policy: `DROP POLICY "settings: agents read wa send creds" ON public.settings;`
   Agents keep sending fine (via the proxy); the token disappears from their browsers.
Do NOT do step 3 before steps 1-2 or agents are blocked again.

---

### 7. Bot dead-ends + bot/agent crosstalk (both reported by Badar with video/screenshot evidence, 2026-07-14 evening)
Two distinct bot problems surfaced from live usage:
(a) **Resolved-lead dead end — FIXED in code, NOT DEPLOYED.** Once a lead hits `declined`
(said no to the $500), every later message — even "Hi" days later — got the canned
"[post-resolution acknowledgement]" ("a team member will follow up") forever, and no
team member ever does (reminders are off). Badar's brother hit this testing the bot.
Badar's decision: within 24h of the decline keep the polite ack; after 24h+ of silence a
returning declined lead RESTARTS the flow from scratch (greeting + language picker).
Implemented in whatsapp-webhook `runBotStep` default case (`DECLINED_RESTART_HOURS = 24`,
gap measured off `leads.updated_at`, which the is_unread bump keeps at last-interaction
time; the lead object is read BEFORE that bump so the current message doesn't reset its
own gap). `qualified` leads deliberately exempt — they hold concrete next steps and may
return with a deposit screenshot. esbuild parse-checked; UNVERIFIED live until the
webhook is redeployed (`supabase functions deploy whatsapp-webhook --no-verify-jwt` —
it must keep --no-verify-jwt, Meta calls it unauthenticated).
NOTE: the <24h ack still says "a team member will follow up shortly", which stays untrue
while reminders are off — wording change not made (user-facing copy needs Badar's OK).
(b) **Bot/agent crosstalk — NOT FIXED, awaiting Badar's go-ahead.** Video evidence (lead
"MNA"): agent manually messaged a lead mid-bot-flow; the lead's replies to the agent were
consumed by the bot's stage machine (confused apology, then decline fallback). Proposed
fix: agent/admin manual send (both send paths) sets a takeover flag the webhook respects,
e.g. needs_human + a handoff_reason the auto-expiry treats like an explicit request.
Offered to Badar; he pivoted to (a) without answering — ask again before building.

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

---

## 2026-07-19 session — branding fix parked, signalling deferred to v2 build

**Branding fix: DONE locally, verified in browser, deliberately NOT committed/deployed.**
Muhammad's explicit instruction: note it now, ship it during the v2 build, not before.
Uncommitted working-tree changes (keep them):
- `assets/bull.svg` — removed baked-in white background path (fill rgb(254,254,254)),
  tightened viewBox from `0 0 178 130` to `46 38 119 94` (artwork's true bbox).
- `assets/favicon.svg` — NEW file: bull centered on #0f172a rounded-square tile.
- `index.html` — `.sidebar-brand` now text-align:center + img rule (130px centered);
  logo `<img>` added to the agent sidebar too (it had none); favicon link now points
  to `/assets/favicon.svg?v=2`; both logo srcs cache-busted with `?v=2` (old white
  SVG is cached in users' browsers, the query string is required).
- ALSO INSTRUCTED (not yet implemented anywhere): the logo must appear on the CRM
  dashboard itself, not only in the sidebar/favicon. Currently the login card is
  text-only and the dashboard header has no logo. At build time: add it to the login
  card and the dashboard top bar (confirm exact placement with Muhammad then).

**Signalling section: investigated, real build deferred to v2.** Findings (verified in code):
- `_subscribers` (~4,150) are fake, generated in-browser each load (index.html ~line 5141).
  No subscribers table in DB. Adds/imports vanish on refresh.
- `broadcastSignal()` demo mode fakes success ("Delivered to all N") after a 900ms timeout —
  the #1 trap: success message with nothing sent. Real-token path would send from the
  browser (CORS-blocked, hardcoded WABA id, fake numbers) — dead code in practice.
- AI Signals tab = Math.random() simulation, admitted by its own disclaimer.
- "Groups 1/2/3" are tags for individual sends, NOT WhatsApp group chats (Cloud API
  cannot post to group chats at all — Meta restriction).
- v2 go-live needs: real `subscribers` table, opt-in list (signals-form.html already
  feeds leads with form_type 'signals'), server-side send via an edge function like
  send-wa-message, Meta tier limits (~250/day unverified → verify + tier up for ~4k),
  template approval for messages outside the 24h window.
- OPEN QUESTION for Muhammad: does "Subscribers" mean everyone from the signals signup
  form, or a separately managed paid list? Blocks the v2 design of this section.

**WhatsApp bot v1 pain point (Muhammad, 2026-07-19) + agreed v2 approach.** v1 bot never
matched his instructed flow. Root causes found in code: flow exists only as code (975-line
webhook switch, wording inline in EN+UR); simulator.html ("Simulator v3") holds a DIFFERENT,
drifted version of the flow than the deployed webhook; instructions were applied as spot
patches with no shared map; no pre-live click-through. v2 approach he was given: a numbered
Flow Map document as single source of truth (every screen = numbered box with exact EN/UR
text, buttons, and destination box numbers + retry/resume/escalation rules), Muhammad
instructs by box number, bot engine reads the flow as data (no hardcoding), simulator runs
from the same map, and nothing goes live before he approves the map and click-through.

**Mobile access (Muhammad, 2026-07-19).** Asked whether admin + agents can use the CRM on
phones (Ehsan/Hanzala leave office 6pm PKT; after-hours leads went uncontacted in v1).
Verified live at 375px: responsive layout already exists and works (cards stack, hamburger
sidebar at <=768px, toggleSidebar()). Answer given: yes, same URL + login on any phone
browser, nothing to install. V2 items filed: (a) full mobile usability pass tab-by-tab —
wide tables (All Leads/Reports) and the Conversations two-panel screen are cramped on
phones, never systematically tested; (b) after-hours coverage isn't just access: agents
need a WhatsApp alert when a new lead arrives after 6pm — nudge-agents is still
UNSCHEDULED due to the 07-14 duplicate-spam bug (root cause never found), fix it before
re-enabling and add the after-hours new-lead alert.

**"Subscribers" definition ANSWERED (Muhammad, 2026-07-20).** A subscriber = a member of
one of the signalling communities (real WhatsApp communities). Separately managed list,
but fed by the signals form: every signals-form signup is redirected into the subscribers'
community. v2 design implication: signups create pending entries; community membership
makes them subscribers; the CRM Subscribers section must mirror actual community
membership grouped by community — not an auto-dump of form signups, not a standalone list.
This unblocks the signalling section's v2 design (see 2026-07-19 findings above).

---

## 2026-07-20 — V2 BUILD STARTED (Muhammad gave explicit go-ahead)

Planned steps, in order (written BEFORE doing them, per discipline):
1. Commit the parked branding fix + these handoff notes on the integration branch.
2. Merge integration/merge-bot-human-handoff into main.
3. Push the repo to GitHub (check remote/gh auth first; if unavailable, record blocker and continue).
4. Deploy to production (figure out the deploy path: vercel CLI vs git-connected) and verify the branding fix live on crm.badartrader.com.
5. Draft the bot Flow Map (numbered boxes, EN/UR, button destinations) for Muhammad's box-by-box review — no bot code before his approval.
Status of each step will be recorded below as it completes.

**Build steps 1-5 COMPLETED (2026-07-20, verified):**
1. ✅ Branding fix committed (89684fe) on integration branch.
2. ✅ Discovered origin/main already contained all integration work (PRs #2-#12 merged by
   cloud sessions) + status.html + edge-function restore. Local main reset to origin/main,
   branding merged cleanly (zero file overlap), pushed.
3. ✅ Repo pushed: main + integration branch both on GitHub (claritydigital786/badar-trader-crm).
   Memory note "branch not pushed" was STALE — cloud sessions had resolved the divergence.
4. ✅ Deploy verified live on crm.badartrader.com: bull.svg serves new viewBox, favicon.svg
   200, status.html shows 20 July + "V2 BUILD STARTED". Vercel auto-deploys on push to main.
5. ✅ Bot Flow Map v1.0 drafted from live webhook code: docs/BOT_FLOW_MAP.md (source of
   truth) + docs/Badar_Bot_Flow_Map.docx, live at crm.badartrader.com/docs/Badar_Bot_Flow_Map.docx.
   Contains 12 boxes, 7 rules, 4 design questions (Q1 missing Urdu in boxes 3-6, Q2
   free-signals marked "declined", Q3 after-hours "hold on a moment" promise, Q4 IB-change
   walkthrough only exists in old simulator). AWAITING Muhammad's box-by-box review —
   no bot code changes until approved.

**nudge-agents spam ROOT CAUSE FOUND + FIXED IN CODE (2026-07-20) — NOT YET DEPLOYED.**
Root cause of the 07-14 "duplicate reminders" (Hanzala's screenshots): the reminder text
was identical for every lead ("a lead is still waiting on you") and the loop sent one
message PER unacknowledged lead — 4 waiting leads = 4 word-identical messages in one run.
Not a double-send; a per-lead loop with indistinguishable text. (History also had an older
'nudge-agents-every-5-min' cron name that could overlap if never unscheduled — schema.sql
already guards against it.)
Fix (committed): batch to ONE message per agent per run listing the waiting leads by name,
single ack button acks the oldest; escalation broadcast also batched + targets deduped;
NULL agent_last_pinged_at leads (never stamped because the assignment notify failed) are
now included via .or() instead of being silently skipped forever. esbuild syntax-clean.
UNVERIFIED live: not deployable from this machine yet.
**To go live (needs Muhammad once):** `supabase login` → `supabase functions deploy
nudge-agents --no-verify-jwt` → re-schedule the two cron jobs from schema.sql §23
(unscheduled 07-14, STILL OFF).

**WhatsApp channel health: client's business stopped — their new numbers get flagged.
The official Cloud API number +92 371 5773903 already exists and is the answer.** Reading
its status/quality/messaging-tier needs WhatsApp Manager (business.facebook.com) in a
logged-in Chrome; then plan migrating client traffic onto the API number + Meta template
submissions for re-opening 24h-stale conversations.

**WhatsApp channel health CHECKED LIVE in WhatsApp Manager (2026-07-20, evening).**
Login sees 4 WABAs under the "Badar Trader" business (business_id 3193435450841397):
- WABA 1697502401503391: **+92 371 5773903 (PK), display name "Trade Campus" — Connected,
  quality HIGH, messaging limit 250 business-initiated conversations/24h (tier 1).**
  This is the CRM's number. Inbound/service conversations are NOT capped by the 250 —
  replying to customers who message first is fine; the cap only limits outreach we start.
- Path to 2,000/day shown in Messaging limits: EITHER business verification (documents
  NOT yet submitted — "Get started" link live) OR 1,000 unique high-quality
  business-initiated conversations in 7 days (currently 53/1,000). Upgrades ≤24h.
- WABA 1488807239234168: +971 54 531 7493 (UAE) — **Unverified**, no quality rating, unusable.
- WABA 2044162043127569 + "Trade Campus" WABA 789627347510140: zero phone numbers.
- "Add phone number" button DISABLED in every WABA — consistent with the client's "Meta
  restricts our new numbers" complaint; likely business-verification-gated or a
  restriction on the business account. Exact cause not yet confirmed.
**Client guidance derived:** their flagged personal numbers are the wrong channel; the
API number is healthy and should carry the traffic. #1 unlock = submit business
verification documents (client action, legal docs — cannot be done by Claude).

**2026-07-20 late: Muhammad ordered +92 371 5773903 DISCONNECTED from the API/CRM.**
Client (Badar) wants his agents using the number directly in the WhatsApp app NOW; CRM
reconnect planned later. Executing: deregister the number from Cloud API via WhatsApp
Manager so the agents can register it in the WhatsApp Business app with the SIM + OTP.
Consequences (known, accepted): bot goes silent, no auto-replies to new leads, no CRM
logging of new messages, CRM sends will fail. Reconnect path: re-register on Cloud API
(two-step PIN if set), webhook infra left intact on purpose.

**Disconnect findings (2026-07-20 late).** Two-step verification on 3903 is OFF (no PIN
will block app takeover). Meta's UI has no deregister button; deregistration happens
automatically when the number is registered in the WhatsApp Business app with SIM OTP.
Phone number ID: 1150847781454379. Handover steps given to Muhammad for the client's
team. The moment they register: bot silent, CRM sends fail (logged), inbound stops
logging. Webhook + all infra left intact for later reconnect (remove from app,
re-register on Cloud API, resume). CRM status: DISCONNECT PENDING on client's action.

---

## 2026-07-21 session — Phase A deploys, RLS drift caught, mobile/UI fixes, process change

**Process change, per Muhammad tonight: this file gets updated as work happens, not just at session end or before risky work.** Keep doing that going forward, across accounts.

**Phase A deployed live:** `send-wa-message`, the `nudge-agents` batching fix, and the `whatsapp-webhook` restart-on-return fix are all deployed to the live Supabase project. The two `nudge-agents` cron jobs were re-scheduled, then explicitly unscheduled again same day at Muhammad's direct request — reminders are OFF on purpose right now, not by accident. Don't re-enable without asking him first (see open items below, he wants to discuss timing for this last).

**RLS drift discovered and fixed.** Auditing KYC/Comms admin-gating (using the committed `schema.sql` as reference) concluded everything was still agent-scoped — wrong. A previous, undocumented session had already broadened `leads` and `communications` to "any active staff member sees everything" via an `is_active_staff()` function and policies named `staff select all` / `staff update all`, live in the actual database, but never written back into `schema.sql`. The file and the live database had quietly diverged. Extended the same pattern to `kyc_documents`, `transactions`, and `lead_activity` (which had been missed, an agent could see a lead but not its KYC/ledger/activity unless it was their own), and documented all of it as Phase 15 in `schema.sql`. Lesson: check live `pg_policies`, not just the committed file, before concluding something is or isn't enforced.

**index.html fixes shipped locally (not yet committed):**
- Deleted the duplicate `saveLeadNotes` (was defined twice, byte-identical)
- Wide tables (All Leads, Reports, any `.card`-wrapped table) now scroll horizontally on narrow screens instead of clipping columns off-screen with no way to reach them
- Conversations two-panel view now auto-collapses to a full-screen single panel on mobile when a chat is opened, with a back button — was previously squeezing both panels side by side into an unusable sliver
- All Leads search box was being silently dropped every time a filter dropdown changed (search text stayed visible, results didn't reflect it) — fixed
- Added conversation short links: a 🔗 Copy Link button generates a `?conv=<leadId>` URL; opening it after login jumps straight to that thread
- Header buttons (Export CSV / Add Lead / Logout) were shrink-wrapping to their own text length, creating an unintentional-looking size staircase — now equal-width at every screen size (first fix only covered mobile, had to redo it for the base/desktop rule too)
- Conversation filter chips (All/New/Unread/Warm/Hot/Closed) were wrapping onto an uneven second row — now scroll in one row instead
- Confirmed WhatsApp-shared screenshots already save into the CRM correctly (`handleImageMessage` in the webhook, built in an earlier session) — no new code needed, just closed out the backlog item

**Nothing above is deployed to crm.badartrader.com yet.** All frontend changes exist only in the local working tree and the local test server (`localhost:8744` via `.claude/launch.json`). Waiting on Muhammad to say go before committing/pushing.

**Roadmap/status tracking moved to a Claude Artifact**, not just this file: [Badar Trader CRM — V2 Build Roadmap](https://claude.ai/code/artifact/cfab81b9-d8bd-47d1-8ecc-425853a000b3). Muhammad tried to hand-check items on it and got confused when it didn't visually update — clarified checkboxes are per-viewer localStorage, not shared. Rebuilt it as a plain status board with no interactive checkboxes at all; Claude marks items done after verifying them, nobody clicks anything. Keep both this file and that artifact in sync going forward.

**Open decisions, in the order Muhammad wants to take them (signal delivery + AI Signals now, bot flow map + nudge-agents timing last):**
1. **Signal delivery mechanism** — clarified tonight: there are 3 WhatsApp Communities, the same message gets posted into each one 4-5 times a day. This is community-level broadcast, NOT individual 1:1 sends to each member — an earlier exchange suggesting per-subscriber Cloud API sends was a miscommunication (Muhammad said he was tired when that was discussed). Cloud API cannot post to Communities at all regardless, so this channel is inherently app-only, whatever gets decided. Still open: whether to keep pure community posting (accept the risk, apply pacing/wording mitigations already discussed) vs. some hybrid with individual Cloud API sends for anything subscriber-specific. Also still unknown: whether individual member phone numbers are captured anywhere outside the communities themselves.
2. **AI Signals approach** — the pattern name and confidence % shown to clients are `Math.random()`, dressed up with a real live price. Three real options on the table: (a) genuine chart-pattern detection off real historical data, a real project, (b) real calculable technical indicators (moving averages, RSI, MACD, support/resistance) — honest, buildable, meaningfully less effort than (a), (c) human-picked signals, no automation claim at all. Awaiting Muhammad's lean.
3. **Bot Flow Map review** (deferred to last, deliberately) — Muhammad found the bot behaving inconsistently when testing from different phone numbers (e.g., his younger brother's number showed different behavior than expected). Wants to investigate that properly before signing off on the Flow Map as the source of truth for the v2 rebuild. This is the reason Phase B stays blocked, not just "hasn't gotten to it yet."
4. **When to re-enable `nudge-agents` reminders** (deferred to last, alongside the Flow Map discussion).

**New requirement logged (2026-07-21, 2am): automated database backups.** Muhammad has access to the client's web hosting/domain and wants a script placed there that backs up the CRM's Supabase data automatically, 4 times a day (every 6 hours), so new leads/data are continuously captured for the client's own copy. Full design deferred to later ("we'll talk about it later on"), just recording the requirement now per his new process rule. Needs to know the hosting type (cPanel/shared with cron+SSH vs something else) before writing the actual script.

**Ordering update:** the automated backup / web hosting item above is also deferred to the end, grouped with the Bot Flow Map review and the nudge-agents re-enable timing. Nothing on that trio gets worked on until Muhammad says so.

**Bot fixes shipped and deployed live (2026-07-21, ~2:30am):**
1. **Mid-flow abandonment restart (real bug, found from your own testing).** Any lead stuck at the main menu, broker choice, experience, traded-before, or deposit-confirm stage for 24+ hours with no restart rule, only "declined" leads ever restarted. A lead returning to any of those stages just had their new message misread as an answer to a days/weeks-old question. Now they get a full restart at the greeting, same 24h threshold as the existing declined-restart rule. This is almost certainly what caused "different behavior" testing from different phone numbers, fresh numbers hit the greeting correctly, numbers with old leftover test state didn't restart.
2. **Broker swap: Do Prime dropped, XM added.** Exness unchanged. Every bot message, button, and matcher updated (English + Roman Urdu). XM referral link/code supplied by Ehsan 20 July afternoon: `https://affs.click/a3Vrw`, code `YR4PD`. Historical leads with `broker_choice = 'doprime'` are left alone (DB constraint still permits the old value for existing rows; the bot itself no longer offers it as a choice going forward).
3. **Qualified-lead wording changed.** Was "deposit $500, then send a screenshot" as one sequential requirement. Now covers leads who may already be trading and have an existing $500+ balance, same screenshot requirement either way — the screenshot itself is the real signal a lead has closed, not the verbal "yes" to depositing (Badar's framing, 21 July).

All three deployed to the live Supabase project already. `docs/BOT_FLOW_MAP.md` updated to match (new Rule R6 for the restart, Box 3/6/8/10 broker text, Box 10 wording). Committing the source now so the repo matches what's live.

**Known follow-up, not done yet:** `simulator.html` still says "Do Prime" in 2 places, it's already a separately drifted artifact (Phase B territory) and wasn't touched tonight since the priority was the real, live bot.

**Still open from this same conversation, unresolved:**
- Whether the qualified message should show both Exness and XM links regardless of which broker a lead picked, or just the one they chose (current behavior: just the one chosen, unchanged tonight)
- The actual names for the new Conversations filter categories (Muhammad referenced wanting new ones but never sent the list)
- Whether lead status should only flip to "closed/converted" once a screenshot actually arrives, rather than the moment they say "yes" to depositing
- Whether there's a brand style guide (fonts/colors) to standardize across CRM/agent/client-facing surfaces, or match what's already in the CRM
- The Lovable landing page (VSL video, XM branding) — blocked, Claude has no access to the private project
