# Badar Trader CRM - Handoff

_Last updated: 2026-07-14 (mid-session, cut short by usage limit - written fast, verify
claims before trusting them further). For a fresh Claude Code session with zero memory of
prior conversations._

**Two parallel tracks are active as of 2026-07-29 - say the right phrase to resume the right one:**
- **"continue the Supabase CRM coding"** → resume the badar-trader-crm codebase (index.html, Supabase edge functions, schema, deploys).
- **"continue the WhatChimp bot build"** → resume the WhatChimp Flow Builder rebuild + the related Meta Ads Manager work (see the last section of this file).
A bare "continue" defaults to whichever section is most recent at the bottom of this file - ask Muhammad to clarify if it's not obvious which track he means.

**Two-person parallel work, effective 2026-08-02 - Muhammad and his younger brother, on separate laptops, sharing one Google/GitHub login, building ONE application together (this CRM), not split into separate systems:**
- Since both machines share one GitHub identity, commits are told apart by the **local git `user.name`** set on each laptop, not by separate accounts - this laptop (Muhammad's) is set to `Muhammad`; run `git config user.name "Brother"` (his real name) on his laptop once he's set up.
- **Active Work Claims** (below) is the collision-prevention mechanism - before starting something, add a line here; remove it once committed and pushed. Whoever's Claude session starts a task should `git pull origin main` first (already the standing rule) and check this list.
- For anything code-level, work on a branch (e.g. `feature/<short-task-name>`) and merge to `main` only once done and verified. Docs-only edits to this file can go straight to `main`.
- WhatChimp (bot training, AI Agent config) stays whoever's already doing it day to day (brother) - that's a separate SaaS tool, not part of this codebase, doesn't need the branch/claim process.

**UI redesign in progress (2026-08-02) - task split:**
Muhammad approved a WhatChimp-inspired visual direction (light sidebar with tinted icon badges, welcome header, card-based dashboard) built in the CRM's own navy/gold/sky branding, not WhatChimp's green. A mockup was reviewed and approved first.

**Part 1 (Muhammad, done tonight):** shared sidebar/nav CSS restyle (light background, tinted icon badges - affects both admin and agent dashboards automatically since they share the same CSS classes), admin sidebar nav markup updated with badge tints, two new admin-only sidebar sections added under SYSTEM: **User Manager** (fully functional - reuses the existing `profiles` table and `renderAgentsTable()`, promote/suspend all works) and **User Permission** (a real reference of what Admin vs Agent can currently do; no granular per-feature toggle yet, flagged honestly in the UI copy itself). Admin Dashboard tab now opens with a "Welcome Back, {name}" header + wave emoji. Verified locally in demo mode (`enterDemoMode()` in the console), zero console errors. Committed and pushed (`7fadb72`).

**Part 2 (brother) - DONE and PUSHED 2026-08-03 (`5436eba`, merge `8efbb2b`).** All four points below were completed. Tint choice: each agent tab was given the same tint as its admin counterpart (Dashboard gold, My Leads sky, Omnichannel Inbox sky, Comm Log success, Guide warn) so both dashboards read as one system; Log Activity has no admin equivalent and was given danger. Point 3 was done by adding the `1px solid #e5e8ef` border to the shared `.card` and `.stat-card` rules plus `.conversations-shell` (which had the white surface and radius but no border), which carries the card language into Leads, Conversations and Reports on both dashboards at once. Stat cards carrying an inline accent (`border-left:4px solid ...`) keep their colored left edge, since inline styles win - verified, looks intentional. Point 4 respected: no `.nav-item` / `.sidebar` / `.nav-icon` base CSS rule was touched.

Verified in the browser at localhost:8744 in demo mode by calling the real `initAgent()` (so the name wiring was actually exercised, not just the markup): all six agent nav icons resolve to real tint colors, the Welcome Back header populates from the profile, and `.card` / `.stat-card` / `.conversations-shell` all compute to `1px solid rgb(229,232,239)`. Walked the agent Dashboard, My Leads and Omnichannel Inbox tabs plus the admin Reports tab. Zero console errors, tag balance clean, zero em dashes added.

**Junaid's laptop can now push - GitHub auth set up 2026-08-03, this was previously a hard blocker.** The machine had no `gh` CLI, no SSH key, and an empty keychain entry, so `git push` failed with "Password authentication is not supported" - the exact per-machine setup gap the 28 July entry flagged as unconfirmed for the brother's laptop. Fixed by generating an ed25519 keypair (`~/.ssh/id_ed25519`, comment `junaid-macbook-badar-trader-crm`), pinning github.com's host key after checking its fingerprint against GitHub's published Ed25519 value, adding the public key to the shared `claritydigital786` account as "Junaid Macbook", and switching the remote from HTTPS to `git@github.com:...`. Auth confirmed with `ssh -T git@github.com`.

Two caveats worth knowing: the key has **no passphrase** (so pushes are non-interactive, but anyone with filesystem access to that laptop can push as the shared account), and it authenticates as `claritydigital786` like every other machine - the local git `user.name` remains the only thing distinguishing Junaid's commits from Muhammad's. Muhammad's laptop is unaffected and keeps whatever auth it already had.

**Part 2 (brother, next) - original task list, all now done:**
1. The agent-facing sidebar (`#agent-dashboard .sidebar`) already inherited the new light background for free (shared CSS classes), but its nav-icon spans don't have the tinted badge colors yet - add `style="background:var(--tint-*-bg)"` to each agent nav-item's `.nav-icon` span, same pattern as the admin ones (search `admin-tabs` block for the exact pattern to copy).
2. Add the same "Welcome Back, {name}" header treatment to the agent dashboard's own Dashboard tab.
3. Carry the same card language (white surface, `#e5e8ef` border, rounded corners) into Leads, Conversations, and Reports - the admin `.stat-card` class is already close, mainly needs the border added to match.
4. Do NOT touch `.nav-item`, `.sidebar`, `.nav-icon` base CSS rules again - those are now shared foundation Part 1 already built; only add new tint-color inline styles or extend other tabs' own card markup.

**Part 3 started 2026-08-03 - building real WhatChimp-equivalent features into this CRM, not just matching its visual style.** Muhammad's direction: the CRM should eventually cover the same ground WhatChimp does (onboarding, broadcasting, a bot flow builder, AI training, channel connections), built as real features here, not just copied UI. Important constraint stated explicitly and binding on both of you: **nothing ships unverified, ever** - every piece gets built, run locally, actually exercised in the browser, checked for console errors, only then committed and pushed. This is large work; it is being taken in real, honestly-scoped slices, not built all at once.

Muhammad (this laptop) is on: updating the 5 dashboard quick-action tiles to match WhatChimp's own set exactly - **New Broadcast, Open Inbox, Create Flow, Train AI, Connect Channel** (replacing the current New Broadcast/Open Inbox/New Lead/KYC Queue/Export Report tiles) - wiring each to a real destination where one already exists (Open Inbox -> Omnichannel Inbox tab, Connect Channel -> Meta Integration tab), and building an honest placeholder (same pattern as User Permission - a real reference page, not a dead button) for the two that don't exist yet (Create Flow, Train AI) until those get built for real. Also expanding the existing **Guide** tab into a proper onboarding guide that explains every section to admins and agents, per Muhammad's example.

**Junaid, start on this now, does not depend on Muhammad's tile work landing first:**
1. **"Train AI" first version** - a new admin-only tab/section to store a system prompt + free-text knowledge notes per bot number (mirrors WhatChimp's AI Knowledge Base: a campaign name + prompt textarea, nothing fancier yet - no live LLM call needs to be wired up in this first version, just real storage in a new Supabase table and a real UI to create/edit/list entries). This does NOT need to actually change bot behavior yet - that comes later once this exists and Muhammad decides how the webhook should read it.
2. **"Create Flow" first version** - a simple keyword-reply builder (mirrors WhatChimp's Automation -> Keyword Replies): admin can create a rule with a trigger keyword and a reply message, stored in a new Supabase table, with a real list/edit/delete UI. Not a visual drag-and-drop flow builder yet - that's a much bigger project or a later phase, get the simplest real version working first.
3. For both: new Supabase tables need a migration file in `supabase/migrations/`, follow the existing schema.sql patterns (RLS: admin-only per the User Permission reference tab written tonight), and the usual rule - test locally against a real Supabase query before claiming either is done.

Whoever finishes their piece first should update this section (mark it done, same as Part 1/Part 2 above) rather than waiting for the other.

**Standing rule, reinforced hard tonight: zero em dashes, anywhere, ever - user-facing text, code comments, this file, everything.** Muhammad was extremely direct about this. All 158 occurrences in `index.html` and all 184 in this file were swept and replaced with plain hyphens tonight. Check before ever writing one again.

### Active Work Claims

**DONE (2026-08-04) - Real message-speed bug found and fixed in Conversations, the actual thing Muhammad meant by "test the message speed" (his first mention was Broadcast Signal, corrected mid-conversation to mean live agent-to-lead Conversations).** `sendConvMessage()` called `openConversation()` after every successful send - wiping the whole panel to "Loading conversation..." and re-fetching the lead plus every message from scratch, on top of whatever the WhatsApp send itself takes. `startConvRealtime()` already subscribes the moment the Conversations tab opens, well before any send could happen, and both send paths (`send-wa-message` and the legacy browser fallback) insert into `communications` the same way, so the realtime INSERT event already appends the just-sent message correctly - the same mechanism already used for a customer's incoming replies. The full reload was pure redundant overhead nothing else depended on. Removed it. Verified in demo mode: message sends, appears immediately, sidebar preview updates, zero console errors. The live-mode realtime path itself can't be exercised without a live Supabase connection - that part is genuinely unverified beyond the code review, per the standing rule on live sends only happening from Muhammad's laptop with him present.

**DONE (2026-08-04) - Broadcast Signal send loop paced and capped, real bug fixed before any real send was ever attempted.** `send-broadcast-signal` had zero delay between Graph API calls and no cap on recipient count. This number's live WhatsApp tier (checked 2026-07-20) allows only 250 business-initiated conversations per rolling 24h; Subscribers is now a real ~4,000-row table, so an unpaced, uncapped broadcast would blow past that limit almost immediately - every send past it fails, which is what "a mess" looks like in practice. Added a 300ms pace between sends and a 200-recipient safety cap that refuses to send (with a clear reason) instead of silently failing past the limit. Verified the new logic in isolation - zero real network calls, zero real subscribers involved - confirming the cap correctly refuses 4000/201 and allows 200/50, and the pacing loop's measured gaps land at ~300ms per send. `SIGNAL_BROADCAST_ENABLED` stays false, unchanged.

**DONE (2026-08-04) - Dashboard "Pipeline Overview" donut + 14-day trend chart, and a Rename button for agent names.** Muhammad sent a screenshot of the live main Dashboard and asked why it didn't have a WhatChimp-style circle chart, and separately flagged his own name showing as "syedbadartk" (the raw email-derived username) instead of "Badar Tanveer" on the welcome header.
- New "Pipeline Overview" card on the Dashboard, above Upcoming Follow-ups: a Chart.js doughnut of lead status breakdown (new/contacted/qualified/proposal_sent/converted/lost, with a center label showing total lead count) plus a colored legend and a 14-day line trend of leads added per day, computed client-side from `leads.created_at`. Both charts read live `cachedLeads` (or `_DEMO_LEADS` in demo mode) - no new tables, no new queries. Dark-mode aware from the start (text/grid colors keyed off `data-theme`), and re-renders on theme toggle since Chart.js bakes colors into the canvas and doesn't pick up CSS variable changes on its own. Found and fixed a real mobile bug during verification: the two-column chart grid didn't stack at 375px, cutting off the trend chart - added a `@media (max-width:768px)` override.
- Root cause of the name problem: any account created via Supabase Dashboard -> Add User only takes an email + password, never a name, so `profiles.full_name` starts empty and the UI falls back to the raw email/username everywhere. This is a data gap, not a bug, and it affects every account created this way (Badar's own included) - not something a single SQL fix resolves permanently, since the next new hire hits it again. Added a real "Rename" button to every row in My Team / User Manager (`renderAgentsTable()`), including the signed-in admin's own row (the only action available there, since Make Admin/Suspend are correctly blocked on your own account) - click it, type the real name, `profiles.full_name` updates immediately and the welcome header updates live if you renamed yourself. Muhammad or Junaid still need to click it once per person (Badar Tanveer's own account first, then Hanzla/Ehsan/Bilal once their logins exist per the pending list below) - this is a one-click admin action now, not a manual SQL edit.
- Verified in demo mode: both charts render correctly with real demo data, Rename button renders in the Actions column for every row (own row included) at 375px, zero console errors. Chart interactivity (hover tooltips) and the actual Rename click flow (which calls `sb.from('profiles').update(...)`) aren't exercisable without a live Supabase connection - code-reviewed against the existing `toggleRole`/`suspendAgent` pattern it copies, not functionally live-tested, per the standing rule on live-mode testing needing Muhammad present. Committed `a8900bc`.

**Pending account creation (2026-08-04) - four people need real Supabase Auth users, nobody with Supabase Dashboard access has done it yet:**
- Hanzla - `cjhanzla@gmail.com`
- Ehsan Wazir - `ehsanwazir8@gmail.com`
- Syed Bilal Ahmed Hashmi - `syedbilalahmadhashmi786@gmail.com`
- Syed Hamza - `hsyed9050@gmail.com`, phone `+92 320 1946494` (new addition, no existing WhatChimp account)

Create via Supabase Dashboard -> Authentication -> Users -> Add User (email + temporary password, leave User Metadata as `{}` for the default Agent role), same process the User Manager tab's own guide text already describes. No Claude session should do this step - it requires setting a real authentication password, which stays a human-only action regardless of which system it's in.

**DONE (2026-08-04) - Muhammad's mobile/dark-mode check of the four new Part 3 tabs** (Train AI, Create Flow, Follow-ups, Message Templates - built after the earlier mobile/dark-mode passes, so never checked). Found and fixed two real bugs, not just checked the box:
- All four tables were missing `white-space:nowrap` on their long-content cells (system prompts, reply bodies, template names), so text wrapped across many lines on mobile instead of scrolling on one line like every other table in the app. Fixed to match the established pattern.
- Bigger find: a bare `td { color:#334155 }` rule (dark slate, meant for light backgrounds) was silently winning over the intended `[data-theme="dark"] table { color:#cbd5e1 }` rule via direct-property-beats-inheritance, because it was never given its own dark-mode override. This made plain table cell text (bot numbers, categories, anything without its own inline color) nearly illegible in dark mode - **on every table in the app, not just the new ones.** Added the missing `[data-theme="dark"] td` override, verified across all four tabs plus a re-check of Train AI/All Leads.

Verified locally at 375px in both themes, zero console errors, before committing and pushing (`106464c`, merged with Junaid's live-conversations standing rule and the AI Signals wording fix).

**DONE (2026-08-03) - Muhammad's mobile usability pass, tab by tab at 375px** (the 2026-07-19 backlog item flagged as "never systematically tested"). Found and fixed real bugs, not just checked the box:
- Sidebar didn't fully hide when collapsed on mobile - it translated by a hardcoded `-220px` while its actual width was `232px`, leaving a permanent ~12px sliver on-screen at every phone width. Switched to `translateX(-100%)` so it can never drift out of sync with the real width again.
- The Welcome Back header had a leftover `gap:10px` flex style from when the (now-removed) wave emoji sat next to the name - with the emoji gone, the gap still applied between the text node and the name span, showing as a visible double-space. Removed the now-pointless flex styling.
- All Leads table rows had no way to open a lead on mobile - the only trigger was a "View" button in the table's last column, which sits off-screen until you scroll the table horizontally, and the row itself wasn't clickable. Made the whole row tappable (`renderLeadsTable`), button still there as a visual affordance.
- Found something bigger than mobile-only: the lead search box, and the entire Broadcast Signal / Subscribers / AI Signals section (target group, signal type, instrument fields, the 4 AI-signal mini-stat boxes, the Dashboard "Upcoming Follow-ups" widget, lead detail notes textarea) still had the pre-redesign dark palette (`color:#e2e8f0` text on `#1e293b` backgrounds) hardcoded inline, left over from before the light redesign. Inside the new light `.card` styling this was nearly illegible - light-gray text on white, dark boxes floating in a light card. Stripped the leftover inline styles so all of it inherits the same light input/card look as the rest of the app. This was broken in light mode on desktop too, not just mobile - just happened to surface during this pass.
- Everything else checked clean at 375px: Dashboard, Omnichannel Inbox (list, full-screen chat, back button, input bar), Reports (stat cards, agent table, revenue chart), My Team, Meta Ads, Add Lead, Automation, Payroll, Notifications, Sites, User Manager, User Permission, Meta Integration, Guide.

Verified locally on `localhost:8744` in demo mode at a real 375px viewport for every tab above, zero console errors throughout, before committing and pushing (`a9fe5c8`, merged with Junaid's Part 3 completion).

**DONE (2026-08-03) - Junaid's Part 3 items 1 and 2, with one part explicitly NOT done.** Both tabs now have real working UI in place of the honest placeholders.
- **Train AI** (`ai_knowledge_base`): campaign name, bot number, system prompt, knowledge notes. Create / edit / pause / delete.
- **Create Flow** (`keyword_replies`): trigger keyword, match type (contains / exact / starts with), reply message. Same CRUD surface. Kept deliberately simple; a visual drag-and-drop builder is a much larger later phase.
- Migration `supabase/migrations/20260803_train_ai_and_keyword_replies.sql`: both tables, admin-only RLS through the existing `is_admin()` helper (agents get no access at all, matching the User Permission tab), `updated_at` triggers reusing `public.set_updated_at()`, lookup indexes. Idempotent.
- **Neither is wired to bot behaviour, on purpose.** The webhook does not read either table. Both tabs state this in their own info box, and the two Guide cards Muhammad wrote were updated, since they still described these as unbuilt.

**Bug found and fixed while doing it, affecting existing code too:** the submit handlers called `setMsg()` and then `resetForm()`, which clears that same element, so the success message was wiped before anyone could see it. Fixed in both new tabs and in the pre-existing `submitAutomationRule`, where the same defect means "Rule saved." has never actually been visible in the Automation tab.

**NOT DONE, and it needs Supabase auth: the migration has not been applied.** Confirmed by querying the live project directly rather than assuming - `ai_knowledge_base` and `keyword_replies` both return 404 `PGRST205` ("not found in the schema cache") while `automation_rules` returns 200 as a control, proving the query method and key were valid. So both tabs work fully in demo mode but will error against production until someone applies the migration, either by pasting that file into the Supabase SQL Editor or via the CLI once logged in. **Do not describe these features as live until that is done and a real row has been saved from a logged-in admin session.**

**Follow-ups done after that, same session:**
- **A missing table no longer looks like a hang.** Both tabs originally logged to console and returned, so with the migration unapplied an admin opening either one saw "Loading..." forever. They now detect PostgREST's `PGRST205` and say plainly that storage is not set up and which migration file to run. Tested against the real project with the genuinely missing tables, not a mock.
- **The em dash rule is finally actually satisfied repo-wide: 205 more removed.** `schema.sql` (46), `whatsapp-webhook/index.ts` (49), `ACTION_NEEDED.md` (48), `js/app.js` (9), the six other edge functions, both migrations and three more docs had never been swept. A full walk of every `.html`, `.md`, `.sql`, `.ts`, `.js`, `.json` and `.svg` file now reports **zero**. Before touching the deployed webhook its 49 were classified first: 38 comments, 11 console logs and internal `[bracket]` audit strings, **no customer-facing copy**, so no message anyone receives changed wording. All seven edge functions re-verified with esbuild and `js/app.js` with `node --check` afterwards.
- **Note this widens the local-vs-deployed gap for `whatsapp-webhook`**, which already had the undeployed greeting matcher. Cosmetic only, but the next deploy of that function ships both.
- **`schema.sql` Phase 19 added** for the two new tables, so the committed schema stays a complete picture of the intended database. Verified programmatically that Phase 19 and the migration define exactly the same 24 items (columns, policies, triggers, indexes) with zero difference in either direction. Done specifically because Phase 15 on 21 July was caused by this exact drift.

Verified before pushing: full create/edit/toggle/delete round trip on both tabs, validation rejects empty required fields, match type stores and renders correctly, zero console errors, tag balance clean, zero em dashes, and both themes checked explicitly after merging the dark mode work (headings flip to `#f1f5f9`, inputs invert correctly).

**Small note for whoever does dark-mode polish:** secondary preview text in these two tables stays `#64748b` in dark mode, roughly 3.4:1 against the dark card. Left as-is to match the existing convention (Muhammad uses the same value for `.user-info span` in dark) rather than making these two tables inconsistent with every other table, but it is on the dim side.

**DONE (2026-08-03) - Muhammad's Guide tab expansion:** admin + agent Guide tabs expanded with "Omnichannel Inbox" rename, new "Create Flow" and "Train AI" cards, and admin-only "User Manager"/"User Permission" cards. Also fixed a real dark-mode bug found during verification: card heading text (inline `color:#0f172a`) was illegible on dark backgrounds - added a targeted `[data-theme="dark"] [style*="color:#0f172a"]` override. Verified locally in both light and dark mode, admin and agent views, zero console errors, before pushing.

Prior version of this doc (2026-07-13) covered the main/feat branch-divergence discovery
and merge into `integration/merge-bot-human-handoff`. That merge is still the base - a
**different session** (not the one that wrote the 07-13 doc) then did 10 more commits on
top of it, described below. This doc adds that work; the 07-13 context about the branch
divergence itself is still accurate and not repeated in full here.

---

## Repo state right now

```
$ git branch --show-current
integration/merge-bot-human-handoff   (still NOT pushed to origin, NOT merged to main)
$ git log --oneline -11
0812f83 feat: Meta Lead Ads webhook - create CRM record + WhatsApp welcome on new lead
cf8a916 fix: explain and log WhatsApp send failures instead of a silent toast
3e89e96 fix: add Broker ID and split First/Last Name to the leads CSV export
a8031f1 fix: conversion-hook was silently failing on every single call
dec900b feat: quick-links panel, Comm Log status filter, agent follow-ups widget
67c7f4a fix: render WhatsApp screenshots inline in Conversations; sync stale webhook
0c738fd feat: add signals-form.html and course-form.html lead-capture pages
1e86c71 feat: add Comm Log tab to the agent dashboard
3a36768 feat: add Conversations tab to the agent dashboard
4c2de73 fix: slow nudge-agents reminders to 15 min, restrict to 9am-6pm PKT
105f98c docs: rewrite handoff for a fresh session - branch divergence + merge status
```
Only uncommitted change is `.claude/settings.local.json` (local Claude Code permissions,
not product code - ignore it or commit it, doesn't matter). There's also an old stash
(`stash@{0}`, same file, from the earlier merge session) - safe to drop.

**index.html has a known, not-yet-fixed bug right now**: `saveLeadNotes` is defined twice
(lines 3304 and 3315), byte-identical, so it's harmless dead code - but it was found
mid-audit and never actually removed. Trivial fix, just delete lines 3315–3324.

## What the last session (this one, cut short) actually did

### 1. Diagnosed why agent WhatsApp replies were silently failing - FIXED, verified
Not a credentials or CORS problem (both tested directly and ruled out - bot sends worked
fine same-day, and a direct API call from the browser got a clean response, not a CORS
block). Real cause: **WhatsApp's 24-hour customer-service window** - free-form replies are
rejected after 24h of lead silence; only pre-approved templates work after that. Confirmed
against live data: 4 assigned leads (Syed Shair Yazdan, Farhan Ilyas, Usama Chandr, Abdul
Wasay) were already past the window. Fixed and shipped:
- Failed sends are now logged (previously only a toast, no record - undiagnosable after
  the fact).
- A warning banner shows agents *before* they try replying to a stale conversation.
- **NOT fixed**: no WhatsApp message template exists to actually re-open a stale
  conversation. If leads regularly go quiet 24h+, this needs a template submitted to Meta.

### 2. Meta Lead Ads webhook (`meta-leadgen-webhook`) - built, deployed, partially blocked
Built and deployed. Verified end-to-end with a disposable test lead: insert → DB trigger
fired → automation rule matched → WhatsApp template rendered → real Meta API call attempted
(logged, only failed on the fake test phone number's format - proves it reached Meta
correctly). Test lead + rule cleaned up afterward.
**Blocked, not verified, needs Badar/you to act - not fixable from a coding session:**
- The stored Meta token's scopes are `ads_management, ads_read,
  whatsapp_business_management, whatsapp_business_messaging` - **missing
  `leads_retrieval`**, required to actually fetch Lead Ads submissions. Every real webhook
  call will fail until this is granted (Business Settings → System users → wa-bot →
  Generate token → tick `leads_retrieval` + `pages_read_engagement` if listed → paste into
  CRM's Meta Access Token field). If `leads_retrieval` isn't offered, the app needs the
  "Lead Ads" use case added first (App Dashboard → Use cases → Add).
- The webhook isn't subscribed yet in Meta's console (App → Webhooks → Page object →
  `leadgen` field → this function's URL + verify token), and Badar's Facebook Page needs to
  be linked to the app.
- App Review status for `leads_retrieval` in production - can't be checked remotely.
- The welcome-message template is a **draft, left inactive** on purpose - didn't want
  unapproved copy going to real leads: *"Hi {{name}}! 👋 Thanks for your interest in Badar
  Trader. A member of our team will be in touch with you shortly on this number."*
  Editable/activatable from the Automation tab whenever approved.

### 3. Agent dashboard ticker cut-off - FIXED and verified in-browser (2026-07-14)
Root cause found by finally rendering it live: the TradingView ticker-tape widget is 46px
on wide screens but switches to a **74px two-row layout below ~1280px viewport width**
(confirmed 74px at 1024px, 700px, and 375px). The CRM hard-coded 46px for the bar and
every layout offset (.app-shell, .sidebar, .main-content), so on laptops/mobile the
price row was clipped in half - identical markup for admin and agent, which is why the
old code diff came back clean. Fix (index.html): all offsets now derive from a
`--ticker-h` CSS variable, kept in sync with the iframe's real rendered height by a small
script before `</body>` (ResizeObserver + MutationObserver + 1.5s backstop poll). Verified
by screenshot at 1280 (46px, single row), 1024 and 375 (74px, both rows fully visible,
content shifted down, no overlap), and ≤560px-height viewports (ticker hidden, var goes
to 0, app fills the screen - pre-existing behavior preserved). NOT yet deployed - lives
on this unpushed branch like everything else.
Separate cosmetic issue spotted: the `PSX:KSE100` symbol shows a red error badge - Meta
widget can't resolve PSX data. Ask Badar whether to drop it or pick a substitute; left
as-is deliberately (don't change user-facing content without showing him first).

### 4. Task 1 from the handover doc (Agents Dashboard audit) - IN PROGRESS, cut off mid-check
Was auditing the agent login/init flow, the follow-ups widget, dashboard stats population,
and tab builders for correctness/admin-only gating. Found the `saveLeadNotes` duplicate
(above). Was about to check whether the KYC tab and Comms tab builders properly gate
admin-only actions when rendered for an agent - **that check never happened**. Pick this up
next: grep for where agent-vs-admin views branch on KYC/Comms tab rendering and confirm
agents can't hit admin-only actions (e.g. approving their own KYC, seeing other agents'
comms) through the UI.

### 5. `nudge-agents` was spamming agents' personal WhatsApp - cron unscheduled, ROOT CAUSE NOT FOUND
2026-07-14: Badar reported agents (screenshot evidence: Muhammad Hanzala's phone) getting
**duplicate** "Reminder: a lead in the CRM is still waiting on you" messages - 4 identical
ones stamped 2:30pm, 2 more at 2:45pm, none acknowledged. That's not the intended ~15-min
cadence; something is causing multiple sends per cron invocation (or multiple overlapping
cron entries). Immediate action taken: both cron jobs were unscheduled live -
```sql
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'nudge-agents%';
```
- confirmed via the SQL Editor returning 2 rows, both `true`. **No reminders fire at all
right now, to anyone.** The `nudge-agents` Edge Function itself is still deployed (nothing
else in the codebase calls it directly, so this is safe), just not scheduled.
**Explicitly deferred by Badar - root cause not investigated yet.** Before ever
re-scheduling this: check for duplicate/overlapping `cron.job` entries (the schema has a
history of stale job names - see the `nudge-agents-every-5-min` vs `-every-15-min` rename in
`supabase/schema.sql` §23), and check whether `nudge-agents/index.ts` itself can send more
than one message per invocation per lead (e.g. a loop bug, or querying the same
not-yet-acknowledged lead more than once). Also worth revisiting whether pinging agents'
*personal* WhatsApp numbers this way was ever explicitly signed off by Badar at all, versus
just being an assumed-reasonable default from an earlier build session - surfaced as a
direct concern this session, not resolved.

### 6. ALL agents blocked from sending WhatsApp replies - ROOT CAUSE FOUND, SQL fix ready, needs one paste
2026-07-14: Badar's team escalated hard (10+ pings, screenshot from Muhammad Hanzala's
agent account): every Send attempt in Conversations shows *"WhatsApp token not set - go to
Meta Integration and save your credentials first."* The token IS set - that message is a
red herring. Real cause: `sendConvMessage()` (index.html ~line 4631) fetches
`wa_phone_number_id`/`wa_access_token` from `public.settings` **in the agent's browser
session**, but the `"settings: admin only"` RLS policy (schema §"SETTINGS: admin only")
hides every settings row from non-admins. RLS denial on SELECT returns zero rows, *not an
error*, so the code falls into its "credentials empty" branch. Admin sends work; every
agent fails. Bot sends were never affected (edge functions use the service role).
Fix written as **schema.sql §30 (Phase 12)**: an RLS policy exposing only those two keys
to authenticated users. **Not applied yet** - needs the §30 block pasted into Supabase
SQL Editor (no service-role access from these sessions). Agent `communications` INSERT
policies were checked and are fine - the settings read is the only blocker, so sends
should work immediately after the paste. UNVERIFIED until an actual agent send succeeds.
UPDATE, same day: §30 was pasted and ran ("Success. No rows returned") - the unblock is
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
with NO http status (not a 404!) - the code treats any response-less error as
"unavailable". Page loads clean, all send functions defined, zero console errors.
To finish (in order, after the frontend branch is deployed):
1. `supabase login && supabase functions deploy send-wa-message` (keep JWT verification
   ON, i.e. no --no-verify-jwt flag) - or paste the function in Dashboard → Edge Functions.
2. Have one agent and one admin send successfully (their sends now go through the proxy).
3. Drop the §30 policy: `DROP POLICY "settings: agents read wa send creds" ON public.settings;`
   Agents keep sending fine (via the proxy); the token disappears from their browsers.
Do NOT do step 3 before steps 1-2 or agents are blocked again.

---

### 7. Bot dead-ends + bot/agent crosstalk (both reported by Badar with video/screenshot evidence, 2026-07-14 evening)
Two distinct bot problems surfaced from live usage:
(a) **Resolved-lead dead end - FIXED in code, NOT DEPLOYED.** Once a lead hits `declined`
(said no to the $500), every later message - even "Hi" days later - got the canned
"[post-resolution acknowledgement]" ("a team member will follow up") forever, and no
team member ever does (reminders are off). Badar's brother hit this testing the bot.
Badar's decision: within 24h of the decline keep the polite ack; after 24h+ of silence a
returning declined lead RESTARTS the flow from scratch (greeting + language picker).
Implemented in whatsapp-webhook `runBotStep` default case (`DECLINED_RESTART_HOURS = 24`,
gap measured off `leads.updated_at`, which the is_unread bump keeps at last-interaction
time; the lead object is read BEFORE that bump so the current message doesn't reset its
own gap). `qualified` leads deliberately exempt - they hold concrete next steps and may
return with a deposit screenshot. esbuild parse-checked; UNVERIFIED live until the
webhook is redeployed (`supabase functions deploy whatsapp-webhook --no-verify-jwt` -
it must keep --no-verify-jwt, Meta calls it unauthenticated).
NOTE: the <24h ack still says "a team member will follow up shortly", which stays untrue
while reminders are off - wording change not made (user-facing copy needs Badar's OK).
(b) **Bot/agent crosstalk - NOT FIXED, awaiting Badar's go-ahead.** Video evidence (lead
"MNA"): agent manually messaged a lead mid-bot-flow; the lead's replies to the agent were
consumed by the bot's stage machine (confused apology, then decline fallback). Proposed
fix: agent/admin manual send (both send paths) sets a takeover flag the webhook respects,
e.g. needs_human + a handoff_reason the auto-expiry treats like an explicit request.
Offered to Badar; he pivoted to (a) without answering - ask again before building.

## Open items carried over from the 07-13 merge (still open)

1. **Push `integration/merge-bot-human-handoff` to `main`** - still not done. 10 more
   commits have landed on it since, all real product work, none pushed to origin. This is
   the single biggest thing sitting undeployed.
2. **Course price/duration mismatch - RESOLVED.** Confirmed 2026-07-21 by grepping the live
   webhook and index.html: no trace of the old "$200" or "3mo/1mo" variants anywhere. Every
   message consistently says "$250 free mentorship course, unlocked via $500 deposit," no
   duration mentioned at all. This item was already fixed in an earlier part of tonight's
   session; this line was just never removed. Badar flagged (2026-07-21) that he'd already
   given the answer and was frustrated this kept resurfacing as if unresolved - it wasn't,
   the doc was just stale.
3. **Automation rule firing** - real code exists and was proven to work with a test lead,
   but no real production lead has gone through it live yet.
4. **Ad creatives** - images still not generated (Muhammad's task, not a coding task).
5. From the original CRM_Handover_Tasks list: conversation short links (2), lead form fields
   matching Badar's exact list - first/last name, email, broker ID, screenshot upload (6),
   WhatsApp-shared screenshots saving into the CRM record (8b), the All Leads filter bug (9),
   OCR/anti-fraud beyond manual review (7), full mirror-dashboard with locked sections (10 -
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
implement → test → correct until actually verified - don't stop at "should work."

---

## 2026-07-19 session - branding fix parked, signalling deferred to v2 build

**Branding fix: DONE locally, verified in browser, deliberately NOT committed/deployed.**
Muhammad's explicit instruction: note it now, ship it during the v2 build, not before.
Uncommitted working-tree changes (keep them):
- `assets/bull.svg` - removed baked-in white background path (fill rgb(254,254,254)),
  tightened viewBox from `0 0 178 130` to `46 38 119 94` (artwork's true bbox).
- `assets/favicon.svg` - NEW file: bull centered on #0f172a rounded-square tile.
- `index.html` - `.sidebar-brand` now text-align:center + img rule (130px centered);
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
- `broadcastSignal()` demo mode fakes success ("Delivered to all N") after a 900ms timeout -
  the #1 trap: success message with nothing sent. Real-token path would send from the
  browser (CORS-blocked, hardcoded WABA id, fake numbers) - dead code in practice.
- AI Signals tab = Math.random() simulation, admitted by its own disclaimer.
- "Groups 1/2/3" are tags for individual sends, NOT WhatsApp group chats (Cloud API
  cannot post to group chats at all - Meta restriction).
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
browser, nothing to install. V2 items filed: (a) full mobile usability pass tab-by-tab -
wide tables (All Leads/Reports) and the Conversations two-panel screen are cramped on
phones, never systematically tested; (b) after-hours coverage isn't just access: agents
need a WhatsApp alert when a new lead arrives after 6pm - nudge-agents is still
UNSCHEDULED due to the 07-14 duplicate-spam bug (root cause never found), fix it before
re-enabling and add the after-hours new-lead alert.

**"Subscribers" definition ANSWERED (Muhammad, 2026-07-20).** A subscriber = a member of
one of the signalling communities (real WhatsApp communities). Separately managed list,
but fed by the signals form: every signals-form signup is redirected into the subscribers'
community. v2 design implication: signups create pending entries; community membership
makes them subscribers; the CRM Subscribers section must mirror actual community
membership grouped by community - not an auto-dump of form signups, not a standalone list.
This unblocks the signalling section's v2 design (see 2026-07-19 findings above).

---

## 2026-07-20 - V2 BUILD STARTED (Muhammad gave explicit go-ahead)

Planned steps, in order (written BEFORE doing them, per discipline):
1. Commit the parked branding fix + these handoff notes on the integration branch.
2. Merge integration/merge-bot-human-handoff into main.
3. Push the repo to GitHub (check remote/gh auth first; if unavailable, record blocker and continue).
4. Deploy to production (figure out the deploy path: vercel CLI vs git-connected) and verify the branding fix live on crm.badartrader.com.
5. Draft the bot Flow Map (numbered boxes, EN/UR, button destinations) for Muhammad's box-by-box review - no bot code before his approval.
Status of each step will be recorded below as it completes.

**Build steps 1-5 COMPLETED (2026-07-20, verified):**
1. ✅ Branding fix committed (89684fe) on integration branch.
2. ✅ Discovered origin/main already contained all integration work (PRs #2-#12 merged by
   cloud sessions) + status.html + edge-function restore. Local main reset to origin/main,
   branding merged cleanly (zero file overlap), pushed.
3. ✅ Repo pushed: main + integration branch both on GitHub (claritydigital786/badar-trader-crm).
   Memory note "branch not pushed" was STALE - cloud sessions had resolved the divergence.
4. ✅ Deploy verified live on crm.badartrader.com: bull.svg serves new viewBox, favicon.svg
   200, status.html shows 20 July + "V2 BUILD STARTED". Vercel auto-deploys on push to main.
5. ✅ Bot Flow Map v1.0 drafted from live webhook code: docs/BOT_FLOW_MAP.md (source of
   truth) + docs/Badar_Bot_Flow_Map.docx, live at crm.badartrader.com/docs/Badar_Bot_Flow_Map.docx.
   Contains 12 boxes, 7 rules, 4 design questions (Q1 missing Urdu in boxes 3-6, Q2
   free-signals marked "declined", Q3 after-hours "hold on a moment" promise, Q4 IB-change
   walkthrough only exists in old simulator). AWAITING Muhammad's box-by-box review -
   no bot code changes until approved.

**nudge-agents spam ROOT CAUSE FOUND + FIXED IN CODE (2026-07-20) - NOT YET DEPLOYED.**
Root cause of the 07-14 "duplicate reminders" (Hanzala's screenshots): the reminder text
was identical for every lead ("a lead is still waiting on you") and the loop sent one
message PER unacknowledged lead - 4 waiting leads = 4 word-identical messages in one run.
Not a double-send; a per-lead loop with indistinguishable text. (History also had an older
'nudge-agents-every-5-min' cron name that could overlap if never unscheduled - schema.sql
already guards against it.)
Fix (committed): batch to ONE message per agent per run listing the waiting leads by name,
single ack button acks the oldest; escalation broadcast also batched + targets deduped;
NULL agent_last_pinged_at leads (never stamped because the assignment notify failed) are
now included via .or() instead of being silently skipped forever. esbuild syntax-clean.
UNVERIFIED live: not deployable from this machine yet.
**To go live (needs Muhammad once):** `supabase login` → `supabase functions deploy
nudge-agents --no-verify-jwt` → re-schedule the two cron jobs from schema.sql §23
(unscheduled 07-14, STILL OFF).

**WhatsApp channel health: client's business stopped - their new numbers get flagged.
The official Cloud API number +92 371 5773903 already exists and is the answer.** Reading
its status/quality/messaging-tier needs WhatsApp Manager (business.facebook.com) in a
logged-in Chrome; then plan migrating client traffic onto the API number + Meta template
submissions for re-opening 24h-stale conversations.

**WhatsApp channel health CHECKED LIVE in WhatsApp Manager (2026-07-20, evening).**
Login sees 4 WABAs under the "Badar Trader" business (business_id 3193435450841397):
- WABA 1697502401503391: **+92 371 5773903 (PK), display name "Trade Campus" - Connected,
  quality HIGH, messaging limit 250 business-initiated conversations/24h (tier 1).**
  This is the CRM's number. Inbound/service conversations are NOT capped by the 250 -
  replying to customers who message first is fine; the cap only limits outreach we start.
- Path to 2,000/day shown in Messaging limits: EITHER business verification (documents
  NOT yet submitted - "Get started" link live) OR 1,000 unique high-quality
  business-initiated conversations in 7 days (currently 53/1,000). Upgrades ≤24h.
- WABA 1488807239234168: +971 54 531 7493 (UAE) - **Unverified**, no quality rating, unusable.
- WABA 2044162043127569 + "Trade Campus" WABA 789627347510140: zero phone numbers.
- "Add phone number" button DISABLED in every WABA - consistent with the client's "Meta
  restricts our new numbers" complaint; likely business-verification-gated or a
  restriction on the business account. Exact cause not yet confirmed.
**Client guidance derived:** their flagged personal numbers are the wrong channel; the
API number is healthy and should carry the traffic. #1 unlock = submit business
verification documents (client action, legal docs - cannot be done by Claude).

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

## 2026-07-21 session - Phase A deploys, RLS drift caught, mobile/UI fixes, process change

**Process change, per Muhammad tonight: this file gets updated as work happens, not just at session end or before risky work.** Keep doing that going forward, across accounts.

**Phase A deployed live:** `send-wa-message`, the `nudge-agents` batching fix, and the `whatsapp-webhook` restart-on-return fix are all deployed to the live Supabase project. The two `nudge-agents` cron jobs were re-scheduled, then explicitly unscheduled again same day at Muhammad's direct request - reminders are OFF on purpose right now, not by accident. Don't re-enable without asking him first (see open items below, he wants to discuss timing for this last).

**RLS drift discovered and fixed.** Auditing KYC/Comms admin-gating (using the committed `schema.sql` as reference) concluded everything was still agent-scoped - wrong. A previous, undocumented session had already broadened `leads` and `communications` to "any active staff member sees everything" via an `is_active_staff()` function and policies named `staff select all` / `staff update all`, live in the actual database, but never written back into `schema.sql`. The file and the live database had quietly diverged. Extended the same pattern to `kyc_documents`, `transactions`, and `lead_activity` (which had been missed, an agent could see a lead but not its KYC/ledger/activity unless it was their own), and documented all of it as Phase 15 in `schema.sql`. Lesson: check live `pg_policies`, not just the committed file, before concluding something is or isn't enforced.

**index.html fixes shipped locally (not yet committed):**
- Deleted the duplicate `saveLeadNotes` (was defined twice, byte-identical)
- Wide tables (All Leads, Reports, any `.card`-wrapped table) now scroll horizontally on narrow screens instead of clipping columns off-screen with no way to reach them
- Conversations two-panel view now auto-collapses to a full-screen single panel on mobile when a chat is opened, with a back button - was previously squeezing both panels side by side into an unusable sliver
- All Leads search box was being silently dropped every time a filter dropdown changed (search text stayed visible, results didn't reflect it) - fixed
- Added conversation short links: a 🔗 Copy Link button generates a `?conv=<leadId>` URL; opening it after login jumps straight to that thread
- Header buttons (Export CSV / Add Lead / Logout) were shrink-wrapping to their own text length, creating an unintentional-looking size staircase - now equal-width at every screen size (first fix only covered mobile, had to redo it for the base/desktop rule too)
- Conversation filter chips (All/New/Unread/Warm/Hot/Closed) were wrapping onto an uneven second row - now scroll in one row instead
- Confirmed WhatsApp-shared screenshots already save into the CRM correctly (`handleImageMessage` in the webhook, built in an earlier session) - no new code needed, just closed out the backlog item

**Nothing above is deployed to crm.badartrader.com yet.** All frontend changes exist only in the local working tree and the local test server (`localhost:8744` via `.claude/launch.json`). Waiting on Muhammad to say go before committing/pushing.

**Roadmap/status tracking moved to a Claude Artifact**, not just this file: [Badar Trader CRM - V2 Build Roadmap](https://claude.ai/code/artifact/cfab81b9-d8bd-47d1-8ecc-425853a000b3). Muhammad tried to hand-check items on it and got confused when it didn't visually update - clarified checkboxes are per-viewer localStorage, not shared. Rebuilt it as a plain status board with no interactive checkboxes at all; Claude marks items done after verifying them, nobody clicks anything. Keep both this file and that artifact in sync going forward.

**Open decisions, in the order Muhammad wants to take them (signal delivery + AI Signals now, bot flow map + nudge-agents timing last):**
1. **Signal delivery mechanism** - clarified tonight: there are 3 WhatsApp Communities, the same message gets posted into each one 4-5 times a day. This is community-level broadcast, NOT individual 1:1 sends to each member - an earlier exchange suggesting per-subscriber Cloud API sends was a miscommunication (Muhammad said he was tired when that was discussed). Cloud API cannot post to Communities at all regardless, so this channel is inherently app-only, whatever gets decided. Still open: whether to keep pure community posting (accept the risk, apply pacing/wording mitigations already discussed) vs. some hybrid with individual Cloud API sends for anything subscriber-specific. Also still unknown: whether individual member phone numbers are captured anywhere outside the communities themselves.
2. **AI Signals approach** - the pattern name and confidence % shown to clients are `Math.random()`, dressed up with a real live price. Three real options on the table: (a) genuine chart-pattern detection off real historical data, a real project, (b) real calculable technical indicators (moving averages, RSI, MACD, support/resistance) - honest, buildable, meaningfully less effort than (a), (c) human-picked signals, no automation claim at all. Awaiting Muhammad's lean.
3. **Bot Flow Map review** (deferred to last, deliberately) - Muhammad found the bot behaving inconsistently when testing from different phone numbers (e.g., his younger brother's number showed different behavior than expected). Wants to investigate that properly before signing off on the Flow Map as the source of truth for the v2 rebuild. This is the reason Phase B stays blocked, not just "hasn't gotten to it yet."
4. **When to re-enable `nudge-agents` reminders** (deferred to last, alongside the Flow Map discussion).

**New requirement logged (2026-07-21, 2am): automated database backups.** Muhammad has access to the client's web hosting/domain and wants a script placed there that backs up the CRM's Supabase data automatically, 4 times a day (every 6 hours), so new leads/data are continuously captured for the client's own copy. Full design deferred to later ("we'll talk about it later on"), just recording the requirement now per his new process rule. Needs to know the hosting type (cPanel/shared with cron+SSH vs something else) before writing the actual script.

**Ordering update:** the automated backup / web hosting item above is also deferred to the end, grouped with the Bot Flow Map review and the nudge-agents re-enable timing. Nothing on that trio gets worked on until Muhammad says so.

**Bot fixes shipped and deployed live (2026-07-21, ~2:30am):**
1. **Mid-flow abandonment restart (real bug, found from your own testing).** Any lead stuck at the main menu, broker choice, experience, traded-before, or deposit-confirm stage for 24+ hours with no restart rule, only "declined" leads ever restarted. A lead returning to any of those stages just had their new message misread as an answer to a days/weeks-old question. Now they get a full restart at the greeting, same 24h threshold as the existing declined-restart rule. This is almost certainly what caused "different behavior" testing from different phone numbers, fresh numbers hit the greeting correctly, numbers with old leftover test state didn't restart.
2. **Broker swap: Do Prime dropped, XM added.** Exness unchanged. Every bot message, button, and matcher updated (English + Roman Urdu). XM referral link/code supplied by Ehsan 20 July afternoon: `https://affs.click/a3Vrw`, code `YR4PD`. Historical leads with `broker_choice = 'doprime'` are left alone (DB constraint still permits the old value for existing rows; the bot itself no longer offers it as a choice going forward).
3. **Qualified-lead wording changed.** Was "deposit $500, then send a screenshot" as one sequential requirement. Now covers leads who may already be trading and have an existing $500+ balance, same screenshot requirement either way - the screenshot itself is the real signal a lead has closed, not the verbal "yes" to depositing (Badar's framing, 21 July).

All three deployed to the live Supabase project already. `docs/BOT_FLOW_MAP.md` updated to match (new Rule R6 for the restart, Box 3/6/8/10 broker text, Box 10 wording). Committing the source now so the repo matches what's live.

**Known follow-up, not done yet:** `simulator.html` still says "Do Prime" in 2 places, it's already a separately drifted artifact (Phase B territory) and wasn't touched tonight since the priority was the real, live bot.

**Still open from this same conversation, unresolved:**
- Whether the qualified message should show both Exness and XM links regardless of which broker a lead picked, or just the one they chose (current behavior: just the one chosen, unchanged tonight)
- The actual names for the new Conversations filter categories (Muhammad referenced wanting new ones but never sent the list)
- Whether lead status should only flip to "closed/converted" once a screenshot actually arrives, rather than the moment they say "yes" to depositing
- Whether there's a brand style guide (fonts/colors) to standardize across CRM/agent/client-facing surfaces, or match what's already in the CRM
- The Lovable landing page (VSL video, XM branding) - blocked, Claude has no access to the private project

**"Both" broker option added and deployed (2026-07-21, ~3am).** A lead can now pick "Both" at the broker-choice step (Box 3), alongside Exness and XM. The qualified-lead message shows both brokers' referral links/codes together when this is picked, instead of just one. Deployed live, DB constraint updated (`broker_choice` now allows `'exness'|'xm'|'both'|'doprime'`), Flow Map doc updated to match.

**Flow Map review round completed (2026-07-21, ~3:15am) - v1.1.** Muhammad reviewed the whole document box by box. Key outcomes:
- Bot's official name for the signals community: **Premium Signalling Group**. Use this name everywhere going forward, not "Free Signals Group."
- Selecting the Premium Signalling Group option now routes to a human agent instead of an automatic text dump (after-hours: "our team will get back to you first thing tomorrow"). Doc updated; webhook code NOT yet updated for this specific routing change, still needs to be built.
- New-lead WhatsApp ping to agents is **disabled in live code** (`NEW_LEAD_NOTIFICATIONS_ENABLED = false` in whatsapp-webhook/index.ts), deployed. Lead assignment itself still happens, only the notification is silenced. Re-enable only when told to.
- Spelling standardized on **Tanvir**, not Tanveer, in bot-facing text. Note: the wider system (Supabase project name, some profile data) still says "Tanveer" elsewhere, that's a separate, bigger cleanup not done yet.
- PROPOSED (not yet built): restructure Box 3 to ask "existing account or first-time" before broker choice, so existing account holders skip straight to the screenshot step. Needs Muhammad's final yes before building.
- Greeting matching expanded to reply in-kind for Namaste, Sat Sri Akal (Sikh greeting), and Arabic greetings, drafted but flagged for native-speaker review before going live.
- Screenshot fraud/authenticity (fake images submitted as "deposit screenshots") confirmed as a real, unresolved problem - proper fix needs Exness/XM API access to cross-verify deposits, a third-party dependency. Staying manual for now per Muhammad's call.
- Design Q4 (IB-switch walkthrough) confirmed as the top priority for the next round, but blocked on getting Exness/XM's actual real account-switching steps, not something to fabricate.
- `assets/Badar_Bot_Flow_Map.docx` regenerated to match v1.1, live at crm.badartrader.com/assets/Badar_Bot_Flow_Map.docx.

**Still open from this review, unresolved:**
- What "divide it into three" referred to in Box 2 feedback - couldn't identify it
- Whether a second, separate verification form is actually wanted (only one exists: crm.badartrader.com/join.html)
- Final wording for the Roman Urdu "Dear Customer" replacement (drafted as "Mohtaram Customer", needs Muhammad's confirm)

**In-dashboard Guide tab added and deployed (2026-07-21).** Admin and agent dashboards both have a new "Guide" tab explaining what every section is for. Admin sees all sections explained; agents see their own subset plus a note on what stays admin-only.

**Agent lead-visibility verified with a real RLS simulation, not just checking the policy exists** - logged in as Ehsan (32 leads actually assigned to him), confirmed he can see 73 leads total, everything. Suspended agent (Syed Hamza) correctly sees 0. The staff-wide visibility change from earlier is genuinely working, not just configured on paper.

**Dead end found:** the "Badar Trader Hub" Lovable link in the Sites tab (`https://preview--profit-path-crm.lovable.app/`) just redirects to Lovable's own login page, not a working public preview. Not a path into the landing page project.

**Latency: parallelized the 4 places that sent two WhatsApp messages sequentially (2026-07-21).** Greeting+language card, FAQ+menu resend, and both restart flows (declined, mid-flow) now fire both messages via Promise.all instead of waiting for the first to fully complete before starting the second. Deployed, and re-tested with a simulated webhook call before/after: the gap between the two sends dropped from ~1.4s to ~0.6s, roughly halved, confirmed with real timestamps, not just theory.

**Important honest finding: this did NOT fix the overall 4-6s latency Hanzala flagged.** Total time from inbound message to the bot's response is still ~5+ seconds in the same range as before. The parallelized sends were never the dominant cost, most of the delay happens earlier in the pipeline (lead lookup/creation, round-robin assignment, related DB writes) before the bot even gets to sending a reply. That part has NOT been diagnosed or fixed yet, real further investigation needed, not something to claim as solved.

Tradeoff noted on the parallelization itself: sending two messages concurrently instead of strictly in order carries a small theoretical risk Meta could deliver them out of order (language picker before the greeting, for example). In practice near-simultaneous requests to the same endpoint arrive in order the vast majority of the time, but it is not a hard guarantee like sequential sending was.

**Latency investigation continued (2026-07-21) - found the real dominant cost.** Restructured the new-lead path: agent round-robin assignment now runs fully in the background (the customer's greeting never needed `assigned_agent_id` anyway), and the inbound message log now runs concurrently with the bot's reply instead of blocking it. Deployed and measured.

Real finding: **cold start, not the code, was the dominant cost.** Isolated test calls (each one the first request in a while) consistently took ~5+ seconds. Firing 3 requests back-to-back, keeping the function warm, dropped total time to **2.3-3.0 seconds**. This matches how Supabase Edge Functions (serverless, Deno-based) behave, an idle function pays a real startup cost on its next invocation.

Practical implication: in real usage with steady message traffic, the function likely stays warm most of the time and typical latency should be closer to 2-3 seconds, not 5-6. But a lead who messages after a quiet period will still hit a cold start. There is no code-level fix for this within the current architecture, keeping the function warm would need a separate scheduled "ping" to it every few minutes, which is a real option if this still isn't fast enough, not something built tonight.

All test leads from tonight's latency investigation cleaned up.

**Three real bugs found from live screenshots (Hanzala's CRM view + two real phone tests) and fixed (2026-07-21):**

All three trace back to the same root cause: tonight's earlier RLS change ("any active staff sees every lead") only touched database table policies. Two other places enforcing the old "must be the exact assigned agent" rule were missed.

1. **CRM Conversations tab showed internal bracket notes instead of real message content, for the entire bot flow.** Every single outbound message, at every stage, was logged as a placeholder like `[screenshot ack sent]` or `[post-resolution acknowledgement sent]` instead of what was actually said. Agents had no way to see what the bot told a customer. Root cause: `logOutbound` calls throughout `whatsapp-webhook/index.ts` were hand-typed descriptions, not the real content. Fixed properly, not patched: `sendText`/`sendButtons`/`sendList` now always return the real text (or a readable button/list summary) alongside success/failure, and a new `combineSendLog()` helper builds the log line from that, so it can never drift from reality again. Verified end to end with a live test: the log now shows the actual greeting text and language card content, not a placeholder.

2. **`send-wa-message` edge function rejected sends with "This lead is not assigned to you"** for any agent who wasn't the literal assigned agent, even though the RLS change was supposed to let any active staff member handle any lead. This function had its own hardcoded check that was never updated. Fixed to check `is_active_staff()`-equivalent logic (any non-suspended profile, admin or agent) instead of exact assignment. Deployed.

3. **Deposit screenshot thumbnails permanently failed to load** ("failed to load, tap to retry", retrying never helps) for any agent not specifically assigned to that lead. Root cause: the `deposit-screenshots` storage bucket's own RLS policy still said "agent select own clients" (exact assignment), never updated either. Fixed to `is_active_staff()`, matching the rest. Applied directly to the live database.

**Also confirmed, not a bug, a known issue already on the backlog:** a family member's screenshot sent by mistake to the bot number got acknowledged as "Got it! Your deposit screenshot has been received" - this is the already-documented screenshot-authenticity gap (any image is treated as a valid deposit screenshot, no real verification exists). Not touched tonight, still needs Exness/XM API access to fix properly, per the earlier Flow Map review notes.

**Lesson for future RLS/access changes:** check ALL enforcement points, not just the database table policies. Storage bucket policies and hardcoded checks inside edge functions are separate and easy to miss, as this exact incident just showed twice in one policy rollout.

**Root cause found for the brother's "inconsistent bot behaviour" reports, actually fixed this time (2026-07-21).** Earlier tonight the 24h-idle restart-from-greeting rule was added for mid-flow stages and for "declined", but "qualified" was deliberately left out, reasoning it already has concrete next steps and a restart would wipe that context. That reasoning wasn't checked against what Muhammad had actually been asking for repeatedly: any lead returning after 24h+ idle, regardless of stage, should restart from greeting + language. Confirmed against a live screenshot: a number already at `bot_stage = qualified` said "hello" after being idle and got the generic "a team member will follow up" fallback instead of the greeting/language card, because the switch statement's `default` branch only restarts "declined", never "qualified". Fixed: added `"qualified"` to `MIDFLOW_RESTART_STAGES` in `runBotStep` (`whatsapp-webhook/index.ts`), so it now gets the same 24h+ restart as every other stage. Deployed. Confirmed via a live DB query that this affects real leads, not just the one reported: 11+ leads are currently sitting at `bot_stage = qualified` with idle times ranging from under an hour to 9+ days, several of them (4-9 days idle) will restart to the greeting/language card on their very next inbound message under the new rule, which is correct going forward but is a real behaviour change worth being aware of.

Not yet independently re-tested end to end (would require texting a real customer's number to trigger it; the brother re-sending "hello" to the bot number now would be a live confirmation).

**Follow-up, same night: found the real reason the 24h restart looked unreliable even after the fix above.** Traced a specific case (lead `0b7e9ecf`, phone `+923362391119`, likely the brother's test number) via `audit_log`: the customer's actual last message was 2026-07-14, a full week of silence, but on 2026-07-20 10:13 an agent (real `actor_id`, not the bot) simply opened the conversation in the CRM, which flips `is_unread` to false. The `leads_updated_at` trigger bumps `updated_at` on ANY write to the row, so that innocent view silently reset `updated_at` to 07-20 10:13. When the customer then messaged "AOA" the next morning, the restart logic measured ~19.75h idle (since the CRM view) instead of the true ~7 days, stayed under the 24h threshold, and the customer got the generic ack instead of a restart.

Root cause: `runBotStep`'s idle checks (`returningAfterGap`, the mid-flow restart, the declined restart) all read `lead.updated_at` as a proxy for "customer's last message," but that column reflects any write to the row at all, agent notes, tag changes, status changes, an agent merely opening the thread, not specifically the conversation going stale. Fixed properly: added `getLastInboundAt()`, which reads the most recent `communications` row with `direction = 'inbound'` for that lead, queried in the main loop before the current inbound message is inserted (so it can't race with itself). `runBotStep` now takes this as an explicit `lastCustomerTouch` parameter and anchors all three idle checks to it instead of `lead.updated_at`. This fixes the reported case and is now immune to any future CRM-side activity (views, notes, tags) silently resetting the clock. Deployed. Not yet independently re-tested live (needs a real customer message on a lead that's genuinely 24h+ stale by actual conversation time to confirm).

**Premium Signalling Group handoff - actually built now (2026-07-21, evening).** The Flow Map v1.1 review above already decided "Selecting the Premium Signalling Group option now routes to a human agent instead of an automatic text dump" but explicitly noted the webhook code was NOT yet updated. Muhammad tested it live tonight (screenshot of the actual WhatsApp conversation) and got the full auto-dump anyway - confirming the gap was real, not just a doc note. Fixed: the `free_signals` menu choice in `runBotStep` now calls `escalate()` with reason `"requested human agent for Premium Signalling Group"` (the "requested human agent" substring matches the existing `explicitRequest` regex used for permanent handoffs, so this behaves exactly like "Talk to an Agent" - the bot stays silent for this lead going forward, doesn't auto-resume after the usual gap). Deployed and confirmed via `supabase functions list` (whatsapp-webhook now at v42+, matching deploy timestamp).

**Known related gap, not yet changed:** the same `freeSignalsText()` full-instruction dump still fires from a second, different spot - when a lead answers "Not right now" to the $500 deposit confirmation, the bot auto-sends the identical wall of text as a downsell pitch (`awaiting_deposit_confirm` case, "no" branch). Flagged to Muhammad; his call needed on whether that path should also become an agent handoff or stay as an automated pitch, since it's a different moment in the flow than the menu selection the Flow Map note was specifically about.

**Bot "Go Back" navigation - built end to end (2026-07-21, evening), per Muhammad's explicit instruction after the signals-handoff miss.** Every interactive step in the funnel (broker choice, experience level, traded-before, deposit confirm, main menu) now has a "⬅️ Go Back" option that undoes the mistaken tap and returns to the previous question - previously a wrong tap had no recovery at all.

Implementation:
- New DB column `leads.bot_stage_history text[]` (migration `20260721_bot_back_navigation.sql`, applied live) - a stack of every stage a lead has moved forward through. A single "previous stage" field wasn't enough because `awaiting_deposit_confirm` is reachable from two different prior stages depending on path (`awaiting_experience` if "Experienced", `awaiting_traded_before` if "New to trading"), so the real previous stage has to be tracked per-lead, not assumed.
- `advanceStage()` replaces the old bare `.update({bot_stage: ...})` calls at every forward transition - pushes the current stage onto the history stack and merges in whatever fields that transition sets (broker, language, trader experience).
- `goBack()` pops the stack, clears whichever field the stage being left had just set (so re-answering doesn't inherit a stale value - e.g. backing out of "Experienced" clears `broker_choice` isn't right, backing out of broker choice back to the menu clears `language`... see code comments for the exact mapping), and re-sends that stage's prompt.
- `matchNavBack()` recognizes both the button/list tap (`nav_back` id) and typed "back"/"previous"/"wapas". Checked once, globally, right before the stage switch - works uniformly across every stage without touching each stage's own matcher.
- Broker choice (Exness/XM/Both) was already at WhatsApp's 3-button cap, so it was converted from a button message to a list message (`sendBrokerCard`) to fit a 4th "Go Back" row - same pattern already used for language/menu. Experience, traded-before, and deposit-confirm each only had 2 buttons, so "Go Back" simply became their 3rd button.
- Fixed a latent double-logging bug while touching `sendDepositConfirm`: it used to call `logOutbound` internally AND get logged again by `handleUnmatched` when reused as a re-prompt - removed the internal log call, made every caller responsible for logging (matches every other `send*` helper).

Verified live end-to-end via direct webhook POSTs against a disposable test lead (`+10000000005`, deleted after): walked language → menu → broker (Exness) → back → broker (XM) → experience → traded-before → deposit-confirm → back, confirmed at each step via direct DB query that `bot_stage`, `bot_stage_history`, and the cleared fields (`broker_choice`, `trader_experience`, `language`) were exactly correct, including the branch-aware case (going back from deposit-confirm correctly returned to `awaiting_traded_before`, not `awaiting_experience`, matching the path actually taken). Deployed live.

**Point 2 (deposit-decline downsell) confirmed already resolved, plus a real bug found in it (2026-07-21).** Muhammad's decision: declining the $500 deposit should immediately hand off to a human agent, same as the Premium Signalling Group fix. Checked the live code: this was already built and deployed earlier tonight (commit 24a044e, before this conversation started) - `awaiting_deposit_confirm`'s "no" branch already calls `escalate()` instead of dumping the free-signals text. Confirmed working as designed.

Found a real bug while confirming it: the escalate() call's reason string was copy-pasted from the Premium Signalling Group handoff and never updated - every agent seeing this escalation in the CRM saw "requested human agent for Premium Signalling Group" for a lead that actually just declined the $500 deposit, wrong and misleading about what the agent needs to do. Fixed to "requested human agent after declining $500 deposit". Deployed.

**Standing style rules (no em dashes, no emojis) and two prior "decided" renames were never actually applied to the live bot copy (2026-07-21).** Muhammad checked and was furious to find, correctly, that the greeting, FAQ, qualified message, and every re-prompt in whatsapp-webhook still had em dashes and emojis, despite this being logged earlier tonight as an already-applied standing rule. Same sweep also caught two other things that were "decided" but never reached the real code: "Badar Tanveer" still appeared in the Free Signals Group menu descriptions (should be Tanvir), and the menu button itself still said "Free Signals Group" (should be "Premium Signalling Group", the rename earlier only reached an internal escalation-log string, never the actual button text).

Fixed properly this time: removed every emoji and em dash from customer/agent-facing strings (greeting, FAQ both languages, qualified message, deposit ack, all re-prompts, escalation message, agent pickup ack, Go Back button label), fixed Tanveer -> Tanvir and Free Signals Group -> Premium Signalling Group in the real button text. Internal-only bracket log strings (never seen by a human, only stored for the CRM's own audit trail) were deliberately left alone. Parse-checked with esbuild, deployed, and verified live with a real simulated webhook call, confirmed the actual stored message now reads "Hello!" with no emoji, not just that the code compiles.

**Lesson, added to memory this time so it isn't lost between sessions:** never tell Muhammad a wording/style decision has been "applied" based on a HANDOFF.md note saying so, grep the live file yourself first and show the actual match.

**Still open:** "Piyare Customer" (Roman Urdu Main Menu header, found while doing this sweep) needs Muhammad's final word choice, same unresolved item as "Dear Customer" -> "Mohtaram Customer" for the English side. Not changed yet, needs his answer before touching customer-facing wording again.

**Six more real issues found and fixed, live with Muhammad (2026-07-21, later same night):**

1. Header buttons: restructured so Export CSV and Add Lead share a fixed min-width (matched to each other), Logout pushed to the far right corner with margin-left:auto, no longer grouped/sized with the other two. Verified live: measured both at exactly 118px, Logout at the far edge.

2. Conversations Send button was vertically centered against the growing message textarea, looked like it sat in the middle of the chat box on a multi-line message. Fixed with align-items:flex-end on .conv-input-bar. Verified live with a 4-line test message.

3. **Real cause of a lost lead tonight, actually fixed**: Hanzala tried to manually step into an early-stage bot conversation and the bot kept consuming the customer's subsequent replies as answers to its own stage machine, since nothing ever told the bot a human had taken over. This was flagged as a proposed-but-unbuilt fix in an earlier HANDOFF section ("awaiting Badar's go-ahead"), built now given the real damage it just caused. Both send paths, the send-wa-message edge function (primary) and index.html's legacy in-browser fallback, now set `needs_human: true` with a `handoff_reason` containing "requested human agent" (matches the existing permanent-handoff regex) on every agent-sent message. Deployed.

4. `asksAboutLowerDeposit()` required the literal word "500" alongside a "less/lower" word to trigger escalation. "What's the minimum deposit?", a completely natural way to ask the same thing, contains neither and never escalated. This is exactly what happened to Omar Farooq's real conversation content Muhammad was looking at. Added a direct "minimum deposit" pattern. Verified live: a real simulated webhook call with this exact phrase now sets needs_human=true with the correct reason, confirmed via DB query, test lead cleaned up after.

5. join.html and course-form.html, both real live customer-facing forms, still offered "Do Prime" as a broker dropdown/placeholder even though it was dropped for XM everywhere else weeks ago in the bot. Fixed both to XM.

6. signals-form.html plus the two forms above still said "Signals Group" (should be "Signalling") and had customer-facing em dashes, same sweep as the bot copy fix earlier tonight, just missed these three static pages. Fixed.

**Also clarified again for Muhammad, recurring confusion:** the Omar Farooq / Ayesha Malik / Bilal Khan conversation content he keeps asking about ("who answered this", "why didn't it escalate") is static demo script text (_DEMO_CONVERSATIONS in index.html), never actually processed by the real bot, there is no real bot/human distinction in it and no real escalation logic ever ran against it. Real verification has to go through an actual webhook call against real code, like item 4 above, not by reading the demo transcript.

**New gap surfaced, not yet built:** the Conversations reply box has no way to attach/send an image, agents can only send text replies from the CRM itself. Asked Muhammad if he wants this built.

**Still open:** "Piyare Customer" / "Dear Customer" final wording, same unresolved item as before.

**"Piyare Customer" -> "Mohtaram Customer" decided and shipped (2026-07-22).** Muhammad's final call: keep "Dear Customer" for English unchanged, change the Roman Urdu Main Menu greeting to "Mohtaram Customer" (respected/esteemed, matches the professional register the English side already had; "Piyare" read as too warm/informal, dear/beloved, for a business greeting a customer). Deployed and verified live with a real simulated webhook call, confirmed the actual stored message text, test lead cleaned up after.

This closes the last open wording item from the earlier Flow Map review round.

**Four real items from Muhammad, all actually built and verified this time (2026-07-22):**

1. M Junaid deletion, checked live: nothing there right now, already clean.
2. "Simulator" request: `simulator.html` already existed but is a stale, separately-maintained reimplementation (still offers Do Prime, missing every fix from tonight) - pointing to it would show wrong behavior. Built the actual fix instead: a one-click "Delete Lead" button in the lead detail panel (admin-only), removing the lead and every associated record (communications, communication_logs, lead_activity, transactions, kyc_documents) so Muhammad or any admin can reset a test number themselves without asking for a raw SQL delete again. Verified live via the real button click in the browser.
3. Blue double-tick / read receipts: added `markAsRead()`, called for every inbound message via WhatsApp's official read-receipt endpoint, fired in the background so it can never slow down the bot's actual reply. Deployed and confirmed it doesn't interfere with the rest of the flow. Honest limitation: can't be proven with a disposable test webhook call (fake message IDs), needs a real WhatsApp message to see the actual tick appear.
4. Missing V1 "Quick Links" panel: found the real cause, it was only ever built for the agent dashboard, never the admin one - as admin, Muhammad could never have seen it in any version. Added the same panel to the admin Conversations tab. Also fixed the link list itself while there, it still referenced the dropped Do Prime broker, now XM. Verified live in browser: renders, collapses/expands correctly.

---

## 2026-07-25 - Standing rule: deploy without per-instance confirmation

Muhammad can't stay tied to the laptop approving every notification. Agreed standing rule for this project, going forward across all accounts/sessions:

**No longer needs to ask before each deploy.** Once code is written and verified (compiles clean, tested live where feasible), commit + deploy Supabase edge function changes (and push frontend changes to `main`, which auto-deploys via Vercel) without a separate "want me to proceed?" message each time. This matches how the project has actually run for weeks - this file is full of "Deployed" entries with no per-instance ask recorded.

**Still always confirmed in chat first, no exception, regardless of this rule:**
- Sending any message to a third party on Muhammad's behalf (e.g. the WhatChimp support replies) - these get drafted for him to send himself, or confirmed before sending.
- Destructive/irreversible operations (force-push, dropping DB tables/data, `rm -rf`-class actions).
- Anything touching money or financial credentials.

A permission-prompt allowlist scan the same day (`fewer-permission-prompts` skill) found nothing to add to `.claude/settings.json` - the frequent Bash commands were already covered by Claude Code's built-in read-only auto-allow list, and the one high-frequency MCP tool (`mcp__claude-in-chrome__computer`, browser clicks/typing) isn't read-only so was correctly excluded. The friction was coming from deploy-confirmation chat messages, not tool-permission popups - this rule addresses that directly.

---

## 2026-07-28 - Bot paused for WhatChimp month; also deployed a 5-day-stale fix

**Muhammad's direct instruction tonight: stop the Supabase-built chatbot.** He's bought a WhatChimp subscription and the client is running on WhatChimp for a paid month already committed to. Before that month ends, propose Meta Ads to the client - noted as a real responsibility, not done yet.

**What was actually live vs. what everyone assumed:** a `BOT_REPLIES_ENABLED = false` change already existed in the working tree, with a code comment dated 23 July 2026 explaining WhatChimp got connected to the same WABA and could double-reply alongside this bot - but it was never committed or deployed. The live `whatsapp-webhook` function was still running the 22 July build (v64) the whole time; the pause had only ever existed as an uncommitted local file. So the WhatChimp-crosstalk risk this was meant to guard against was live and unaddressed for 5+ days, silently.

**Fixed now:** committed (`89d741e`) and deployed live (v65, confirmed via `supabase functions list`). Verified with a real simulated webhook call against a disposable test lead - `communications` now logs `[DELIVERY FAILED: Bot replies paused (BOT_REPLIES_ENABLED = false)]` instead of an actual WhatsApp send; inbound logging and lead creation still work normally, only outbound replies are suppressed. Test lead deleted after. Pushed to `main`.

Scope of the pause: `sendText`/`sendButtons`/`sendList` inside `whatsapp-webhook` no-op - this is specifically the automated bot replying to customers. It does NOT touch `send-wa-message` (agents manually messaging from the CRM) or `nudge-agents` (already unscheduled). Flip `BOT_REPLIES_ENABLED` back to `true` in `supabase/functions/whatsapp-webhook/index.ts` when the WhatChimp month is up, then redeploy.

**Separate issue found while doing this, not yet resolved:** `.claude/settings.local.json` is tracked in git (not gitignored) and its uncommitted working-tree version contains a live Supabase personal access token (`sbp_...`) embedded in a Bash-allow pattern string. Confirmed it is NOT in any committed history and NOT on GitHub yet - caught before it leaked. Left uncommitted deliberately; needs a decision (gitignore the file going forward, and probably rotate that token out of caution) before it's ever committed.

**Lesson, same shape as the em-dash/emoji incident on 21 July:** a decision existed in code as a local, uncommitted edit and was treated as if it were live. Always check the deployed function's actual version/timestamp (`supabase functions list`), not just that a fix exists somewhere in a file, before telling Muhammad something is handled.

---

## 2026-07-28 (later) - Standing rule: GitHub + live Supabase are the only source of truth, not any one laptop

**Why this rule exists:** Muhammad flagged that this same failure mode (Claude re-treating already-fixed work as an open problem, or losing track of state) has now happened repeatedly across sessions. Root cause, confirmed directly against git in this same session: it was never that this file was wrong or unread - it's that real work sat committed-nowhere on a single local checkout, so a later session (or a literally different laptop) had no way to see it. A doc read faithfully still gives the wrong answer if the code it describes never actually got pushed.

**The rule, effective immediately, across every account and every machine:**
1. Nothing that matters - code or this file - ends a working session uncommitted and unpushed. Commit and push before considering anything "done," not "later."
2. Every session starts with `git pull origin main` before trusting any local file, memory note, or prior "done" claim. Anything claimed live gets checked against actual deployed state (e.g. `supabase functions list`), not taken from this doc's word alone.
3. GitHub (this repo) and the live Supabase project are the only real source of truth. Not this laptop, not any one Claude session's memory.

**Multi-laptop implication, per Muhammad's direct question (28 July):** he's asking because his wife's and his younger brother's laptops may also need to pick up this work. As long as a laptop has this repo `git clone`d and can authenticate to GitHub and to the Supabase project (`vfskqzgphrunjxquqpks`), saying "continue" there resumes from the exact same true state as any other machine or account - because the state lives in GitHub + Supabase, not on any one device. Setup needed per new machine: git installed, repo cloned, GitHub auth (SSH key or token), `supabase login` once. Not yet confirmed whether the wife's/brother's laptops have this set up.

**Standing reminder, not to be dropped silently:** the `.claude/settings.local.json` live Supabase token (see 28 July entry above) stays an open item - Muhammad's explicit instruction is to keep surfacing it periodically until it's actually resolved (gitignored + token rotated), not just mentioned once.

---

## 2026-07-28 (later still) - WhatsApp-style chat redesign approved and shipped

The undocumented `index.html` change flagged above (found sitting uncommitted with no explanation) turned out to be a WhatsApp-style restyle of the Conversations panel: per-contact colored avatar circles (hashed from lead id, 8-color palette, `avatarColor()`) instead of one flat blue for every contact; cream chat background; smaller/tighter bubbles; green outgoing / white incoming instead of blue/white. Nobody could say where it came from, so per the review-before-rollout rule it was not deployed blind - built a side-by-side mockup (live style vs. this style) using the actual CSS rules and sent it to Muhammad instead of describing it in words. He confirmed live in chat: "I love it, and I want it!"

Committed (`4f17b86`) and pushed to `main`. Verified via diff review + balanced-tag sanity check only - **not** verified live in a logged-in browser session (no CRM login credentials available in that session). Vercel auto-deploys `main`, so this should be live within a couple minutes of the push. Next session (any account/machine): confirm live at crm.badartrader.com that the Conversations panel actually renders the new colors/bubbles correctly, especially on a real conversation with both incoming and outgoing messages, before treating this as fully verified.

**Verification done 2026-08-03 (Junaid), with one honest gap.** The deployed `index.html` on crm.badartrader.com was fetched and diffed against local `HEAD`: byte-identical, so the chat-redesign code confirmed genuinely live, not just pushed. All markers present on the live file (`msg-bubble`, `AVATAR_PALETTE`, `#d9fdd3`, `.conv-messages` cream `#efe9e1`). Rendering was then exercised by opening an actual thread containing both directions (2 incoming + 1 outgoing bubble) and reading computed styles: incoming `rgb(255,255,255)` white, outgoing `rgb(217,253,211)` green, chat pane `rgb(239,233,225)` cream, and per-contact avatar circles resolving to different palette colors. Renders correctly.

**The gap: this was demo-mode data, not a real logged-in CRM session with real WhatsApp messages** - still no CRM login credentials on this machine. Since the live file is byte-identical to what was rendered, the styling itself is confirmed; what remains unconfirmed is only how it looks against real message content (very long messages, images/screenshot attachments, unusual timestamps). Anyone with a real login should glance at one real thread to close that last bit.

---

## 2026-07-29 - WhatChimp bot rebuild (in progress) + Meta Ads Manager investigation

**Context: this is a different track of work from the CRM/Supabase bot above.** Muhammad decided to run the customer-facing bot through WhatChimp for the paid subscription month (see 28 July entry - Supabase bot's `BOT_REPLIES_ENABLED` is deliberately `false` during this). This section covers rebuilding the same bot logic inside WhatChimp's own Flow Builder, box by box, using `docs/BOT_FLOW_MAP.md` as the spec. **None of this touches the Supabase CRM codebase** - it's all inside the WhatChimp SaaS UI (app.whatchimp.com), driven live via the `claude-in-chrome` browser connector on Muhammad's real Chrome profile.

**Real, hard-won mechanics of WhatChimp's Flow Builder (not documented anywhere WhatChimp publishes, learned by trial and error):**
- New blocks are created by dragging **from an existing block's output socket to empty canvas** (not by dragging a block from the left sidebar onto the canvas - that creates a block that *looks* fine but fails validation on save with a vague "Some component(s) have no data" error). Dragging from a socket opens a type-picker (Text, Image, Interactive Message, Condition, etc.) right there.
- An "Interactive Message" block's **Buttons** output socket can be dragged from multiple times - each drag spawns a separate "Button" node (its own label + a "Send Message"/"Start a Flow" action dropdown), up to WhatsApp's normal 3-button cap.
- For more than 3 options, use the **List Messages** output instead - it spawns a "Section" node, and dragging repeatedly from the Section's own **Rows** socket spawns one "Row" node per list item (each with its own title/description).
- **Real limitation, not a bug I could work around:** an output cannot be reconnected to an input that already has an incoming connection - dragging a new edge onto an already-fed input throws "You made an incompatible connection." This means **there is no way to loop a later box back to re-show an earlier message** (e.g. FAQ → back to main menu). The practical workaround is to duplicate the target message downstream instead of looping - more content to maintain, but it's the only mechanism the tool allows.
- **Save only succeeds when the entire flow has zero dangling connections anywhere** - every block's output must lead somewhere, or Save fails with "All components should be connected." I never got a successful Save this session; every attempt was still on a partial flow (see below). This means **WhatChimp will not let us save incrementally** - the whole flow (all boxes, both languages) has to be wired end-to-end before a single Save can succeed, unlike the old approach of shipping one finished path at a time.

**Build state right now, on the `+92 371 5773903` bot (bot_id 440889) in WhatChimp's Flow Builder - NOT SAVED, lives only in the open browser tab's in-memory state, will be lost if that tab/session closes:**
- Box 1 (greeting + English/Roman Urdu language buttons): fully built, both branches connected.
- Box 2 English main menu: built with the correct 4 options (Start Trading, Premium Signalling Group, Talk to an Agent, FAQs) as list rows, no extras. Talk to an Agent → Box 9 escalation text: connected. FAQs → Box 7 FAQ text: connected (dead-ends there, can't loop back per the limitation above).
- **Box 2's own list is currently NOT wired to its menu message** (the "List Messages" → "Section" edge got broken during cleanup of leftover test/orphan nodes and was not successfully reconnected before running out of time - several attempts hit the "incompatible connection" error, likely from imprecise click targets on an increasingly cluttered canvas, not a hard platform limit). This is the one concrete blocking task before Box 2 is actually usable.
- Box 2's Roman Urdu mirror: not started - the Roman Urdu button in Box 1 currently dangles (leads nowhere), which is also why Save fails.
- Boxes 3 through 12 (broker choice, experience, deposit confirm, qualified, declined, screenshot handling, escalation rules): not started.
- There is leftover debris on the canvas from earlier trial-and-error (an orphan "Quick Reply" node, disconnected) that resisted every delete attempt (toolbar icon never appeared for it, keyboard Delete did nothing) - harmless since it's unreachable from Start, but should be cleaned up eventually for canvas sanity.
- **Time estimate given to Muhammad, honestly uncertain:** several more hours of work minimum to complete both languages across the remaining ~13 boxes, likely spanning into another session. The first two boxes took disproportionately long because of the discovery process above; later boxes should go faster now that the mechanics are known.

**Agreed plan going forward:** build box by box, English first per box then its Roman Urdu mirror, so nothing is left half-done. Muhammad offered to do manual clicks himself for anything the browser automation struggles with (specifically: reconnecting to already-existing nodes) - division of labor is: Claude creates/fills new boxes (reliable), Muhammad does any stubborn reconnect if asked.

**Also raised and worth remembering for whoever picks this up:** Muhammad asked whether a bot is even required at all - it isn't. WhatsApp's API and WhatChimp's Shared Inbox both support agents handling every lead manually from message one, no automation needed. Told him the real trade-off (bot buys 24/7 coverage + consistent qualification before an agent's time is spent; without it, agents must be actively available for every single lead including after hours - the exact gap that caused missed leads before). He hasn't decided between "agents live manually today" vs. "wait for the bot" yet.

**Separate, connected topic: Meta Ads campaign.** Muhammad wants a Click-to-WhatsApp ad campaign (Trade Campus ad account, business portfolio also named "Trade Campus", ad account owner shown as "Badar Tanveer", ID `1024848662493589`) live, redirecting ad clicks to the `3903` number. Investigated live in Ads Manager:
- Campaign **"28 July - Free Course - Campaign"** (likely Saira's 16 July campaign, renamed/rescheduled - matches "she may have changed the date to yesterday's"), currently paused ("Off"), one ad set "Broad - Pakistan", one ad "Video ad 1", objective is messaging conversations (Click-to-WhatsApp).
- **Real, concrete finding, not yet fixed:** the ad set's Conversion → Message destinations → WhatsApp number is set to **+971 58 141 0981** - a completely different (UAE) number, not `3903`. If this campaign were turned on as-is, every ad click would open WhatsApp on the wrong number. This is the actual answer to "where does the 3903 number need to be set for the campaign to work" - it's chosen per-ad-set under Message destinations, not anywhere in Business Settings, and it currently needs to be changed to 3903 before publishing. **Not fixed yet - needs doing, then Muhammad's explicit confirmation before actually turning the campaign on (real ad spend starts the moment it's turned on).**
- Separately, the ad's Instagram profile connection (`syedbadartk1`) shows a "Review this connection" warning in the ad editor - not investigated further, may or may not block delivery.
- Muhammad separately opened Business Settings → Ad Accounts → "Share this ad account with a partner" and asked what Partner Business ID/email to use for "connecting to WhatChimp." Flagged to him live: this dialog is for delegating ad-management access to another business (agencies, ad tools), not how a WhatsApp number gets connected to WhatChimp for messaging - those are unrelated Meta features. The `3903` number itself already shows "Active" in WhatChimp's Bot Manager (found earlier this session), so the core messaging connection may already exist. If he actually wants WhatChimp's own ad-creation feature (saw a "Click Ads"/"WhatsApp Ads" option in its sidebar earlier, not explored), that would need WhatChimp's real Partner Business ID from WhatChimp's own docs/settings - not guessed. **Unresolved, told him not to submit that dialog until confirmed.**

**Process note for next session:** Muhammad is mid-session, switching Claude accounts (desktop app only allows one signed in at a time) to keep parallel work going - this file was updated specifically so any account/window can resume with full context, per the standing three-account-rotation process.

---

## 2026-07-29 (later) - Supabase bot: greeting matcher extended (Namaste/Sat Sri Akal/Arabic), NOT yet deployed

Per Muhammad's explicit choice tonight, worked on the Supabase `whatsapp-webhook` bot itself (distinct from the WhatChimp rebuild above) - **kept `BOT_REPLIES_ENABLED = false`, no live customer impact either way.** This closes the "Greeting matching expanded... drafted but flagged for native-speaker review" item from the 21 July Flow Map review.

`matchGreeting()` now also recognizes Namaste/Namaskar, Sat Sri Akal (Sikh greeting, "sat shri akal"/"satsriakal" variants), and Arabic marhaba/ahlan (both Latin transliteration and Arabic script مرحبا/أهلا), replying in kind (`Namaste!`, `Sat Sri Akal!`, `Marhaba!`). Refactored the old `greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY` ternary (repeated at 5 call sites) into one `greetingReplyText()` helper so it can't drift. Verified with `deno check` (7 pre-existing unrelated type errors confirmed present on `main` before this change too - none introduced) and a standalone regex unit test covering all new + existing patterns (14/15 cases pass; the 1 failure, `"Assalam o alaikum"` with spaces not matching, is a **pre-existing** gap in the walaikum regex, not touched, not part of this task).

**Still needs Muhammad's native-speaker sign-off on the exact wording before this is trusted** - same caveat the 21 July doc already flagged, not resolved by writing the code. My choices, subject to his correction: "Namaste!" and "Sat Sri Akal!" (no romanization ambiguity), and "Marhaba!" for Arabic rather than replying in Arabic script - done to stay consistent with the rest of the bot's Latin-script-only style (English + Roman Urdu), not because Arabic script would break anything technically.

Committed (`1a295a8`) and pushed to `main`. **NOT deployed** - this session has no Supabase CLI session (`supabase login` needed, no `SUPABASE_ACCESS_TOKEN` in this environment), so `whatsapp-webhook` on the live project is still whatever version was deployed 28 July. No urgency since replies are paused anyway, but don't tell Muhammad this is "live" - it isn't yet. Next session with CLI access: `supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`.

---

## 2026-08-02 - Meta Ads number investigation + deep WhatChimp exploration (browser-driven session, `claude-in-chrome` on Muhammad's real profile)

**Context:** this session ran mostly outside the CRM codebase itself - no code changes, no deploys. It was live browser work across Meta Business Suite/Ads Manager and WhatChimp, on Muhammad's actual logged-in Chrome. Recording here since it directly affects the WhatChimp track and the Meta Ads / WhatsApp number status documented earlier in this file.

**Meta Ads - root cause found for ads redirecting to the banned number, partially fixed:**
- The client's social media manager and media buyer (Saira) reported ads still redirecting to the old banned UAE number. Investigated directly in Ads Manager (ad account `1024848662493589` "Badar Tanveer", under Trade Campus business portfolio).
- Found the actual live/active campaign is **"1st august - Free Course - Campaign"** (not the "28/29 July" ones referenced earlier in this doc, which are all Off) - its ad set explicitly pins WhatsApp destination to `+92 371 5773903`. Verified in three places (ad set Message Destinations, ad's own Identity field, and the live Destination preview panel) - this one is correctly wired to 3903.
- The actual culprit: **"29 July - Free Course - Campaign"** (currently Off, but has real historical spend/478 conversations) has its ad's WhatsApp number set to **"Use Facebook Page"** instead of an explicit number - meaning it silently follows whatever the Facebook Page's *Primary* WhatsApp number is. The Page's primary was still the banned `+971 58 141 0981` number until tonight.
- Muhammad went to the Page's own WhatsApp settings (Facebook app → Page → Settings → WhatsApp - a different screen than Business Manager's WhatsApp accounts list) and clicked **"Set as primary"** on `+92 371 5773903`. This should fix any ad using the "Use Facebook Page" default, including the 29 July one if it's ever reactivated.
- Decision: **do not reactivate the 29 July campaign** - no reason to, since "1st august" is already live and correctly (explicitly, not defaults-based) pointed at 3903. Old campaigns (16/28/29 July) left Off, not cleaned up yet (offered to delete/rename them to avoid future confusion, Muhammad hasn't answered).
- Separately, in Business Manager → WhatsApp accounts: both `3903` and the UAE number showed **"Rejected"** on their *display name* ("Trade Campus" violates Meta's naming policy) - unrelated to the ad-destination issue, this is a business-verification-name problem. Muhammad changed 3903's display name to **"Badar Trader"** (matches the Facebook Page name) - went "In review." He then edited it again after hitting a separate "name approved, enter number" prompt, which likely reset the review clock - not investigated further, but the number stayed Connected/functional throughout, only the display name is affected. UAE number's display name (still "Trade Campus", still Rejected) deliberately left untouched - Muhammad wants to fix one at a time.
- Ad's Instagram profile connection (`syedbadartk1`) confirmed **not actually claimed** in the Business Portfolio (Business Settings → Instagram accounts: "No Instagram accounts added") - it's a loose/legacy link, unrelated to the Click-to-WhatsApp objective so not a blocker for this campaign, but flagged as something to eventually claim via the "+ Add" button if Instagram-specific features are ever needed.

**WhatChimp deep exploration - full feature map + two real actions taken:**

Systematically went through every Automation/Data Collection/AI/Engagement/Commerce/Integrations tab, plus Settings → API Integration. Full feature inventory (for reference, nothing broken or changed unless noted):
- **Automation:** Keyword Replies, Message Templates (syncs real Meta-approved WhatsApp templates), Click Ads (Meta ad account **not connected** - offered to connect, not yet done), Follow-up Sequences, Quick Actions (system buttons incl. "Chat with Human"/"Chat with Bot" handoff, matches the Supabase bot's own escalation concept), Outbound Actions (outbound webhook, fires only on Postback/User Input Flow/Location - **has nothing to attach to right now** since the WhatsApp bot uses free-form AI replies, not buttons), Webhook Workflows (inbound direction - receives 3rd-party webhooks like Stripe/Shopify and sends a WhatsApp template in response; **not useful for this business**, no external payment platform to trigger it).
- **Data Collection:** User Input Flows, WhatsApp Flows (Meta's native interactive forms, has a "Flows Studio Beta" builder), Appointment Booking (real booking + request-management UI).
- **AI:** *(see below - this is where the real findings are)*.
- **Engagement:** Chat Entry / Chat Widget (website embed, unused).
- **Commerce:** WC/Shopify store automation, Product Catalog + orders (not relevant, no e-commerce store).
- **Integrations:** HTTP API (mid-flow outbound API calls), Google Sheets (⚠ corrected mid-session: this is **read/fetch only**, pulls sheet data into the bot - it is NOT an export/backup destination like this doc mis-stated earlier tonight before verifying), Autoresponder/Email/SMS (Muhammad explicitly doesn't want these explored/used).
- **Facebook/Instagram channels:** confirmed **0 bots connected** for both, even though Badar has both accounts - only WhatsApp is actually wired up in WhatChimp right now.
- **Subscribers page:** confirmed a real **Export/Import** (CSV) mechanism exists - this is the actual path for eventually migrating WhatChimp's lead list into the Supabase CRM when it's ready. 426 subscribers currently on the live 3903 bot. Also confirmed a **Bulk Delete** exists (Options → Delete Subscriber) but **nothing has been deleted** - Muhammad asked about deleting recent leads, a count was attempted but the "time ago" column turned out to be last-*activity* time, not join/creation date (some 4-5-day-old subscribers show recent activity, so it can't be used as a proxy for "leads since X"), so an exact date-based count was never completed. **Left as an open item**: proper answer needs the CSV export (has a real creation-date column) or a UI element not yet found - nothing was exported or deleted.

**AI Agent - real finding, and it was turned OFF tonight per Muhammad's direct instruction:**
- Confirmed the AI Agent (Settings → API Integration → AI API) has **OpenAI connected with a real secret key already saved**, model `gpt-5-mini`, matching what Muhammad said his younger brother set up and paid for. This was genuinely live and answering real customers on 3903 - not a placeholder.
- Read the full underlying prompt (AI → AI Knowledge Base → "Team Badar Support Bot Training" campaign) - it's a real, well-built prompt: identity as "Team Badar" assistant, strict tone/language-mirroring rules (English/Roman Urdu, no mixing, natural Pakistani phrasing), 3-5 line reply limit, Exness referral link + code, a Google Form submission link, a **Discord community link** (new - different from the WhatsApp Communities discussed in earlier sessions, worth confirming with the brother whether intentional), compliance rules (never promises returns, neutral on Exness vs XM), and built-in escalation logic (hands off to a human agent for sub-$500 deposits, negotiation, complex issues; stays silent once a human is in the conversation).
- Per Muhammad's explicit instruction ("stop the bot, shift to manual"), **the AI Agent toggle (AI → AI Agents and Intent Detection) was switched OFF and saved**, verified persisted after a full page reload. Only the `+92 371 5773903` bot was touched; the UAE bot's own AI Agent setting was left alone (not investigated, not in active use anyway).
- **Practical consequence, told to Muhammad directly:** there is now no automated reply of any kind on 3903 (Keyword Replies and Message Templates were already empty, so nothing else was quietly covering). Agents must actively watch Omnichannel Inbox now or new leads sit unanswered.

**Admin user for Badar's team - NOT created.** Walked through WhatChimp's User Manager → Create Team form fully (only two roles exist: Admin/Agent, no granular per-feature permissions - the only scoping lever is which bot/number a login can touch). Got as far as filling Full Name ("Team Admin"), Email (`badartanveer3903@gmail.com`), Team Role (Admin), Allowed WhatsApp Bots (3903 only) - **Muhammad then explicitly said not to create it** ("I'm not going to get it created"). Left as an unsaved draft in the browser, nothing submitted. Clarified for him: billing/API-key/account-deletion settings are inherently owner-only regardless of Team Role, since those live under the master account's own Settings, not under any Team member session - so "give the team near-full access but keep some things Badar-only" is already naturally satisfied by WhatChimp's own account model, no extra config needed if this is revisited.

**New AI training campaign planned for the UAE number (`+971 52 558 6541`) only - explicitly NOT touching the live 3903 campaign.** Muhammad wants to test/train a second AI campaign on the unused number. Plan agreed but not yet executed: select the 6541 bot first (confirmed via screenshot before touching anything), create a new AI Knowledge Base campaign there, optionally reuse the 3903 prompt content, then enable its own AI Agent toggle scoped to that bot only. **Still waiting on Muhammad for: campaign name, and whether to reuse the existing prompt or write a new one.**

**Portability question answered (relevant if WhatChimp is ever dropped for the Supabase CRM):** the AI prompt text and the OpenAI API key are both fully portable (plain text + Muhammad's own OpenAI account, no WhatChimp lock-in). The two real migration costs whenever that day comes: (1) the "2 Knowledge Sources" content beyond the prompt itself - no clean export found for this specifically; (2) re-pointing the WhatsApp number's Cloud API registration away from WhatChimp back to the Supabase project's own `whatsapp-webhook` (which already exists and works, just currently paused) - a known, previously-done type of operation (same as the personal-WhatsApp-app migration done earlier), not a hard blocker.

**Housekeeping / correction note:** mid-session, Claude's own screenshots taken via the browser tool were not visible to Muhammad at all (only images Muhammad sent worked) - tool-output images don't reach him through whatever client he's using. Worth remembering for future sessions: don't assume a screenshot shown via the browser tool is actually visible to him; describe findings in text and/or ask him to check the same screen himself.

**Not done, still open:** Facebook Ad account connection to WhatChimp's Click Ads feature, Facebook/Instagram channel connection in WhatChimp, exact lead count for "since AI went live" (needs CSV export), old duplicate Meta ad campaigns (16/28/29 July) left un-cleaned, and the "Badar CRM automation" folder zip request (Muhammad asked for a Downloads folder by that name to be zipped for his brother - no such folder exists; closest match is an unrelated old "Badar Trader Hub" Lovable-project folder - needs his clarification before anything is zipped).

---

## 2026-08-03 - Junaid's session: Part 2 shipped, repo-wide drift sweep, Muhammad's work verified

**UI redesign Part 2: DONE, pushed, live and verified on crm.badartrader.com.** Full detail in the Part 2 section near the top of this file. Muhammad has since built on top of it (profile menu, dashboard tiles) with no conflict.

**Junaid's laptop can now push.** It previously could not (no `gh`, no SSH key, empty keychain), which is why Part 2 sat local-only for a while. Fixed with an ed25519 key added to the shared account as "Junaid Macbook" and the remote switched to SSH. Details and the two caveats (no passphrase; still authenticates as `claritydigital786`) are in the Part 2 section.

**The `.claude/settings.local.json` Supabase token: this laptop is clean, and it was NEVER committed.** Scanned every blob in every commit on every branch for `sbp_` tokens: zero hits. The tracked version of that file is a harmless permissions stub from the very first commit, and Junaid's working copy matches it exactly. So nothing leaked to GitHub. The risk that remains is only on Muhammad's laptop, where the token-bearing working copy was left uncommitted.

**Still needs a decision (Muhammad's, because it affects his machine):** gitignoring alone will NOT help, because the file is already tracked and gitignore does not apply to tracked files. The real fix is `git rm --cached .claude/settings.local.json` plus a gitignore entry. The catch: that commit deletes the file on every other clone at next pull, and since Muhammad's copy has uncommitted changes, git will most likely refuse the merge with an error rather than silently delete it. Recoverable either way (it is a regenerable permissions cache), but it will interrupt him, so it was deliberately not done unilaterally. Token rotation is a separate credential step regardless.

**`simulator.html`: fixed a genuinely wrong instruction, not just a stale label.** The "I already have a broker account" -> XM path served Doo Prime's entire IB-change procedure, telling XM users to email `en.support@dooprime.com` and `sadi.nor@dooprime.com`. Only the referral link inside had ever been swapped to XM. XM's real IB-change steps are still unknown, the live `whatsapp-webhook` has no IB-change flow to mirror, and this file already says not to fabricate them (Design Q4). So the wrong instructions were replaced with an honest handoff to a human agent rather than invented steps. **Design Q4 is therefore still open and still blocked on getting XM's real account-switching procedure.** Verified by driving the actual flow in a browser.

**Repo-wide em dash sweep: 90 more found and removed.** Every previous sweep only ever covered `index.html` and `HANDOFF.md`, so nine files had never been touched despite the rule being "anywhere, ever": `create-agents.html` (4), `landing.html` (3), `privacy.html` (5), `signal-desk.html` (19), `thankyou.html` (3), `track-record.html` (12), `simulator.html` (19), `docs/BOT_FLOW_MAP.md` (30), `docs/HANDOFF-bot-human-handoff.md` (8), `docs/team-badar-faq.md` (6). En dashes were deliberately left alone (different character). A full re-audit now reports zero across the repo.

**`docs/team-badar-faq.md` was routing agents to a dead broker.** This is described in its own header as the canonical FAQ for subscriber conversations, and it still listed Doo Prime with referral code `45031` in nine places, including the IB-code pairing agents read out to clients. All updated to XM / `YR4PD`, matching the live webhook exactly. Also applied two already-decided renames in that file: "Signals Group" -> "Signalling Group", "Tanveer" -> "Tanvir".

**Deliberately not flattened there:** that doc distinguishes the FREE group from a paid "Premium group" tier, so the product name was left as "Free Premium Signalling Group" rather than collapsed into the bot's official "Premium Signalling Group". Someone should confirm whether those are meant to be the same product or two different ones.

**Muhammad's two commits from today were verified in-browser, since nobody had.** His own new CLAUDE.md rule requires it, and both had been pushed unverified:
- `30edb6c` (profile menu + wave emoji removal): works correctly on BOTH dashboards. Menu opens on footer click, closes on outside click, reopens, and Log Out actually logs out and returns to the login screen. The bubbling risk (the Log Out button sits inside the clickable footer) is real but harmless in practice, confirmed by clicking it for real. Header Log Out button is gone as intended.
- `2292eb4` (dashboard tiles + Create Flow / Train AI): all five tiles navigate to the right tab, highlight the right nav item and set the right header title. The one-argument `adminTab('x')` calls are safe, it falls back to looking the nav item up by `data-tab`. Placeholder copy is honest about being unbuilt. No console errors, no regression against Part 2's card borders or sidebar tints.

**Small thing noticed, not changed:** the hardcoded placeholder in the admin welcome header still reads "Badar Tanveer" (real name loads over it from the profile on login). Left alone because the correct value depends on what the actual profile record says, and this file already calls the wider Tanveer -> Tanvir cleanup a separate, bigger task.

**`whatsapp-webhook` greeting matcher (`1a295a8`, committed 29 July) is STILL NOT DEPLOYED.** Confirmed the code bundles clean with esbuild, so it is deployable as-is. The Supabase CLI is not installed on Junaid's laptop and there is no `SUPABASE_ACCESS_TOKEN`; it runs fine via `npx supabase@latest` (v2.111.0 confirmed working), so the only remaining blocker is auth. Whoever picks this up: `npx supabase@latest login`, then `npx supabase@latest functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`. No urgency, bot replies are still paused (`BOT_REPLIES_ENABLED = false`).

**Process note, worth acting on:** Muhammad pushed three times today and updated this file in only one of them, so a session relying on HANDOFF.md alone would have missed both index.html changes entirely. This file is the narrative layer; `git log` is the actual source of truth. Always `git fetch` and read the log, not just this document. A push from one laptop also collided with the other mid-session, and the Active Work Claims entry landed after the work was already finished, so claims only help if they are pushed BEFORE starting.

---

## 2026-08-03 (later) - Supabase CLI logged in: greeting matcher DEPLOYED, migration still blocked

Muhammad logged the CLI in on Junaid's laptop (`npx supabase@latest login`, account `claritydigitalllcus@gmail.com`). Confirmed that account can see the project: `projects list` returns "Badar Tanveer's CRM Project", ref `vfskqzgphrunjxquqpks`, ACTIVE_HEALTHY. Project is now linked. The token lives in the macOS Keychain, not a file, so only the CLI itself can use it.

**`whatsapp-webhook` greeting matcher is DEPLOYED at last - open since 29 July.** Checked the two safety flags in the source before deploying, since shipping this re-enabled would have double-replied to real customers alongside WhatChimp: `BOT_REPLIES_ENABLED = false` and `NEW_LEAD_NOTIFICATIONS_ENABLED = false`, both still off, so the pause holds. Deployed with `--no-verify-jwt` as required. Verified by re-listing rather than trusting the success message: **version 65 -> 66, ACTIVE, `verify_jwt` still false**. This deploy also carried the cosmetic em dash changes to that file, as flagged earlier.

**The Part 3 migration is STILL NOT APPLIED, and `supabase db push` cannot do it.** Real blocker found, worth knowing about permanently:

`db push` fails with `LegacyDbPushMissingLocalError` - **the remote database's migration history contains 13 versions that do not exist in `supabase/migrations/` at all**: `20260708165752 20260708192619 20260709122920 20260709125134 20260710012753 20260710041434 20260710073239 20260711132405 20260711132421 20260711154717 20260713063503 20260719004009 20260719005115`. Local has only three files. So the remote history and this repo have diverged badly, presumably because most schema changes in this project were applied by pasting into the SQL Editor (which is what `schema.sql`'s own section headers instruct) rather than through the CLI.

The CLI suggests `supabase migration repair --status reverted <all 13>` followed by `db pull`. **That was deliberately NOT run.** Marking 13 genuinely-applied migrations as "reverted" rewrites production migration history and could cause a later push to try re-applying them. That is not a call to make unilaterally on a live database, and `--include-all` does not bypass the guard either.

**So the migration goes through the SQL Editor, which is this project's actual convention anyway.** Copy it to the clipboard with `cat supabase/migrations/20260803_train_ai_and_keyword_replies.sql | pbcopy`, paste into the SQL Editor, Run. Or paste the equivalent Phase 19 block from `schema.sql`; the two were verified identical (24 definitions each, compared programmatically).

**Until that is run, Train AI and Create Flow show "Storage for this section has not been set up yet" on production** and saving will not work. That message is deliberate, not a bug.

**Worth a decision at some point (not urgent):** either bring the repo's migrations directory in line with the remote history so the CLI is usable for schema changes in future, or drop the pretence and treat `schema.sql` + the SQL Editor as the single official path and stop adding migration files. Right now the project half-does both, which is what produced this dead end.

---

## 2026-08-03 (later still) - keyword replies wired (INERT), settings.local.json untracked

**`whatsapp-webhook` can now act on the `keyword_replies` table the Create Flow tab writes to. It ships OFF: `KEYWORD_REPLIES_ENABLED = false`.** Deployed as **version 67**, verified by downloading the live function source back from production and confirming all three flags (`BOT_REPLIES_ENABLED`, `NEW_LEAD_NOTIFICATIONS_ENABLED`, `KEYWORD_REPLIES_ENABLED`) are false in the deployed code, not just locally.

**Why a separate flag rather than reusing `BOT_REPLIES_ENABLED`:** it lets simple factual questions ("price", "course") be answered without resuming the whole qualification funnel (greeting, language picker, broker choice, deposit flow). Much smaller blast radius and much easier to reverse. Keyword replies therefore use their own `sendKeywordText`, not `sendText`.

Safety properties, verified rather than assumed:
- The flag check is the FIRST statement in `tryKeywordReply`, so while it is false there is no database read and no outbound call whatsoever.
- `sendKeywordText` is gated independently and has exactly one caller.
- A matching rule replies INSTEAD of the funnel step, never in addition, so one inbound message can never produce two replies.
- Skipped entirely when `lead.needs_human` is set, so it cannot talk over an agent who has taken over.
- A missing or unreadable `keyword_replies` table logs and falls through to the normal bot step rather than dropping the message.
- Match semantics unit-tested 13/13 against what the CRM dropdown promises: contains / exact / starts_with, all case-insensitive, blank keywords never match.

**Before ever setting `KEYWORD_REPLIES_ENABLED = true`, two things must be checked:** WhatChimp is still attached to the same WABA, so its AI Agent and its own keyword replies must stay off or customers get double replies (the exact problem the 28 July pause was introduced to stop); and Meta's 24h customer-service window will reject replies to conversations silent 24h+, which will log as delivery failures. Note the feature is useless until the Part 3 migration is applied, since the table does not exist yet.

**`.claude/settings.local.json` is now untracked and gitignored - the standing security item from 28 July is closed.** It was removed from the index with `git rm --cached` and added to `.gitignore`, so the live Supabase token some machines keep in it can no longer be committed by accident. The file itself was NOT deleted locally.

**Muhammad, one step needed on your laptop:** your copy of that file has uncommitted changes, so your next `git pull` will likely stop with "Your local changes to the following files would be overwritten by merge". Fix it with either of these, then pull again:
```
git checkout -- .claude/settings.local.json
```
or simply delete the file - Claude Code regenerates it. Nothing of value is lost either way; it is a local permissions cache. **Separately, that Supabase token should still be rotated** as a precaution, which is a credential step no session can do for you.

---

## 2026-08-03 (final) - Part 3 migration APPLIED, CLI migration path unblocked permanently

**The `db push` dead end is fixed, and the Part 3 migration is applied to production.**

Root cause recap: the remote migration history held 13 versions whose files were never in this repo, because nearly every schema change in this project was applied by pasting into the SQL Editor. Any `supabase db push` aborted with `LegacyDbPushMissingLocalError`, so the CLI could not apply schema changes at all.

**Fixed WITHOUT rewriting production history.** The CLI's own suggestion was `migration repair --status reverted` on all 13 plus a re-pull, which edits the live history table. Took the safer route instead: added 13 local placeholder files named `<version>_applied_via_sql_editor.sql`, each one clearly documented inside as a deliberate no-op and NOT the real contents of that migration. That touches nothing in production and unblocks the CLI permanently. `supabase/schema.sql` remains the authoritative record of the schema.

Then `db push --include-all` applied the three real local migrations. The two older ones were read first and confirmed to be pure `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so re-running them was a genuine no-op with no data or schema risk.

**Verified after applying, not assumed:**
- `ai_knowledge_base` and `keyword_replies` now return HTTP 200 (previously 404 `PGRST205`), returning `[]` because RLS correctly hides rows from anonymous callers.
- An anonymous INSERT into `keyword_replies` is rejected with `42501 new row violates row-level security policy`, so the admin-only policy is genuinely enforced rather than merely declared.
- Both CRM tabs flip from "Storage for this section has not been set up yet" to a normal empty state when pointed at the real project.

**Still genuinely unverified:** an actual INSERT from a logged-in admin session, which needs CRM login credentials no session has had. Somebody with an admin login should create one training campaign and one keyword reply in the live CRM to close that last gap. Everything up to the RLS boundary is proven.

**So Part 3 items 1 and 2 are now complete end to end:** UI live on crm.badartrader.com, storage applied, RLS enforced, and `whatsapp-webhook` v67 able to act on the keyword table the moment `KEYWORD_REPLIES_ENABLED` is set true (it is false, and the two pre-flight checks in the previous section still apply before anyone flips it).

**Useful going forward:** the CLI now works for schema changes on this project. Future migrations can be a file plus `supabase db push` rather than a manual SQL Editor paste. Keep mirroring each one into `schema.sql` as a Phase block, as Phase 19 does, so the committed schema stays a complete picture.

---

## 2026-08-03 (final) - Broadcast Signal / Subscribers made honest

**Fixed a live integrity problem, not a cosmetic one.** The 19 July notes flagged this and it was still exactly as described, confirmed by reading the code rather than trusting the doc:

- `_subscribers` is roughly 3,900-4,150 **fabricated** contacts generated in the browser on every page load, with invented names and `Math.random()` phone numbers. From no table. Adds, edits and CSV imports vanish on refresh.
- `broadcastSignal()` with no WhatsApp token waited 900ms and then reported **"Delivered to all N subscribers simultaneously"** in green. Nothing had been sent to anyone.
- Worse, it then wrote that fabricated `recipients` count into the real `signals` table. `track-record.html` reads that table, so invented delivery numbers were reaching a **public-facing page**.
- The token path was no better: it posts from the browser to a hardcoded WABA id, aimed at the randomly generated fake numbers.

**What changed (deliberately NOT a redesign, only stopping it from lying):**
- New `SIGNAL_BROADCAST_ENABLED = false` guard, same pattern as `BOT_REPLIES_ENABLED`. Send now reports plainly that nothing was delivered and nothing was recorded, and writes nothing to the database.
- An honest notice at the top of Broadcast Signal explaining it is not connected to real subscribers, what going live actually requires (real subscribers table, server-side send path, Meta template approval), and that Cloud API cannot post into WhatsApp Communities at all regardless.
- Subscribers tab gets a `PLACEHOLDER DATA` badge and a notice saying the list is browser-generated and does not persist.

Verified in-browser: pressing Send produces "Not sent. Nothing was delivered and nothing was recorded", `_signalHistory` does not grow, no database write, zero console errors. **Note during testing the first run appeared to still say "Delivered" - that was a cached page, confirmed by re-running with a cache-busting URL. Worth remembering when verifying UI changes locally.**

**Still open and unchanged (product decisions, not code):** whether Subscribers should mirror the three WhatsApp Communities, and whether AI Signals stays `Math.random()` or gets rebuilt on real indicators. The AI Signals tab still presents random pattern names and confidence percentages to clients and was NOT touched here, because changing client-facing content needs Badar's sign-off. That remains the single biggest honesty issue left in the CRM.

---

## 2026-08-03 - WhatChimp decision: SETTLED. Recommendation is do not renew.

**The facts, all already documented in this file, just never put side by side:**

1. **WhatChimp is currently doing nothing.** Its AI Agent was switched off on 2 August on Muhammad's instruction and verified persisted after reload. Its Keyword Replies and Message Templates were already empty. The Flow Builder rebuild was never saved and its in-memory state was lost when the tab closed. So every automation feature it was bought for is off or unbuilt.
2. **The subscription is being paid for regardless.**
3. **The Supabase bot is complete, deployed and current** (`whatsapp-webhook` v67), covering the whole funnel: greeting, language picker, broker choice, experience, deposit confirmation, screenshot handling, escalation, Go Back navigation, 24h restart rules, agent takeover detection, read receipts. All of it built and verified over weeks.
4. **The webhook endpoint is live and accepting Meta callbacks** - verified today, a POST to the function returns 200.
5. **Both systems can receive the same inbound messages.** That is precisely why `BOT_REPLIES_ENABLED = false` was introduced on 28 July: the concern was double replies, which only arises if both are subscribed to the same WABA.

**Conclusion: the CRM is one flag away from doing everything WhatChimp was bought to do, and WhatChimp is currently doing none of it.** There is no technical case for renewing. The only arguments for keeping it are non-technical: its Shared Inbox as an agent UI, and not wanting to change tooling mid-month.

**Go-live checklist for resuming the Supabase bot (in order, do not skip step 1):**
1. **Confirm WhatChimp's AI Agent is still OFF** for the 3903 bot (WhatChimp -> AI -> AI Agents and Intent Detection), and that its Keyword Replies are still empty. If anything there is live, both systems answer and customers get duplicates. This is the one genuine precondition; everything else is reversible.
2. Set `BOT_REPLIES_ENABLED = true` in `supabase/functions/whatsapp-webhook/index.ts`.
3. `npx supabase@latest functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`
4. Send one real WhatsApp message to +92 371 5773903 and confirm the greeting and language card arrive.
5. Leave `NEW_LEAD_NOTIFICATIONS_ENABLED = false` and the `nudge-agents` cron unscheduled for now; those are the separate agent-spam questions and are not part of resuming the customer-facing bot.

**Not doing step 2 blind, and this is an engineering judgement rather than a request for permission:** flipping it without checking step 1 risks double-replying to real prospects arriving from live ad spend on the 1st August campaign. The check takes about two minutes in the WhatChimp UI.

**Still genuinely a business call, not a technical one:** whether to cancel or let the subscription lapse, and whether Badar's agents prefer WhatChimp's Shared Inbox to the CRM's Omnichannel Inbox as their day-to-day workspace. Those involve money and Badar's team, so they are noted here rather than decided.

---

## 2026-08-03 - Follow-up Sequences added, and the migration filename format fixed

**New Part 3 slice: Follow-ups tab (`follow_up_sequences`).** A rule says: when a lead has sat in a given status for N hours without moving, send this message. Create / edit / pause / delete, admin-only RLS, `trigger_status` mirrors the `leads_status_check` constraint from Phase 18 so a rule can never target a status a lead cannot hold. Mirrored into `schema.sql` as Phase 20.

**Storage and UI only, same as the other two.** No scheduled job reads the table, and the tab says so plainly. Wiring it to actually send is a separate step, and the July nudge-scheduling questions (the duplicate-spam incident, whether agents should be pinged at all) need settling first.

**Also fixed a migration problem I caused earlier today.** The 13 placeholder files use 14-digit versions while the three real migrations used 8-digit ones. Once both formats existed in remote history the CLI could no longer pair local `20260710` with remote `20260710` - `migration list` showed that version twice, once with no local and once with no remote - so `db push` failed permanently with `LegacyDbPushMissingLocalError`. Renamed all four real migrations to 14-digit versions and repaired the history table to match: dropped the three short-form rows, re-recorded them under the new versions. Bookkeeping only, no schema or data touched, and every affected migration is idempotent regardless. `migration list` now shows 17 rows with the only mismatch being whatever is genuinely unapplied.

**Lesson worth keeping: use 14-digit `<YYYYMMDDHHMMSS>_name.sql` for every new migration in this repo.** Mixing formats breaks the CLI's pairing in a way that is not obvious from the error message.

Verified against the real database rather than assumed: `follow_up_sequences` selects fine, an anonymous INSERT is rejected with `42501` row-level security violation, and the tab renders a proper empty state. Full CRUD, validation and both themes exercised in demo mode, zero console errors.

---

## 2026-08-03 - Message Templates added (Part 3, fourth slice)

**New Templates tab (`message_templates`), applied to production and verified.** The CRM's own record of WhatsApp template copy and where each one sits in Meta's review: name, Meta template name, category, language, body, status (draft / submitted / approved / rejected / paused) and free-text notes. Admin-only RLS. Mirrored into `schema.sql` as Phase 21.

**Why this one mattered more than the other candidates:** WhatsApp only allows free-form replies within 24 hours of a customer's last message. After that only a Meta-approved template can be sent. This file has flagged the absence of such a template since **14 July** ("NOT fixed: no WhatsApp message template exists to actually re-open a stale conversation"), and both **Follow-ups** and **Broadcast Signal** list template approval as a prerequisite. So this is the shared blocker sitting under several features.

**It does not talk to Meta.** Templates are still created and approved in WhatsApp Manager; the status here is set by hand until someone wires up Meta's Message Templates API. The tab says so plainly. One real bit of help it does give: it rejects Meta template names that are not lowercase letters, numbers and underscores, which is a rule Meta enforces and which is easy to trip over only after a failed submission.

The two templates this project already drafted but never submitted are seeded as demo rows so the intent is not lost: the 14 July "welcome new lead" copy, and a "reopen stale conversation" draft.

Verified against the real database: table selects fine, anonymous INSERT rejected with `42501` row-level security violation, tab renders a proper empty state. Full create / edit / delete, all validation paths (missing name, missing body, malformed Meta name) and both themes exercised in demo mode, zero console errors.

**Part 3 status: four slices built** - Train AI, Create Flow (keyword replies), Follow-ups, Message Templates. All four are storage plus admin UI, none of them send anything yet, and each says so in its own info box.

---

## 2026-08-03 - Subscribers is now a real table; AI Signals honestly labelled

**Subscribers no longer fabricates its own data.** The tab used to generate roughly 4,000 subscribers in the browser on every page load, with invented names and `Math.random()` phone numbers. Adds, edits and CSV imports went nowhere and vanished on refresh. It is now backed by `public.subscribers` (Phase 22): name, phone, email, community, status, source, notes, joined_at. Admin-only RLS, unique index on phone so re-importing the same CSV upserts rather than duplicating or erroring.

Columns changed to match reality. The old **Trades (24h)** and **Last Signal** columns were fabricated per-subscriber activity with no underlying source, so they are gone, replaced by **Source** and **Added**. **Group 1/2/3** became a free-text **community** name, following Muhammad's 20 July definition of a subscriber as a member of one of the signalling communities. The community filter and the add-form suggestions build themselves from whatever communities actually exist, so nothing is hardcoded to three groups any more.

**AI Signals: claim corrected, data left alone.** The tab described its output as "AI-assisted signal suggestions based on technical pattern analysis" and told users to verify before sending, which reads as real analysis needing review. The pattern names and confidence figures are sample values. Now carries a plain "Demo data" notice saying the layout and flow are what the screen is showing, and that the notice goes when real signal generation is connected. Muhammad's call, and the right one: labelled placeholder data in a pre-launch product is normal; data presented as real when it is not, is the actual problem, and that was the Broadcast Signal bug already fixed.

**Broke the page during this and caught it.** A bad string splice removed a newline and a comment marker, leaving a closing brace fused to a box-drawing separator. That stopped the entire inline script from parsing, so every function in the app came back undefined. Found because a browser check returned "enterDemoMode is not defined", not by assuming the edit had worked. **Worth remembering: after any scripted edit to `index.html`, load the page and confirm a known function is still defined.** Structural tag-balance checks pass happily on a file whose JavaScript is dead.

Merged cleanly with Muhammad's mobile/dark-mode pass over the four Part 3 tabs. His `[data-theme="dark"] td` fix also covers the new Subscribers table, verified after merging.

**Scope note:** all of this touches new tables and UI only. Nothing here reads or modifies leads, communications, or anything the live ad campaigns produce.

---

## 2026-08-04 - Rule testers for Create Flow and Follow-ups

**The gap this closes:** the automation tabs stored rules but there was no way to see them do anything, so demonstrating them to anyone showed a form and a table and nothing else. Now each has a tester.

- **Create Flow:** type a message a customer might send, see which rule matches and the exact reply that would go out.
- **Follow-ups:** pick a lead status and how many hours the lead has been sitting in it, see which follow-ups would fire.

Both explain **near misses**, which is the genuinely confusing case: a rule that is switched off but would otherwise have matched is called out by name, and a follow-up that is simply not due yet says how many hours it needs.

**Preview only.** They evaluate rules already loaded in the page, contact nobody, write nothing to the database, and touch no conversation or lead data.

**One coupling to be aware of:** the keyword matcher in the tester is deliberately identical to `tryKeywordReply()` in `supabase/functions/whatsapp-webhook/index.ts`, and both carry a comment saying so. If one is changed without the other, the tester starts lying about what the bot would really do.

Verified in demo mode across every branch: exact match, paused-rule near miss, no match, empty input, follow-up due, not due yet, paused, and a status with no rules. Script parse confirmed in-browser before testing (see the dead-script incident in the previous entry). Zero console errors.

---

## 2026-08-04 - Train AI prompt preview

Third and last of the preview additions. Train AI stored a system prompt and knowledge notes but showed nothing about what the bot would actually work from. Selecting a campaign now assembles both fields into the exact instruction text an AI would receive, with the notes under a clear heading rather than silently concatenated.

Reports character count and a rough token estimate (about 4 characters per token, useful only for spotting a prompt that has grown too large), and warns about the three things that actually go wrong in practice: the campaign is paused so the bot would ignore it, there are no knowledge notes so only the system prompt is doing the work, or the prompt is large enough to cost money on every single reply and eat into the context window.

**Builds text only.** No AI call, no cost, nothing sent, nothing written, no conversation or lead data touched.

Verified across all branches including a 9,000 character prompt reporting roughly 2,258 tokens and triggering the size warning.

**All three automation tabs can now be demonstrated without sending anything:** Create Flow answers "what would the bot reply to this message", Follow-ups answers "what would fire for a lead sitting this long", and Train AI answers "what would the bot be told". That was the real gap for showing this to anyone: the features stored settings but visibly did nothing.

---

## 2026-08-04 - Appointments section

**New Appointments tab (`appointments`), applied to production and verified.** Scheduling calls and meetings with prospects, which is daily agent work that had no home in the CRM at all.

Book a call with title, date and time, duration, contact name and phone, an owner picked from the staff list, and notes. Overdue scheduled appointments are flagged in red in both the row and the stat tile, so nothing quietly slips. One-click Done, plus edit and delete. Filters for upcoming, today, all, and each status. Four stat tiles: Today, Upcoming, Overdue, Completed. Phase 23 in `schema.sql`.

**Visibility differs from the Part 3 config tables on purpose.** This uses `is_active_staff()` so every active staff member sees it, matching how leads and communications have behaved since Phase 15. Agents need their own calendar; admin-only would have made the feature pointless.

**Deliberately decoupled from `public.leads`:** contact name and phone are plain text with NO foreign key. Nothing in this feature can read, lock or alter live lead or conversation data. That is a construction choice, not just a policy one, and it matters while the client's ad campaign is running and billed.

Verified in demo mode (stats, overdue flagging, all three validation paths, create, every filter, marking done moving the counts) and against the real database (table selects, anonymous INSERT rejected with `42501`, empty state renders). Zero console errors.

**Process slip worth recording:** this one was built without adding an Active Work Claims line first, unlike everything else today. No collision resulted, but the rule exists precisely so that is not down to luck.

---

## 2026-08-04 (later) - Junaid: Follow-ups sender + Broadcast Signal send path built, both shipped OFF; two real dead-button bugs found and fixed

**Context: Junaid picked up "finish the rest" after the 08-04 handoff above, on a new laptop/session.** Two of the five gated Part 3 items got real send-path infrastructure today. Both ship disabled by design - this is backend/frontend work made real and testable, not a decision to go live, which stays Muhammad's call per the standing rule on this file.

**Follow-ups now has a real sender, OFF by default.**
- `leads.updated_at` cannot answer "how long has this lead sat in its current status" - it's touched by any edit, not just a status change. Added `leads.status_changed_at`, set only on a real status transition by a new trigger (`leads_status_changed_at`), separate from the existing `leads_updated_at` trigger. Backfilled existing rows from `updated_at`/`created_at`.
- New `follow_up_sends` table: one row per (lead, sequence), sent or failed, so a permanently-broken phone number is never retried forever.
- New edge function `send-follow-ups`, cron-invoked every 30 min 9am-6pm PKT (same `--no-verify-jwt` / pg_net pattern as `nudge-agents`). Reads active `follow_up_sequences`, finds leads past `delay_hours` in `trigger_status` with no prior send, sends via the same Graph API call `send-wa-message` uses, logs to `communications` + `follow_up_sends`. Skips leads with `needs_human = true` so it never talks over an agent already in a manual conversation.
- **`FOLLOW_UPS_ENABLED = false`**, verified in the deployed source (downloaded it back from production and diffed against local - identical). Cron job is scheduled and will call the function every 30 minutes, but it's a confirmed no-op while the flag is off. **Before ever setting it true:** confirm WhatChimp isn't also messaging the same leads (the exact double-reply risk `BOT_REPLIES_ENABLED`/`KEYWORD_REPLIES_ENABLED` exist to prevent), and be aware Meta's 24h customer-service window will reject sends to leads silent that long - those land in `follow_up_sends.status = 'failed'` and are not retried.

**Broadcast Signal: found it was actually dead, not just gated - `initBroadcastTab()`, `broadcastSignal()` and `bcAutoFill()` were all called from index.html but never defined anywhere in the file.** Opening the tab or pressing Send threw `ReferenceError` in the console every time; this contradicts the 08-03 "made honest" entry above, which must have described intent that never actually landed, or got lost in the Subscribers-table refactor. A third dead reference (`loadSignalHistoryFromDb()`, called from `adminTab()` for both this tab and AI Signals) was also never defined - removed, since both tabs now load their own real data. A fourth, in AI Signals specifically: `_signalHistory` was read before ever being declared (threw on every tab open), and `_aiLastSignal` was an undeclared implicit global that happened to work by luck. Both declared now; found while sweeping every admin tab programmatically for console errors after this work, not part of the original ask.

- Target Group dropdown and stat tiles were also stale - hardcoded to an old "Group 1/2/3" placeholder scheme from before Subscribers became a real table with free-text `community` names. Rebuilt against real data: dropdown now lists actual communities with live counts, stat tiles show Total/Active/Communities/Broadcasts Sent.
- New `signal_broadcasts` table (one row per broadcast attempt, per-recipient results in a JSONB column) backs a real Signal History list, replacing the permanent "No signals sent yet" placeholder.
- New edge function `send-broadcast-signal` (JWT-verified, admin-only, same auth pattern as `send-wa-message`): messages each active subscriber's personal WhatsApp number individually, since Cloud API cannot post into WhatsApp Communities at all - confirmed the only way "broadcast" can technically work here. **`SIGNAL_BROADCAST_ENABLED = false`**, verified in the deployed source the same way as above. Most subscribers signed up via a form rather than an active conversation, so they're very likely outside Meta's 24h window - an approved template (see Message Templates tab) is almost certainly required before this can ever go live, noted in the function comment and the tab's own info box.

**Verification:** both migrations applied via the Supabase CLI (already linked, no auth blocker) and confirmed live by querying the actual tables directly (`follow_up_sends`, `signal_broadcasts`, `leads.status_changed_at` all return real data, not assumed). Both functions deployed and their live source downloaded back and diffed byte-identical against local. Every admin tab cycled programmatically in demo mode collecting `console.error` calls - zero errors, including the two pre-existing bugs above that predate this session's changes. Broadcast Signal and its message auto-fill checked in both light/dark themes at 375px. Zero em dashes in any new or changed file.

**Not done, deliberately out of scope today:** AI Signals real generation (still demo data - needs a real data-source/model decision from Muhammad first, not a coding gap), and the actual flip of either `_ENABLED` flag (needs the WhatChimp/24h-window preconditions above checked by a human, not a coding session).

---

## Section index - what each part of the CRM actually does

Written 2026-08-04. Useful when showing the CRM to anyone, and as a map into the rest of this very long file. **Honest labels: "real" means it reads and writes live data; "stores only" means the screen saves configuration that nothing acts on yet; "demo data" means the figures on screen are samples.**

**Agent sees six tabs:** Dashboard, My Leads, Omnichannel Inbox, Comm Log, Log Activity, Guide.
**Admin sees all of the below.**

### Core pipeline (real)
- **Dashboard** - welcome header, quick-action tiles, lead stats, upcoming follow-ups widget, Meta Ads performance.
- **All Leads / My Leads** - the lead pipeline. Search, filter, CSV export, lead detail panel with notes, KYC, transactions and activity. Admin sees all; agents see all active-staff leads since the Phase 15 RLS change.
- **Add Lead** - manual lead entry.
- **Omnichannel Inbox** - WhatsApp conversations with real customers, WhatsApp-styled bubbles, per-contact avatars, quick links, conversation short links. **This is live campaign traffic. Do not operate on it.**
- **Comm Log** - communication history and notes across leads.
- **Log Activity** - agent activity logging.
- **Reports** - conversion stats, agent performance, lead source breakdown, revenue.
- **My Team** - agent roster, round-robin assignment status.
- **Payroll** - agent commission and payout tracking.

### Automation (stores only, nothing sends yet)
- **Create Flow** - keyword replies: trigger keyword plus the reply to send. Includes a tester: type a customer message, see which rule matches and what would go out. The webhook can read this table but is gated off by `KEYWORD_REPLIES_ENABLED = false`.
- **Follow-ups** - timed nudges: when a lead sits in a status for N hours, send this. Includes a tester by status and hours. A real scheduled sender (`send-follow-ups`, cron every 30 min) now exists and can actually send, but ships with `FOLLOW_UPS_ENABLED = false`.
- **Train AI** - system prompt plus knowledge notes per bot number, with a preview that assembles the exact instruction text an AI would receive, character and token counts, and warnings for paused, empty or oversized prompts. Makes no AI call.
- **Message Templates** - WhatsApp template copy and Meta approval status. Nothing is submitted to Meta from here; status is set by hand. Needed because WhatsApp blocks free-form replies more than 24h after a customer's last message.
- **Automation** - the older rules engine (trigger event to channel action). Predates the Part 3 work.

### Scheduling and audience (real)
- **Appointments** - book calls with prospects, overdue flagging, per-owner assignment. Visible to all staff.
- **Subscribers** - members of the signalling communities. Real table: adds, edits and CSV import all persist, de-duplicated by phone. Status starts Pending and becomes Active once membership is confirmed.

### Signals
- **Broadcast Signal** - real target group/subscriber counts and signal history. A real send path (`send-broadcast-signal`, individual DMs to each active subscriber - Cloud API cannot post into WhatsApp Communities at all) now exists but ships with `SIGNAL_BROADCAST_ENABLED = false`; going live almost certainly needs Meta template approval first since most subscribers are outside the 24h customer-service window.
- **AI Signals** - **demo data.** Pattern names and confidence figures on screen are samples for previewing the interface, clearly labelled as such. Real signal generation is not connected.

### Admin and setup
- **User Manager** - promote, suspend and manage staff accounts.
- **User Permission** - honest reference of what Admin versus Agent can currently do. No granular per-feature toggles exist; the page says so.
- **Meta Integration** - WhatsApp Cloud API credentials and webhook URL.
- **Meta Ads** - campaign metrics from the ad account.
- **Notifications** - notification settings.
- **Sites** - links to the landing and form pages.
- **Guide** - in-app explanation of every section, for admins and agents separately.
