# Badar Trader CRM - Handoff

_Last updated: 2026-07-14 (mid-session, cut short by usage limit - written fast, verify
claims before trusting them further). For a fresh Claude Code session with zero memory of
prior conversations._

**Two parallel tracks are active - say the right phrase to resume the right one:**
- **"continue the Supabase CRM coding"** → resume the badar-trader-crm codebase (index.html, Supabase edge functions, schema, deploys).
- **"continue the WhatChimp bot build"** → resume the WhatChimp Flow Builder rebuild + the related Meta Ads Manager work (see the last section of this file).

**"continue 2" (the AI Agent Roadmap build) MOVED OUT of this repo on 2026-08-08 - it no longer resumes from here.** It lived at `ai-agents/` from 2026-08-06 (all four roadmap types - conversational, RAG, tool-using action agent, multi-agent orchestrator - were built and self-tested there, 32 tests passing, offline stub only, no real API key ever run). Muhammad then clarified he does not want this scoped to the CRM at all: "I'm not making it only for the CRM... The agents will help me in executing my day-to-day tasks and much more," specifically **his digital marketing business**. Since it had outgrown being a CRM subfolder, the whole thing (`ai-agents/` plus `docs/ai-agent-roadmap.md`) was extracted into its own standalone project: **`/Users/muhammad/AI-Agent-Creation`** (a fresh local git repo, not yet on GitHub, so it does not currently sync across the three laptops the way this repo does - if Junaid or Izza need to pick it up, that needs a deliberate decision first, most likely a GitHub remote). Full build history, the original roadmap doc, and the carried-forward safety rule (no tool there reaches a real ad account, WhatsApp send, or other live system without an explicit scoped decision - same principle as this repo's own rule below) now live in that project's own `CLAUDE.md` and `README.md`, not here. If anyone says "continue 2" in a `badar-trader-crm` session going forward, point them to the new location rather than trying to resume it here - nothing AI-agent-related should be rebuilt in this repo.

---

## 2026-08-07 (late) - Account switch handoff (weekly limit approaching on this account)

Muhammad is moving to another rotation account since this one's weekly usage limit is close. Full state as of right now, so the next session picks up cold with nothing lost:

**Three live deploys tonight, all from Muhammad's laptop with him present, all verified byte-identical to committed source - but NONE tested against a real message yet, see the blocker below:**
1. `send-wa-message` - the bot-takeover-flag silent-failure fix (see the live-only-code-audit entry above) plus the attachment-sending code, both now live. Template-sending (Junaid's newest feature) is deliberately one commit behind - can't send anything until Meta approves a template, so no urgency in catching it up.
2. `whatsapp-webhook` v73 - delivery-tick recording, now live end to end (migration + on-screen rendering + this write).
3. `whatsapp-webhook` v74 - inbound media storage (voice notes/PDFs/video actually downloaded and playable, not just labelled), with a 20MB size guard reviewed line by line before deploying, not just skimmed.

**The one thing that actually blocked tonight, unresolved when this session ended:** trying to real-device-test the above led to discovering nobody currently knows for certain which phone number's inbound traffic reaches OUR webhook vs WhatChimp's. Muhammad sent a test message to 3903, then said that number is live on WhatChimp right now. 6541 was the fallback candidate, but our own docs already said it was never attached, blocked on a WhatChimp double-subscription issue - Muhammad then said that got resolved a day or two ago but wasn't fully certain of the date. **A screenshot of Meta Business Suite confirmed both numbers exist and are "Connected" to the same WABA, but that page doesn't show webhook routing.** The actual answer lives in Meta's **App** Dashboard (developers.facebook.com, not business.facebook.com) → WhatsApp → **Configuration** → Webhook section - not checked yet. See REMAINING_TODOS.md's new unresolved item for full detail. **Until this is checked, treat tonight's three deploys as syntactically verified but functionally unproven** - don't tell Muhammad they're "confirmed working," only that they're live and byte-identical to what was reviewed.

**UPDATE 2026-08-08 - real test settles part of this, and it's bad news for the "6541 is ours" assumption.** Muhammad said 6541 is dedicated to the CRM and 3903 is WhatChimp's (recorded as a hard rule: never touch 3903). He then sent "Hello" + a voice note to 6541 from his personal phone (0632). **6541 auto-replied "We're seeing an API key error. We've forwarded your query to the concerned department..." - which is NOT our bot copy and cannot be us (bot replies gated off), so WhatChimp (or another AI agent) is STILL live and answering on 6541.** So the WhatChimp double-subscription on 6541 is NOT resolved, and "6541 is cleanly ours" is Muhammad's intent, not current reality. Do NOT enable `BOT_REPLIES_ENABLED` on 6541 (double-reply to real customers). Still open: whether our webhook ALSO receives 6541 (CRM inbox check for the 0632 conversation was requested; Meta App Dashboard webhook config is the definitive check). Also surfaced to Muhammad: WhatChimp's AI agent is erroring on an API key while answering real customers on 6541 - his to fix in WhatChimp, not Claude's. Full detail in REMAINING_TODOS.md.

**People, current state:**
- **Izza**: fully onboarded (git, Claude Code, push access all working). Has Box 3 restructure assigned to her (reassigned from Junaid - see that entry further down), hasn't started yet as of this handoff.
- **Junaid**: highly active tonight on his own initiative - shipped the demoMode-branch sweep, the live-only code audit (catching my own regression), send-template-from-inbox, mark-conversation-unread, and in-app notifications (migration for that last one still needs applying, see REMAINING_TODOS). Never touched Box 3 despite it being assigned to him first.
- **Backup script** (`backup-automation/`): built, tested against a mock server, done. Waiting on Muhammad to upload it to Hostinger and set up the cron job - his step, not blocked on anything from this side.

**Standing rule that mattered a lot tonight, worth restating for whoever picks this up:** Claude sessions cannot open Meta's or WhatChimp's dashboards even to just look - confirmed multiple times tonight when this session had to ask Muhammad for a screenshot rather than checking live routing itself. This will come up again for the unresolved webhook-routing question above.

---

## 2026-08-07 - Izza's first check, delivery-ticks B3/B4 status confirmed

Izza's first real look at the codebase (screenshot-guided from Muhammad's laptop while her push access was still being set up) - checked the state of the delivery-ticks item that's been sitting open in REMAINING_TODOS.md: **live migration column - already applied (from Muhammad's laptop, 2026-08-06); on-screen tick rendering - committed and verified; the webhook write that actually records each status callback - written and committed, but the deployed `whatsapp-webhook` is still v70 and does not contain it.** Correctly concluded the only remaining piece is one deploy, and correctly declined to attempt it herself - her laptop has neither `supabase` nor `deno` installed, and this is the live bot webhook real customers hit, which per standing rule is Muhammad's-laptop-only, with him present.

**That deploy is now DONE (2026-08-07, same day, Muhammad's laptop, him present)** - see REMAINING_TODOS.md's delivery-ticks line for the full detail. `whatsapp-webhook` is now v73, verified byte-identical to committed source. Delivery ticks are live end to end.

---

## 2026-08-07 - Conversations QA pass concluded (Tasks #35-38 from the prior session)

Muhammad said "conclude whatever is remaining, and then move forward" - this closes out the four in-progress/pending Conversations QA tasks left from an earlier session, all verified in demo mode on Muhammad's laptop:

- **Admin view** - filters (New/Warm/Hot/Unread/Closed/All), search + empty state, opening a conversation, sending a message, the assign-agent dropdown, the forward picker in both "to a conversation" and "to a teammate" modes (verified customer mode still sends, team mode writes zero customer-send calls), delivery ticks, day dividers, 24h countdown pill. All working correctly, zero console errors.
- **Agent view + permission boundaries** - confirmed agents see the same pooled conversation list as admin (matches the Phase 15 "staff select all" RLS model, not a bug), and confirmed the assign-agent reassignment dropdown correctly does NOT render for an agent - the one boundary that should differ, does.
- **Static demoMode-gap sweep** - checked every async function touching `sb.from`/`sb.storage`/`sb.functions` in the Conversations code (`renderConversations`, `assignConversationAgent`, `openConversation`, `loadConvAttachmentThumbs`, `setLeadTier`, `handleConvDeepLink`, `doInternalForward`, `doForwardMessage`, `sendConvMessage`, `sendWaViaFunction`, `sendWaViaBrowser`). All correctly gated - the functions with no `demoMode` branch (`loadConvAttachmentThumbs`, `sendWaViaBrowser`) are only ever reached from inside an already-live-only code path, confirmed by reading the call sites, not assumed. **Zero new gaps found** - the fixes from 2026-08-04/06 sessions hold up.
- **Mobile + dark/light theme pass - found and fixed one real bug** (commit `f3147a7`): at 375px, the chat header's flexible name/phone block was losing the flex-shrink fight against the avatar, 24h-window pill, (live mode) tier select and 3 action buttons, collapsing to 0 width - an agent replying from their phone couldn't see who they were texting, and the Copy Link button was clipped off-screen. Fixed by wrapping the header on mobile only: name + search/info icons stay on row one, the pill/tier-select/Copy Link move to their own row below. Verified admin + agent scope, light + dark theme, and confirmed desktop (>768px) is pixel-identical to before (`flex-wrap: nowrap` there, unchanged).

**Separately, same conversation:** Muhammad flagged Junaid free since yesterday and asked for a HANDOFF assignment - see the Box 3 restructure entry directly below, given the final go-ahead today.

---

## 2026-08-07 - FOR IZZA (reassigned from Junaid): Box 3 restructure (bot flow), go-ahead given

**Originally assigned to Junaid** when he was free earlier today; he instead self-directed onto other real work (the demoMode-branch sweep, the live-only code audit, and the send-template-from-inbox feature - all done and pushed). **Reassigned to Izza 2026-08-07** so this doesn't sit open indefinitely and she has a first concrete build task. Muhammad gave the final yes for the Box 3 restructure that's been sitting PROPOSED in `docs/BOT_FLOW_MAP.md` since 2026-07-21 (line 78 there). **Claim this here before starting, same as any other index.html/webhook work - this one does NOT touch index.html at all, only `supabase/functions/whatsapp-webhook/index.ts` and `docs/BOT_FLOW_MAP.md`, so no collision risk with concurrent work elsewhere in the codebase.**

**What to build:** insert a new stage between the main menu and broker choice that asks whether the customer already has a live Exness/XM account, so an existing account holder skips the experience/traded-before questions and goes straight to the deposit/screenshot step. Full copy (English) is already drafted in `docs/BOT_FLOW_MAP.md` lines 78-117 - BOX 3 (the new question), BOX 3A (first-time trader, same broker-choice-then-experience flow as today), BOX 3B (existing trader, broker choice then straight to deposit confirm). Still needs a Roman Urdu mirror for all new text, same as every other box in that doc.

**Where in the code, concretely:**
- `whatsapp-webhook/index.ts:988-993` - the `start_trading` branch inside `case "awaiting_menu"` currently jumps straight to `awaiting_broker`. This needs to jump to a new stage (e.g. `awaiting_trader_status`) instead, which asks the new/existing question.
- New stage handler, modeled on the existing `case "awaiting_broker":` block at `index.ts:1016-1028`: on "first time" -> advance to `awaiting_broker` exactly as today (BOX 3A, unchanged downstream: broker -> experience -> traded-before -> deposit confirm). On "already have an account" -> advance to a second new stage (e.g. `awaiting_broker_existing`) that, once broker is picked, calls `advanceStage(sb, lead, "awaiting_deposit_confirm", { broker_choice: broker, trader_experience: "experienced" })` directly - skipping `awaiting_experience` and `awaiting_traded_before` entirely, per BOX 3B.
- `MIDFLOW_RESTART_STAGES` array at `index.ts:942-945` needs the new stage name(s) added, or a lead stuck mid-restructure for 24h won't get the restart-at-greeting rule that every other mid-flow stage already has (see the comment right above that array explaining why this list matters - a real bug from 21 July shipped because a stage was missing from it).
- Needs a new button-matcher function alongside the existing `matchBroker`/`matchExperience`/`matchTradedBefore` helpers, matching "already have an account" vs "first time" (plus typed equivalents, following the existing pattern of also accepting typed input, not just button taps).

**Safety boundary, same as every other webhook change in this repo:** Izza's laptop has neither `supabase` nor `deno` installed as of today, so a real `deno check` isn't possible there yet - review the change carefully by reading it back (brace/paren balance, every new stage name spelled identically everywhere it's referenced, the button-matcher actually wired into the switch statement) and say plainly in the commit message that it's untyped-checked, same honesty pattern every other laptop-without-tooling change in this file has used. Whoever picks this up on a laptop that does have `deno` should run the check before it goes anywhere near a deploy. **Do NOT deploy.** This is the live bot webhook real customers hit - deploy is Muhammad's-laptop-only, with him present, standing rule. Once built, update `docs/BOT_FLOW_MAP.md` to drop "(PROPOSED restructure, needs your confirm)" from the BOX 3 heading and flip the "Box 3/3A/3B restructure above is PROPOSED" line near the bottom of that doc (~line 363) to DONE, then log it here and in REMAINING_TODOS.md same as every other completed item, and leave a claim note here for the deploy step so whoever's on Muhammad's laptop next picks it up.

---

## 2026-08-06 (later) - Conversations blank-line bubble fix + send-wa-message speed fixes

**DONE, verified, committed and pushed (`62b8407`, merged into `main` at `3d787d2`).**

- **Message bubbles no longer render as tall, mostly-empty boxes for messages with leading blank lines.** Muhammad flagged a live-production screenshot ("Goodness, just look at the boxes and the alignment"): a real customer message like `"\n\n\n\n\nok"` rendered as a tall bubble with the text pinned to the bottom. Confirmed via demo-mode reproduction this was NOT a CSS bug - `.msg-bubble`'s `white-space:pre-wrap` was correctly preserving whitespace the customer actually sent. Added a display-only helper `displayMsgText(text)` (right after `truncate()` in `index.html`) that collapses runs of 2+ newlines to one and strips leading/trailing blank lines, applied at all 4 places a message body renders inside `.msg-bubble`: the demo-mode static render, the live-mode render, `sendConvMessage`'s optimistic append, and `startConvRealtime`'s realtime INSERT handler. Verified display-only: `data-fwd`/`data-wamid`/`data-preview` attributes (forward, reply-to) still carry the raw original text untouched - checked directly via DOM inspection after the fix.
- **`send-wa-message` edge function: two independent writes (`communications` insert, `leads` update) now run via `Promise.all` instead of sequentially.** Found while investigating Hanzala's repeated real complaint that sending a message takes 7-8 seconds. Removes one avoidable round-trip per send. Also fixed a pre-existing, unrelated `deno check` failure (`Uint8Array` → `Uint8Array<ArrayBuffer>` typing on `base64ToBytes`/`uploadMediaToMeta`/`storeOutboundCopy`). Deployed via `supabase functions deploy send-wa-message`, verified byte-identical against local source via `supabase functions download` + `diff`. **Honest caveat: this does not fully explain a 7-8 second delay.** The likely dominant causes - the external WhatsApp Graph API call itself, and Supabase Edge Function cold starts - are outside what a code-level fix here can address. Told to Muhammad as an open item, not a closed one.

**Still open from the same conversation, not yet done:**
- Hostinger backup automation (Muhammad's 2026-07-21 request, resurfaced today): deploy a static copy of `index.html` to Badar's own Hostinger hosting on a temporary/free domain (explicitly NOT `crm.badartrader.com` - the live domain was pre-filled by Hostinger's flow and was caught and redirected before any action), then build a script that backs up Supabase data 4x/day. `backup-automation/` dir created, empty. Hostinger website setup itself was still in progress when this thread was paused for the rendering-bug fix above.
- WhatChimp: new agent "Faisal Shah" (President) added but sees an empty Omnichannel Inbox conversation list - unresolved. Per standing rule, guided via screenshots only; did not and will not operate WhatChimp directly, including when asked directly ("Can you do that for me?" - declined). Last recommendation given: draft and send a consolidated support message to WhatChimp; no confirmation yet whether Muhammad sent it or got a reply.
- Two more laptops (Ayesha's, one for "Izza") being onboarded into the git/Claude rotation. Ayesha's `git clone` succeeded. Izza's laptop stuck on Xcode Command Line Tools install (git-scm.com install prompt appeared; `xcode-select --install` run but same error persisted); `softwareupdate --list` suggested as next diagnostic step, not confirmed resolved.
- Business question relayed from Ehsan/Badar (not a coding task): running two simultaneous Meta Ads campaigns on one ad account, one tied to WhatsApp number 3903 and one to 6541, to expand into India/UAE. Answered informationally only (Meta Ads Manager supports multiple simultaneous campaigns per ad account with per-campaign destination number and geo-targeting; WhatsApp messaging tiers/quality ratings are tracked per phone number, not per account) - no action taken, this is Badar's own Meta account.

---

## 2026-08-06 - CRM track session (blueprint + day-dividers), separate from the "continue 2" work above

Done and pushed to `main` this session (Muhammad's laptop):
- **`PROJECT_BLUEPRINT.md` built and pushed** - the living, evidence-based project blueprint Muhammad asked for (20 sections, every claim cited to code or read-only Supabase CLI metadata, no em dashes). This IS the "live CRM blueprint / progress board" to-do; keep it updated as work lands rather than starting a new one. At that 2026-08-06 snapshot, the verified facts included all seven send flags OFF, 9 active Edge Functions with webhook v70, schema drift, unsigned webhooks, and the per-row `leads` INSERT HTTP-trigger risk. Those historical facts have changed as work landed; use the current Progress Board and Active Work Claims for present status.
- **Day-divider pills in Conversations built, verified, pushed** (commit `37937d6`): WhatsApp-style "Today / Yesterday / date" separators. Live path uses `convDayLabel(created_at)`; demo path uses a `dayLabel` field. Verified in demo (screenshot showed Yesterday/Today pills with ticks intact) and the helper unit-checked against real timestamps. Sits cleanly on top of Junaid's already-merged delivery-tick frontend (`4892a29`). Purely additive/cosmetic; does not touch the `delivery_status` query.
- **Dropped my redundant tick stash.** I had built delivery ticks locally this session; Junaid's `4892a29` landed the equivalent independently (the collision the blueprint predicted). My stash was confirmed redundant and dropped (recoverable via reflog ~90 days). The only unique piece in it, day-dividers, was re-added cleanly above.

Logged as new to-dos, NOT built (see REMAINING_TODOS.md):
- **Forward a message to another subscriber (customer-facing).** Real Cloud API re-send; rides `send-wa-message` + the target's 24h window; live send = Muhammad's-laptop-only; sequence AFTER the in-flight attachments work to avoid an `index.html` collision.
- **Forward a message internally to a teammate ("a MUST").** Open design question first: where does the recipient see it (lead activity log / dropped into another thread / a real notification)? Needs Muhammad's pick before building.

Nudge-agents: confirmed still deployed (v5) with the cron defs still in `schema.sql`; Muhammad reaffirmed the idea is dropped. Full removal (unschedule live cron + delete cron block + optionally delete the function) offered, not done.

Session ended here at Muhammad's request (usage limit; moving to another Claude account). Nothing left half-edited: working tree clean except untracked `deno.lock`.

---

**Three-person parallel work, effective 2026-08-07 (was two-person from 2026-08-02, Izza added today) - Muhammad, his younger brother Junaid, and Izza, on separate laptops, sharing one Google/GitHub login, building ONE application together (this CRM), not split into separate systems. No fixed lanes - Muhammad's explicit call (2026-08-07) is that Izza joins the same general rotation as everyone else rather than owning one fixed track, so any of the three can pick up any open item via Active Work Claims below.**
- Since all three machines share one GitHub identity, commits are told apart by the **local git `user.name`** set on each laptop, not by separate accounts - this laptop (Muhammad's) is set to `Muhammad`, Junaid's (including his backup "Ayesha" laptop - same person, see REMAINING_TODOS.md 2026-08-06 entry) is set to `Junaid`, and Izza's is now set to `Izza` - onboarding finished 2026-08-07, see the note directly below.
- **Active Work Claims** (below) is the collision-prevention mechanism - before starting something, add a line here; remove it once committed and pushed. Whoever's Claude session starts a task should `git pull origin main` first (already the standing rule) and check this list.
- For anything code-level, work on a branch (e.g. `feature/<short-task-name>`) and merge to `main` only once done and verified. Docs-only edits to this file can go straight to `main`.
- WhatChimp (bot training, AI Agent config) stays whoever's already doing it day to day (Junaid) - that's a separate SaaS tool, not part of this codebase, doesn't need the branch/claim process.

**Izza's laptop onboarding - DONE 2026-08-07, screenshot-guided from Muhammad's laptop.** The earlier Xcode Command Line Tools stall resolved once `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` pointed it at the already-installed Xcode app - `git` worked immediately after. From there: cloned this repo (`git clone https://github.com/claritydigital786/badar-trader-crm.git`, 2237 objects, clean), `git config user.name "Izza"` confirmed set inside the cloned folder, installed Claude Code via the native installer (`curl -fsSL https://claude.ai/install.sh | bash`, v2.1.224, needed one extra step to add `~/.local/bin` to PATH), logged into the Claude desktop app with the already-signed-in shared rotation account (shows as "Muhammad · Block Media House" - the account's registered name, not who's operating it), and pointed the app's project folder at the cloned `badar-trader-crm` directory (it defaulted to the home folder `app` first, corrected). Izza is a **she**, corrected after an earlier pronoun slip - use she/her. No fixed track assigned (see the three-person parallel-work section above) - she reads this file's "Active Work Claims" like anyone else before picking up a task.

**UI redesign in progress (2026-08-02) - task split:**
Muhammad approved a WhatChimp-inspired visual direction (light sidebar with tinted icon badges, welcome header, card-based dashboard) built in the CRM's own navy/gold/sky branding, not WhatChimp's green. A mockup was reviewed and approved first.

---

**DONE (2026-08-07, Muhammad's laptop) - Supabase backup script for Hostinger. Claim released.** Real requirement from 2026-07-21 ("automated database backups... 4 times a day"), resurfaced today. `backup-automation/backup.php`: reads every table in `schema.sql` (19 tables) via Supabase's REST API using the service role key, paginating past PostgREST's 1000-row cap, writes one JSON file per table, zips the run, and prunes down to a configurable retain count (default 28 = 7 days at 4 runs/day). Read-only against Supabase - cannot alter anything live.

**Verified end-to-end against a local mock PostgREST server, not real Supabase - no live credentials touched anything here.** Installed PHP via Homebrew specifically to run this rather than only reading the code (this repo's standing rule: nothing goes live unverified). The mock caught a real bug that a read-through would have missed: `pruneOldBackups()` only ever looked for leftover run *directories*, but the zip step deletes each run's directory right after archiving it - so on any host with PHP's zip extension (the normal case), pruning was silently finding nothing to remove, ever, and backups would have accumulated on Hostinger's disk quota forever. Fixed to recognize `<timestamp>.zip` files too. Also dropped a deprecated `curl_close()` call that would have spammed warnings into the cron log on PHP 8.0+. Re-verified after both fixes: pagination correctly split a 2500-row fake table into 3 pages, a genuinely missing table (`communication_logs` - the known schema-drift table) logged as an error without aborting the run, and pruning across 4 consecutive runs correctly kept exactly the configured retain count. All test artifacts (fake data, mock server) discarded before committing.

**Still needs Muhammad, and only Muhammad:** upload `backup-automation/` to Hostinger, copy `config.example.php` to `config.php` there with the real project URL and service role key (never committed, never typed into a Claude session), and set up the cron job in hPanel. Exact steps in `backup-automation/README.md`. Does not back up Supabase Storage (deposit screenshots, attachments) - only the database tables; flagged in the README as a separate, larger piece if wanted.

**UPDATE 2026-08-08, Muhammad's laptop - Hostinger side mostly done.** Steered directly (Claude driving Muhammad's own already-logged-in Chrome, no credentials entered) rather than screenshot-relay, since Muhammad asked for it explicitly and this is Muhammad's own hosting account, not a client-owned live system. Created a fresh site with a free temporary domain (`orange-moose-457260.hostingersite.com`) via "Custom PHP/HTML website" - deliberately NOT `crm.badartrader.com`, which the Domains page confirmed has an active Website + Email already connected on this account. All three files (`backup.php`, `config.example.php`, `README.md`) uploaded to `backup-automation/` **at the account root, sibling to `public_html`, not inside it** - `config.php` will hold a live service role key, and anything under `public_html` is web-reachable by default, so keeping it out of the web root avoids that exposure entirely regardless of PHP-execution assumptions.

**How the files actually got there, worth recording since it wasn't the obvious path:** direct file upload through this tool kept failing (schema validation error, likely because these paths were never "shared" with the browser-automation sandbox). Typing the content into Hostinger's in-browser code editor also failed - its autoclosing brackets/quotes duplicated as each character landed, corrupting the code. What worked: `pbcopy` the exact file content from this Mac's real clipboard, then `Cmd+V` paste into the editor - paste inserts raw text in one operation, so the per-keystroke autoclose behavior never triggers. One retry was needed on `backup.php` specifically - the first paste attempt pulled in unrelated SQL (looked like Universal Clipboard syncing from another device mid-copy); re-copying immediately before pasting and checking `pbpaste` right beforehand fixed it. All three files verified by exact byte size after upload (9.43 KiB / 849 B / 3.03 KiB, matching source).

**Cron job created - 4 separate entries, not one.** Hostinger's schedule UI only allows one specific value per field (no `*/6`-style step syntax for Hour in the dropdown, unlike Minute which does offer step presets) - so "every 6 hours" needs four jobs: `0 0 * * *`, `0 6 * * *`, `0 12 * * *`, `0 18 * * *`, all running `/usr/bin/php /home/u446257633/backup-automation/backup.php`. Confirmed all four saved correctly.

**The one thing still only Muhammad can do:** create `config.php` in that same folder (copy `config.example.php`, fill in the real Supabase project URL and service role key from the Supabase Dashboard). Until that exists, the cron fires on schedule but each run just logs `FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set` and exits - safe, but backups aren't actually happening yet.

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

**DONE 2026-08-14 (Izza) - Bot Manager audit: two false safety claims in the UI corrected. Frontend copy only, no migration, no deploy. Claim released.** Picked up the open finding from the PR #17 release entry directly below ("Bot Manager still labels several modules `Not built yet` while keyword rules are not consumed by the live webhook") and audited every Bot Manager info-box against the actual code. **That finding was itself imprecise, and the UI was wrong in a way that matters more than the label question.**

- **Keyword Replies panel claimed "the WhatsApp webhook does not read these rules". That is false.** The deployed `whatsapp-webhook` calls `tryKeywordReply()` on every inbound message and selects `keyword, match_type, reply_message` from `keyword_replies` (`whatsapp-webhook/index.ts:826`). What actually stops a reply is `KEYWORD_REPLIES_ENABLED = false`, a code constant at `index.ts:63`. **The CRM contradicted itself:** the AI Configuration panel's own "Live reply gates" table already lists `KEYWORD_REPLIES_ENABLED` as controlling "whether keyword rules can answer a customer" (`renderGateTable()`), while the panel an admin actually writes rules in said the rules were unread. The wrong copy was the one on the screen where rules get created. Why this is a safety issue and not a wording nit: the copy told the reader the protection came from the webhook ignoring the table, when in reality one boolean plus a redeploy turns every saved rule live at once against real traffic. Rewritten to name the real gate, point at the gates table, and state plainly that every active rule goes live together the moment it is flipped.
- **Follow-up Sequences panel claimed "no scheduled job reads these rules". Also misleading.** `send-follow-ups` is built, reads `follow_up_sequences` where `is_active = true`, and `supabase/schema.sql:627` schedules `send-follow-ups-every-30-min-business-hours` to POST it every 30 minutes, 9am-6pm PKT. Narrowly the old sentence is true today only because `FOLLOW_UPS_ENABLED = false` makes the function return before it reads anything, but the copy implied both the sender and the scheduler were unbuilt, when the scheduler is already wired and firing and only the flag stands in the way. Rewritten to say so, including that no further deploy is needed to begin sending once the flag flips.
- **Deliberately not put in the product copy:** the 2026-08-03/04 incident where a live `send-follow-ups` test matched 39 real leads instead of one. It is the sharpest illustration of exactly this risk, but Bot Manager is shown to Badar in presentations (`PRESENTATION_READINESS.md` step 8), so an internal incident does not belong on a client-facing screen. It stays in `CLAUDE.md` where it already lives.
- **The "Not built yet" half of the PR #17 finding is not a defect.** Only two occurrences exist, and both are honest: the section intro explaining the convention, and the shared `renderBmPlaceholders()` card. Each of the 18 `BM_PLACEHOLDERS` entries names what the slot does and what building it would take, and several correctly point at the working equivalent elsewhere in this CRM (Appointments, Meta Integration, User Permission). Left alone on purpose.

**Verified on Izza's laptop in demo preview** (`?demo-preview=1&demo-start=dashboard`, python3 static server, the only tooling this laptop has - no `supabase`, `deno`, `node` or `php`). Both rewritten boxes render with correct `<code>` and `<strong>` markup, desktop and 375px. Zero console errors or warnings on both passes. Checked specifically that the longer copy did not introduce horizontal overflow: `documentElement.scrollWidth` equals `clientWidth` at both 1280 and 375, and both boxes wrap inside their container rather than scrolling. The Bot Manager panel area does extend past the viewport inside its own scrollable `bm-layout`, but that is pre-existing and unrelated - the untouched Message Templates and Follow-up Sequences panels measure wider (1646px and 1675px) than the edited Keyword Replies panel (1489px). Zero em dashes, zero emoji added.

**Not verified from here, flagged rather than assumed:** whether the `send-follow-ups` cron is currently scheduled on the live database. `supabase/schema.sql` declares it, and this laptop has no Supabase tooling or credentials to confirm the live `cron.job` table. The new copy says this project schedules that job, which is what the repo can actually support. Worth a read-only `select jobname from cron.job` from a laptop that has access, and worth remembering the same schema block still carries the two `nudge-agents` schedules Muhammad reaffirmed as dropped on 2026-08-06 but which were never unscheduled.

**PR #17 RELEASED, THREE CRITICAL TOOLS PASSED 2026-08-14 (Muhammad).** PR #17 was marked ready and merged at `0baf535101c5d943cc1f7ab2a31b0a601abcd28a`. Vercel production deployment `dpl_2bEUZSwEjGjJjkS3uG6aujmX3E1U` is READY and identifies that exact merge commit. Production project `vfskqzgphrunjxquqpks` has migration `message_actions` at version `20260814105514`; the table, RLS, four policies, authenticated CRUD, and anonymous denial are verified. Production `send-wa-message` is ACTIVE at version 10, requires JWT, and exactly matches the reviewed local source. The signed-in live Admin UI was refreshed to the merged deployment and checked read-only. Add Lead loads and blocks blank submissions, Omnichannel Inbox loads 85 conversation rows without opening a customer thread and all five Inbox menu controls plus the blank-state guard work, and Comm Log loads 1,008 WhatsApp records with working channel and status filters. All three have no horizontal overflow at 375 by 812, and the final browser console has zero errors or warnings. A synthetic Admin-role staging transaction proved lead creation, Inbox record retrieval, and Comm Log note retrieval, then proved complete cleanup. The disposable staging project `pqinsznommmhgmtjzpzw` was paused after verification; it was not deleted and can be restored. Two honest non-critical findings remain: Meta campaign reporting works but Pixel Events returns Meta error `(#100) Missing perms`, and Bot Manager still labels several modules `Not built yet` while keyword rules are not consumed by the live webhook. No live message, reaction, customer edit, Meta routing change, or WhatChimp action was performed.

**PUSHED, PRODUCTION GATE OPEN 2026-08-12 (Muhammad) - PR #17 release package.** Muhammad explicitly authorized push, merge, and deploy. The exact 107-file local tree was published to `muhammad/inbox-message-density-20260810` as remote commit `55076a9de9d2ad31f3963466ed776d47cdd100e2`; every uploaded blob and the complete Git tree matched local Git hashes before the branch moved. PR #17 is open, mergeable, and still draft. Its Vercel preview is READY and the Vercel status succeeded. Local Inbox regressions, Deno checking, formatting, browser navigation, dashboard shortcut, and Inbox safety checks pass. The restricted sandbox blocked the backup test from reserving its loopback mock port before product logic ran; the previously recorded successful backup evidence remains applicable. Read-only production verification found `communication_message_actions` absent, migration `20260810005621_message_actions` absent from production history, and `send-wa-message` still at version 9. The package therefore has not been merged or deployed to production. The next safe step is a disposable Supabase branch at the currently quoted cost of $0.01344 per hour, which needs Muhammad's action-time spending approval. After staging replay passes, apply the verified migration, deploy the reviewed function, merge PR #17, and verify the Vercel production release. No production SQL, Edge Function, customer record, live conversation, message, credential, Meta routing, or WhatChimp setting was changed.

**DONE LOCALLY 2026-08-12 (Junaid change integrated by Muhammad) - dashboard shortcut consolidation. Claim released.** Integrated the exact reviewed dashboard change from Junaid's commit `ad8d2e5b286f549ab434b224dca2edbfe154eb39` into Muhammad's Inbox branch without merging either branch. Removed the duplicate Create Flow dashboard shortcut because Create Flow and Bot Manager reached the same consolidated module. The one remaining Bot Manager shortcut now opens Bot Manager directly and labels its scope as Automation and AI. Legacy bookmarks still route to the appropriate Bot Manager subsection. Automated and browser verification cover four distinct shortcuts, one Bot Manager entry, its direct destination, and the retained Inbox correction. The retained browser tab carried one older browser-harness MutationObserver error dated 2026-08-11; this verification emitted no new application error. This integration is one local commit only. It is not pushed, merged into `main`, deployed, or live. No database, production, live conversation, credential, Meta, WhatChimp, or messaging action was included.

**DONE LOCALLY 2026-08-11 (Muhammad) - PR #17 Inbox burger-menu and blank-state correction. Claim released.** The five-tile audit verified that the dashboard Open Inbox tile reached Omnichannel Inbox, but incorrectly called the Inbox fully working without testing its internal lead-list control. Muhammad's screenshot proved the missed defect: the button could hide the lead list before any conversation was selected and strand the user on a blank chat placeholder. Corrected both Admin and Agent inboxes and changed the misleading direct-collapse button into a real inbox menu with working Refresh inbox, All conversations, Unread conversations, Clear search, and protected Hide lead list actions. Automated Inbox regression checks pass. Browser verification proved the no-selection guard, all five Admin menu actions, selected-conversation hide and restore, and the 375-pixel flow; the mobile menu stayed within the viewport and the selected chat/list transitions remained correct. Admin and Agent use the same tested action functions, and automated checks require both menu copies. The browser harness emitted two un-attributed MutationObserver errors during its own DOM snapshots; the application contains no MutationObserver code and no application URL was attached to those entries. Included in the 2026-08-12 local integration commit only. Not pushed, merged, deployed, or live. No database, production, live conversation, credential, Meta, WhatChimp, or messaging action was included.

**DONE LOCALLY 2026-08-11 (Muhammad) - PR #17 final visual refinements.** Replaced the separated text check marks with one compact WhatsApp-style SVG status icon and removed the obsolete 46-pixel blank spacer below the normal 65-pixel sidebar profile row. Regression checks pass. The tick was verified as one 16 by 11 SVG in WhatsApp blue on desktop and 375-pixel mobile; the compact footer has zero blank pixels below it, keeps its 32-pixel avatar, and its account menu still opens. Muhammad approved the remaining design and this final compaction. The package is committed locally only. It is not pushed, merged, deployed, or live. No database, Edge Function, production, live conversation, credential, Meta, WhatChimp, or messaging action was included.

**DONE, PR #17 READY 2026-08-10 (Muhammad) - WhatsApp-style per-message action menu. Claim released.** Added Message info, Reply, Copy, React, Forward, Pin, Star, Add text to note, and recoverable Delete-from-view to every demo, live, optimistic, and realtime message render path. Pin, star, hide, and the user's reaction marker persist per user behind RLS in the new `communication_message_actions` migration. A narrowly extended `send-wa-message` function emits Meta's reaction payload only after confirming the caller is Admin or the lead's assigned active Agent and confirming the target WhatsApp message belongs to that lead. Automated inbox checks pass, Deno type checking passes, desktop and 375-pixel browser checks pass, every menu action was exercised in demo mode, and a fresh browser console has no errors or warnings. The disposable database replay could not be rerun on this Mac because Docker is not installed, so the migration still needs the existing local-staging replay before production review. The package remains draft/local only. Do not deploy the Edge Function, apply the migration to production, merge, send a live reaction, or operate any real conversation without Muhammad's explicit approval.

**DONE, CORRECTED AFTER MUHAMMAD'S PR REVIEW 2026-08-10 (Junaid, Ayesha laptop) - assigned-lead RLS and safe local staging. Claim released.** Added local corrective migration `20260810020000_restrict_agents_to_assigned_leads.sql` and synchronized the authoritative schema so Admin retains full access while each active Agent can access only the Agent's assigned leads, related records, private lead files, and own appointments. Muhammad's PR comments then found staging callbacks, parked Notifications, pooled appointments, and actor-audit gaps. The final preparer sanitizes the baseline before Docker starts, replaces automation with a local no-op, removes all three production cron schedules, excludes Phase 28 and its migration, and fails if any prepared SQL contains the production project reference, `cron.schedule`, `net.http_post`, or the parked notifications table. Appointment Agent policies are split by operation: inserts require both `agent_id` and `created_by` to match the signed-in Agent, while a trigger prevents Agents from changing `created_by` on updates without blocking an Agent from updating an Admin-created appointment assigned to that Agent. The final compatibility review replaced the trigger's deprecated `auth.role()` check with `(SELECT auth.uid()) IS NOT NULL` in both SQL sources. A fresh disposable rebuild applied 32 applicable steps, schema lint returned no errors, and the expanded cross-Agent matrix passed 80/80 checks. The five added checks prove that Agent A cannot forge Agent B in `communications.logged_by`, `lead_activity.actor_id`, `communication_logs.created_by`, or appointment `created_by` on insert or update. Existing browser QA remains applicable because this final correction changes database permissions and the local matrix only: all 20 active Admin and 6 Agent modules passed, assigned-lead visibility passed, 375-pixel mobile containment passed, parked Notifications produced no missing-table console error, and the console had zero errors or warnings. Evidence is in `qa/local-staging/evidence/QA_REPORT.md`. This package used fake local data only and did not query or change production, deploy anything, use credentials, touch live accounts, or send a message. PR #14 remains open and unmerged. The next package waits for Muhammad's review and uses a new branch.

**DONE, PR #14 READY 2026-08-10 (Junaid, Ayesha laptop) - disposable local Supabase staging and full CRM QA. Claim released.** Built a reproducible local-only harness in `qa/local-staging/`, starting from the authoritative `schema.sql` baseline and replaying all 31 committed migrations after it. A clean reset applied all 32 local migration steps, fake Admin / Agent A / Agent B users and fake CRM records seeded successfully, `supabase db lint` found no schema errors, and the cross-agent Data API matrix passed 71/71 allow and deny checks. The matrix found a real Phase 15 policy drift: agents could view a colleague's lead but could not log activity on it. Migration `20260810000000_lead_activity_staff_insert.sql` now permits active staff inserts while requiring the actor to be the signed-in user. Browser QA passed all 21 admin modules and all 6 agent modules, fake lead creation and search, cross-agent activity logging, Bot Manager records, fake payroll calculation, pooled inbox and Comm Log visibility, desktop, and 375-pixel mobile layouts. The final console check had zero errors or warnings. Two frontend corrections came from the pass: Comm Log no longer requests a nonexistent `communication_logs.created_by` relationship, and an RLS-hidden colleague is labeled `Team member` instead of `Unassigned`. The local query override accepts loopback HTTP only, so hosted pages continue using the production constants. Evidence is in `qa/local-staging/evidence/QA_REPORT.md`, and the implementation is open at `https://github.com/claritydigital786/badar-trader-crm/pull/14`. GitHub assigned #14 because draft PR #13 had already been opened from another laptop as a documentation-only ownership note on the separate `codex/safe-local-staging-20260809` branch. PR #13 was not modified. The initial local phase did not contact production or any third-party system; the later controlled production policy rollout is recorded immediately below.

**UPDATE 2026-08-10 - PR #14 is ready and the production RLS migration is applied, but the GitHub merge needs explicit production-deploy approval.** The final clean local replay now includes 32 migration steps and still passes 71/71 RLS checks with a clean schema lint. The two `lead_activity` policy migrations were applied to the production Supabase project and verified through migration history and exact `pg_policies` metadata. The post-change advisor found a per-row `auth.uid()` performance warning, so `20260810010000_optimize_lead_activity_staff_insert.sql` was added and applied; that warning is now gone. No production row or customer data was read or changed. PR #14's latest Vercel preview is Ready, it has no review feedback or GitHub Actions failures, and it is marked ready for review. The attempted merge was blocked because merging `main` can trigger a production frontend deployment, while the original staging authorization explicitly prohibited production deployment. Do not bypass this gate. Muhammad must explicitly approve merging PR #14 with the understanding that Vercel may deploy the frontend changes to production.
**DONE 2026-08-10 - Muhammad's Supabase Storage backup package. Claim
released.**

- **Muhammad:** completed the missing Supabase Storage backup capability on
  branch `muhammad/storage-backup-20260810`. The archive now includes all 22
  active database tables, every standard Storage bucket object, a restore-ready
  manifest, original bucket and object paths, byte sizes, and SHA-256 checksums.
  Hash-based archive names prevent remote object names from becoming unsafe
  local paths. Partial downloads are recorded in the manifest and produce a
  non-zero cron exit without discarding successful files. ZIP finalization is
  checked before loose files are removed.
- **Junaid:** PR #14 (`junaid/safe-local-staging-20260809`) remains frozen for
  Muhammad's review. Junaid owns its local staging, migrations, schema, QA files,
  `index.html`, and PR-specific documentation. No new edits are assigned while
  Muhammad's Storage backup package is active.

Verification passed: PHP syntax, recursive folder listing, pagination, exact
binary-byte preservation, unsafe-path rejection, partial-failure reporting,
manifest contents, schema-to-backup scope, full cron entry integration, ZIP
inspection, and retention behavior. Tests used only a loopback mock endpoint and
the literal test key `test-service-key`. No production endpoint, credential,
Storage object, Hostinger file, database row, deployment, PR merge, or live CRM
system was touched. Remaining human gate: review the branch, upload the reviewed
files to Hostinger, configure the real key outside `public_html`, run one real
backup, inspect the archive, and restore it only into disposable staging.

**DONE, READY FOR STAGED DEPLOYMENT 2026-08-09 (Junaid, Ayesha laptop) - Meta webhook signature protection. Claim released.** Reviewed Izza's existing commit `8888bf1`, reconciled it with current `main`, and integrated HMAC-SHA256 verification into both public Meta POST webhooks. Both handlers now read the exact request bytes once, verify `X-Hub-Signature-256` through the shared `_shared/meta_signature.mjs` module, and only then decode and parse JSON. Keeping one shared verifier prevents the WhatsApp and leadgen implementations from drifting. The rollout remains deliberately fail-open until Muhammad completes the staged secret setup: no `META_APP_SECRET` means unchanged behavior; secret set with `META_SIGNATURE_ENFORCED` false means audit-only logging; enforcement true rejects unsigned, malformed, wrong-secret, replayed, or tampered requests with 401.

**Verification:** the committed dependency-free test covers a known HMAC-SHA256 reference vector, valid enforcement and audit paths, changed bytes, wrong secret, missing/legacy/non-hex/short headers, uppercase digest, literal and escaped Unicode, exact non-text bytes, disabled-secret behavior, strict flag parsing, signed `Request` body handling, and replaying a signature against changed bytes. It passes in the local JavaScript runtime. The first run caught and fixed a real cross-realm `Uint8Array` validation issue. A separate source-wiring check confirms both handlers import the shared verifier, verify before JSON parsing, preserve their previous malformed-body response behavior, return 401 only for enforced signature failures, and leave all four WhatsApp reply/notification flags false. Git diff checks and the no-em-dash/no-emoji checks pass. Deno is not installed on this laptop, so a full `deno check` or Supabase bundle remains part of the Muhammad-laptop deploy gate. Read-only Supabase inspection confirms production was not changed: `whatsapp-webhook` remains v75 and `meta-leadgen-webhook` remains v3, both ACTIVE with `verify_jwt: false`, and their downloaded live sources still use `req.json()` with no signature verifier. No Edge Function was deployed, no secret was read or changed, no live webhook request was made, and no customer record was touched.

**Muhammad-only rollout, in order:** (1) run the Deno check or Supabase bundle, compare any existing webhook errors against the known baseline, then deploy both functions with `--no-verify-jwt`; (2) set `META_APP_SECRET` without setting enforcement; (3) watch both function logs until genuine Meta traffic consistently reports `signature valid`; (4) only then set `META_SIGNATURE_ENFORCED=true`. If audit mode reports a mismatch, stop and correct the app secret. Setting enforcement back to `false` is the rollback. The Meta app secret must be obtained and entered by Muhammad, never pasted into a Codex or Claude session.

**DONE AND LIVE 2026-08-09 (Junaid, Ayesha laptop) - Payroll persistence. Claim released.** The admin Payroll tab now reads deposit transactions inside the selected daily/weekly/biweekly/monthly period, persists per-agent base salary and commission settings, saves each calculated run as an immutable snapshot, lists the 20 latest runs, reopens a saved result, validates salary/commission ranges, and keeps CSV export. New live tables: `payroll_settings` and `payroll_runs`. Both migrations (`payroll_persistence`, then `payroll_advisor_fixes`) were applied through the connected Supabase tooling and verified against project `vfskqzgphrunjxquqpks`: both tables exist with RLS enabled, settings grants are SELECT/INSERT/UPDATE/DELETE, run grants are SELECT/INSERT only, policies are admin-only, and no payroll security-advisor warning exists. The performance advisor initially found two unindexed audit foreign keys and an `auth.uid()` per-row RLS check; both were fixed and verified gone. Remaining unused-index notices are expected on brand-new empty tables. No live payroll row was created during verification.

**Integrated browser verification passed in Chrome Demo Mode:** salary setup saved and survived leaving/reopening the tab; monthly run produced $1,650 base pay across two agents; daily run correctly prorated that to $55; both appeared independently in Saved Payroll Runs; View reopened the saved monthly snapshot; 101% commission was rejected with the correct message; mobile at 375px kept all controls visible and the wide results table had an intentional `overflow-x:auto` scroll container; zero console errors. The real Payroll functions also passed an isolated fake-data test with a current $2,000 deposit (10% = $200 commission), and the exact-period-boundary case now saves a positive 1ms range instead of violating `period_end > period_start`. Migration files were created manually because this laptop has no Supabase CLI. **Production deployment verified 2026-08-09:** Vercel deployment `dpl_A216q5MyR1wqwND9WyHX8Q9Bnj5h` is READY on `main` commit `6331c1d`, and a direct fetch of `https://crm.badartrader.com/` returned HTTP 200 with the new payroll save action, Saved Payroll Runs UI, and `payroll_settings` integration present. No live payroll row was created during this verification.

**DONE (2026-08-08, Izza) - schema drift closed in `schema.sql` (Phase 29). Repo-only, no deploy, no migration to apply. Claim released.** Closes the high risk flagged in PROJECT_BLUEPRINT section 17: a rebuild from `schema.sql` produced a DB missing objects that deployed code writes. Added, reconstructed from the actual insert/update payloads in the code: (1) `leads` columns `deposit_platform` TEXT, `deposit_amount` NUMERIC(15,2), `deposit_account_ref` TEXT, `verified` BOOLEAN DEFAULT false, `converted_at` TIMESTAMPTZ (all written by `conversion-hook`), and `bot_stage_history` TEXT[] (was only in migration `20260721000000`); (2) the `communication_logs` table (written by `submit-lead-form`, `conversion-hook`, `send-wa-message` - columns `lead_id`, `type`, `message`, `created_by`, plus id/created_at), with a lead_id index and RLS + staff-select/insert policies mirroring the `communications` table. **These objects already exist on the live DB (created by hand/code over time), so there is nothing to apply - this only fixes the rebuild reference.** Column shapes are reconstructed from code and NOT diffed against the live table (no DB access from this laptop); the block says so and says the live DB wins if they differ. All `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, so idempotent. Paren-balanced, zero em dashes. **Webhook request-signature code is now complete and independently tested; it has moved from section C to READY, WAITING for Muhammad's staged deploy and secret rollout.**

**DONE (2026-08-08, Izza) - `converted_at` reporting fix. Frontend only, ships on push, no deploy/migration. Claim released.** The reporting hole flagged as Junaid's queue item #4: `converted_at` was only ever stamped by `approveConversion()`, so a lead set straight to Converted from the status dropdown via `saveLeadDetail()` or `agentSaveStatus()` never got the timestamp, and any revenue / time-to-convert report would silently miss it. Both functions now add `converted_at: new Date().toISOString()` to the update when the status is moving *to* `converted` and it is not already set, and leave it untouched otherwise (both the live and demo branches). **Verified in demo mode (Izza's laptop):** admin save-to-Converted stamps it; a second save does NOT overwrite it (idempotent guard `!prevLead?.converted_at`); the agent path stamps it too; a non-Converted status does not stamp it. Zero console errors, zero Supabase traffic during the test (all in demo). Nothing touches live conversations; it ships to production on the next Vercel deploy from `main` like any other `index.html` change.

**DONE AND DEPLOYED 2026-08-08 (built 2026-08-07 by Izza; migration + deploy by Muhammad on his laptop). Claim released.** Migration `20260807010000` applied via the Supabase SQL Editor ("Success. No rows returned"), then `supabase functions deploy whatsapp-webhook --no-verify-jwt` ran clean ("Deployed Functions on project vfskqzgphrunjxquqpks: whatsapp-webhook"; `git pull` reported already-up-to-date, so the Box 3 code was what deployed). **Confirmed live via `supabase functions list`: whatsapp-webhook is v75, ACTIVE, updated 2026-08-08 07:50** (was v74). **Still NOT proven against a real message** - a real "Start Trading" test is blocked on the same open question as the other deploys: which number (3903 vs 6541) actually routes to our webhook. Worth confirming the version with `supabase functions list` and a byte-identical download+diff for full rigor, per this repo's deploy pattern. Original build detail below. The funnel now asks "already have a live Exness/XM account, or first time?" right after the main menu, so an existing account holder skips the experience/traded-before questions and goes straight to deposit confirmation.

**What was built** (only `whatsapp-webhook/index.ts`, `schema.sql`, one migration, and `docs/BOT_FLOW_MAP.md` - `index.html` untouched, confirmed):
- Two new `bot_stage` values: `awaiting_trader_status` (BOX 3, the new question) and `awaiting_broker_existing` (BOX 3B, broker choice for an existing holder that jumps straight to `awaiting_deposit_confirm` with `trader_experience: "experienced"`, skipping `awaiting_experience` + `awaiting_traded_before`). First-time path (BOX 3A) is unchanged downstream.
- `matchTraderStatus()` matcher (buttons `trader_existing` / `trader_first_time` plus typed input, "existing" checked first so "already have an account" wins), and `sendTraderStatusButtons()` (button titles kept <=20 chars per WhatsApp's reply-button limit - "I have an account" / "First time" / "Go Back"; full question in the body).
- `MIDFLOW_RESTART_STAGES` extended with both new stages (the 21-July restart-after-24h rule), and `goBack` cases added for both so the "Go Back" button re-sends the right prompt. Traced every `bot_stage_history` push/pop for the new stages.

**The catch that made this bigger than the assignment described:** `leads.bot_stage` has a CHECK constraint (`schema.sql:527, 558`) listing allowed stages. The two new names are NOT in it, so **the migration `20260807010000_bot_stage_trader_status.sql` must be applied BEFORE the webhook is deployed** - otherwise the first "Start Trading" tap throws a constraint violation and breaks the live bot. Same apply-migration-first hazard as the delivery_status column. `schema.sql`'s two CHECK definitions were widened to match (keeps it the source of truth, avoids the drift this repo keeps hitting).

**Verified by read-back only** (no `deno`/`supabase`/`node` on this laptop, so untyped-checked, stated honestly per this repo's pattern): brace/paren/bracket balance net-zero across the file; every new stage name, matcher, send-helper and button id spelled identically at every reference (grep-confirmed defined + wired); the two new switch cases and both goBack cases read correctly. The `awaiting_deposit_confirm` "hot" tier check in `index.html` needs no change - the new stages are earlier funnel steps and the existing path still reaches `awaiting_deposit_confirm`. **Not exercised against a real message** - needs the deploy.

**FOR WHOEVER IS NEXT ON MUHAMMAD'S LAPTOP - deploy step (do NOT deploy from any other laptop):**
1. Apply the migration FIRST: `supabase/migrations/20260807010000_bot_stage_trader_status.sql` (widens the `bot_stage` CHECK). It is idempotent (DROP IF EXISTS + ADD).
2. Run `deno check` on the webhook (this laptop couldn't) - expect the same 7 pre-existing errors this file always has, nothing new from this change.
3. THEN deploy: `supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`. `--no-verify-jwt` is mandatory (the live function runs `verify_jwt: false`; without the flag it breaks Meta's inbound webhook = live lead capture).
4. First real test: tap "Start Trading", confirm the new-or-existing question appears, then walk both branches (first-time -> broker -> experience -> ...; existing -> broker -> straight to deposit).

**Roman Urdu:** the new prompts are English, matching how the other funnel boxes' button prompts are already coded (English inline). A Roman Urdu mirror of the funnel is a separate, pre-existing gap across all boxes, not introduced by this change.

**DONE (2026-08-07, Izza) - Reports tab (admin view) QA pass + live Progress Board rebuilt. Claim released.** (Re-logged: the first pass of this landed in three local commits that were dropped when this laptop was reset to origin/main during SSH setup; redone fresh on current main.)

Reports QA, all in demo mode, **zero console errors and zero requests to the live Supabase project** (network log checked - nothing touched live data): the 4 stat cards (Total Leads 6, Conversion 33.3% = 2/6, Active Clients 2, Total Revenue $85,000 - internally consistent), Agent Performance table, Lead Source Breakdown, the Monthly Trend Chart.js chart (both themes), and the Financial Summary all render correctly. **demoMode-gap sweep: zero gaps** - the only Reports function touching the DB is `loadReports()`, and its `demoMode` early-return precedes all 4 live calls (3 RPCs + the monthly-trend `sb.from('leads')` select); every render helper is pure. Reports is admin-only so it never runs in the agent view. **Mobile 375px:** no page overflow, stat/financial grids collapse to one column, the 5-col agent table scrolls within its card. **Dark + light theme:** both legible - the hardcoded near-black inline text (`#0f172a`) is overridden by a `!important` dark rule (confirmed via computed style).

**One live-only observation for Muhammad (could NOT be verified here, NOT changed):** the top "Total Revenue / Approved deposits" stat card is computed as `cachedLeads.reduce((s,l)=> s + (Number(l.account_balance)||0), 0)` (sum of every lead's `account_balance`, `index.html:6876`), while the Financial Summary's "Total Deposits" comes from the `report_financial_summary` RPC. In demo both are $85,000 so the demo hides any divergence; in live these two can disagree and the "Approved deposits" label may not match what the card sums. Flagged rather than fixed - which figure is correct is a product decision. **Scope note:** the Reports tab has no filters and its only chart is a new-leads count trend (not a revenue chart), so those parts of the brief had nothing to test.

Progress Board rebuilt at the top of `PROJECT_BLUEPRINT.md` (see that file); reflects current main including the template feature, backup script, and the deployed bot-takeover fix.

**DONE and USABLE NOW (2026-08-07, Junaid on the AYESHA laptop) - mark a conversation unread from the inbox. Claim released.** Chosen deliberately over the remaining parity gaps because it needs **no migration and no deploy**: `leads.is_unread` already exists, so this is the only thing built today that works the moment it reaches production, rather than joining the four items queued behind Muhammad.

Agents triage by working down the unread list, and opening a conversation clears it automatically - so there was no way to put something back on the pile after glancing at it. A 📩 button in the chat header now marks it unread and returns to the list.

**It deselects on purpose.** `openConversation()` clears `is_unread` on open, so leaving the conversation open would mean the next reopen silently undid the action. Deselecting also required writing `expandConvListOnMobile()` - the mirror of the existing collapse helper - because on mobile the list is hidden while a chat is open, and without it the agent would be left on an empty panel with no way back to the list. Verified at 375px.

**Two pre-existing demo/live mismatches fixed on the way, both of the kind that has bitten this project repeatedly:**
1. **The demo conversation list hardcoded `data-unread="false"`**, so the Unread filter tab matched nothing and **had never actually been exercised in demo** - the filter existed but was untestable. Demo rows now carry a real unread flag and render the same blue dot the live path does.
2. **The demo branch of `openConversation` never cleared unread**, only the live branch did. Found by testing rather than reading: a conversation marked unread in demo stayed unread forever, which is not how production behaves. Now cleared in both.

**Verified in demo mode:** the button marks unread, deselects, restores the chat panel to the same empty-state markup it starts with, and flags the list row with a blue dot; the Unread filter now matches exactly that row and All returns to three; reopening clears it in both the data and the list row; on mobile the collapsed list is restored and is genuinely visible. Screenshot confirms it at 375px. Network log clean - no Supabase traffic from demo. Balances and em dashes clean.

**One thing I got wrong and caught:** I first called `expandConvListOnMobile()` and used a `.conv-empty` class, neither of which existed - the helper had to be written, and the empty state now reuses the panel's real `conv-empty-chat` markup so deselecting looks identical to never having selected anything.

**UNVERIFIED:** the live path (`leads.is_unread` update) has not been exercised - it needs a live session. It is a single-column update of a column the webhook already writes, using the same pattern as the clear-on-open beside it.

**DONE, MIGRATION NOT APPLIED (2026-08-07, Junaid on the AYESHA laptop) - in-app notifications. The internal forward now actually reaches someone. Claim released.** Muhammad called the internal forward "a MUST", but as built on 06-08 it was passive - it wrote a note onto the lead and the teammate only saw it if they happened to open that lead, which is not what forwarding means. The blocker was that nothing in the schema could deliver to a person: `leads.is_unread` is one global boolean meaning "the customer sent something new", so reusing it would both assert a customer message that never happened and light up for the whole team.

New `notifications` table (migration `20260807000000`, Phase 28 in `schema.sql`, **diffed identical** in both directions), a bell with an unread count in **both** the admin and agent headers, and the internal forward writing to it.

**Deliberately generic, not forward-specific.** One row per thing a specific person should look at, with a `kind` covering forward / mention / assignment / escalation / system. Escalations currently ping an agent's personal WhatsApp; they could move here later instead of inventing another mechanism.

**RLS decisions worth stating.** You read and update only your own rows, and **admins were deliberately not given blanket read access** - being an admin is not a reason to read someone else's alerts. The update policy pins `recipient_id` in `WITH CHECK` so a row cannot be reassigned to someone else, and insert requires `actor_id = auth.uid()` so a notification cannot be forged as coming from a colleague. `actor_id` is `ON DELETE SET NULL` rather than CASCADE, because deleting the sender must not delete the recipient's notification; same reasoning for `lead_id`.

**Found and fixed a real gap while wiring it up.** `enterDemoMode()` builds the admin shell by hand instead of calling `initAdmin()`, so `loadNotifications()` was never called in demo - the bell would have been permanently empty in every demo. That is the same mismatch that hid the My Leads and agent-action bugs on 2026-08-04. Called from `enterDemoMode` too now, with a comment saying why.

**Failure of the notification does not undo the forward.** If the notification insert fails (most likely: migration not applied yet) the activity note has already been written, so the agent is told "Saved to the lead, but X was not alerted - tell them directly" rather than losing the forward entirely.

**Verified in demo mode:** all eight functions defined; badge loads on entering demo, shows the right count, hides at zero, caps at `9+`; panel opens from a known-closed state, lists both notifications, highlights the unread one, shows relative times; `notifAgo` at the just-now / minutes / hours / days boundaries; clicking a notification marks it read, clears the badge, closes the panel, switches to Conversations **and opens the correct conversation**; mark-all clears everything and removes its own button; the bell toggles closed; **outside-click-closes was re-tested properly after my first attempt passed trivially against an already-closed panel**, and a click inside the panel correctly does not close it; the empty state explains what will appear there; both admin and agent bells render. The internal forward was re-run with all three customer-send paths stubbed - **zero customer sends**. Network log clean, no Supabase traffic from demo. Balances and em dashes clean.

**UNVERIFIED:** the migration is **not applied**, so in live mode every notification query fails and the bell shows nothing - by design, it logs to console rather than erroring at an agent. Nothing about the real insert, the RLS policies or the live read has been exercised. Applying `supabase/migrations/20260807000000_notifications.sql` is the next step and needs Muhammad.

**DONE, NOT DEPLOYED (2026-08-07, Junaid on the AYESHA laptop) - inbound media is now stored and playable, not just named. Claim released.** Completes the 06-08 fix: that one stopped voice notes, PDFs and video vanishing silently, but only recorded a `[voice note]` label - the file itself was never fetched, so the agent still could not open it. For a business that asks customers for deposit receipts, seeing that a PDF arrived without being able to read it is most of the problem still unsolved.

`recordUnsupportedMessage` now pulls the media id (`mediaIdOf`, which knows that every media type keeps its id under a key named after the type, and that location and contacts carry none) and reuses the existing `downloadAndStoreMedia`. The frontend renders by kind instead of assuming an image.

**A guard that had to be added, not just reused.** `downloadAndStoreMedia` was written for images, which WhatsApp caps at 5MB, so it never needed a size check. It now also handles documents and video, which WhatsApp allows up to **100MB** - and the function buffers the whole file in memory twice, download then upload. One large document could take the webhook down for **every other inbound message**, not just that one. Meta reports `file_size` in the lookup call that already happens, so oversized files are refused before any download, at a 20MB ceiling that comfortably covers receipts, voice notes and short clips.

**Storage failure is deliberately not fatal.** If the download or upload fails the row is still written, with the reason appended: `[voice note] (file could not be stored: over the 20MB storage limit)`. A visible message with an explanation beats the message disappearing, which is the exact bug this path exists to fix.

**The renderer assumed every attachment was a screenshot.** It always emitted an `<img>`, so a stored PDF would have rendered as a broken image icon. It now picks by file extension: images inline as before, **audio as a playable `<audio>` element** (a voice note the agent must download first is barely better than not having it), video as `<video>`, and anything else as a named download link. The loading placeholder said "Loading image" and now says "Loading attachment".

**Verified in demo mode:** extension mapping across 16 real extensions plus uppercase, mixed case, a path with dots in the folder name, no extension, empty, null and undefined - 27 checks, all passing. `mediaIdOf` checked for audio, document, video and sticker ids, and correctly returning null for location, contacts, a missing id, an unknown type and a null message. The failure-note format. Regression: conversations still render, sending still works, and the attach and template buttons are both still present. Balances and em dashes clean.

**UNVERIFIED, and the gap is real:** the download, the size guard and the audio/video/file rendering have never run against a real file. All three need live WhatsApp media plus live storage, neither of which exists here - the mapping and id-extraction logic is unit-tested, the actual fetch-and-store round trip is not. **Not type-checked** (no Deno on this machine). Needs a `whatsapp-webhook` deploy, which is Muhammad's. First real test: send a voice note and a PDF from a phone and confirm both appear and open in the inbox.

**DONE, NOT DEPLOYED (2026-08-07, Junaid on the AYESHA laptop) - send an approved template from the inbox. C2 is now complete. Claim released.** The countdown pill has shown agents the 24-hour window closing since D1/C2 landed, but offered no way out of it. This is the way out: a template is the only thing WhatsApp accepts after that window.

A 📋 button in the input bar opens a picker of sendable templates; choosing one opens a compose step showing the body with an input per `{{n}}` placeholder, `{{1}}` pre-filled with the lead's first name, and a live preview; then a confirm dialog naming the contact and quoting the finished text. `send-wa-message` gained a `template` branch that builds Meta's `type: "template"` payload.

**Which templates are offered, and why the filter is strict.** Only rows that are `status = 'approved'`, still active, **and** have a `meta_name`. That last one is not defensive padding: the CRM stores a friendly label (`name`) and Meta's own identifier (`meta_name`) separately, and a row can exist with the latter blank - offering it would produce a guaranteed Graph API failure. The function refuses that case too, in case a row slips through.

**Two limits stated in the code rather than discovered later:**
1. **`status` is self-reported.** It is set by hand in the Message Templates tab and nothing checks it against Meta. A row marked approved that Meta has not actually approved will fail at send time with Meta's own error surfaced to the agent. There is no way to verify it from here without the Meta API.
2. **Body-only templates.** Headers, buttons and media headers each need their own component and their own UI to fill; none are supported.

Also deliberate: **no reply-context on a template send.** A template is used precisely when the window has closed, so there is no live thread to quote into. And the **legacy in-browser fallback refuses templates outright** rather than falling back to plain text - plain text is exactly what WhatsApp rejects in this situation, so a silent downgrade would send something guaranteed to bounce.

**A real bug found by testing, not by reading.** An empty placeholder value substituted as blank, so the preview read "this is  from Team Badar" - the agent could not see which slot was unfilled. Empty and whitespace values now keep their `{{n}}` marker in the preview. Sending is blocked while any value is empty, so this only ever affects what the agent sees.

**Verified in demo mode:** placeholder counting (multiple, none, spaced `{{ 1 }}`, the same index twice), rendering (substitution, missing values, empty, whitespace); the filter tested one exclusion rule at a time (not approved / inactive / `meta_name` null / `meta_name` blank, each rejected individually); the button renders; the picker lists only the approved row; **the production empty state was tested by emptying the list and checking it explains that Meta must approve a template first and names the tab to use** - that is the state every real user sees today, so it mattered more than the happy path; compose shows one input per placeholder with `{{1}}` pre-filled; preview updates live; a blank value blocks sending with no confirm dialog; the full send appends the rendered text; Escape and backdrop close; opening with no conversation refuses. Plain-text sending still works (regression after adding a fifth parameter), and the parameter was confirmed to thread through by inspecting the function source rather than by `Function.length`, which stops counting at the first default. Network log clean - no Supabase traffic from demo. Balances and em dashes clean.

A single approved demo template (`Follow up after quiet period`) was added to `_DEMO_TEMPLATES` so the flow can be shown without a database. **In production the list is empty** until Meta approves something.

**UNVERIFIED:** no template has been sent. It cannot be, because none is approved - which is the whole blocker this feature waits on. The `send-wa-message` change is also **not type-checked** (no Deno here) and rides the same pending deploy as the attachment work.

**DONE (2026-08-07, Junaid on the AYESHA laptop) - live-only code audit. Claim released.** Follow-on from the two bugs found on 06-08 that were both invisible in demo mode. The question this asked: what code can *only* run against live data, and therefore has never been exercised by any verification pass this project has done?

**Scale of the blind spot, measured rather than guessed: 69 functions contain database code sitting after a `demoMode` early return.** Every one of them is unreachable in demo mode. `openConversation` alone has ~196 live-only lines. That is the surface no amount of demo testing can cover.

**The finding worth acting on: the bot-takeover flag fails silently on both send paths.** When an agent messages a lead, the code sets `needs_human` so the webhook stops treating the customer's replies as answers to its own bot flow. The comment above it documents exactly why: a lead was lost on 21 July 2026 when an agent stepped into a bot conversation and the bot kept consuming the replies. **That write's result was thrown away on both paths** - in `send-wa-message` it sat inside a `Promise.all` where only the *other* promise's error was destructured, and in the browser fallback it was a bare `await`. So the mechanism protecting against a known lead-losing bug had no failure detection at all. The message goes out, the agent sees success, and the bot may still be live in that conversation with nobody aware.

Both now capture that error and tell the agent plainly that the handover did not happen and to set Needs Human by hand. It stays a **warning, not a failure**, because the message genuinely was delivered - reporting failure would invite a retry and double-message the customer, which is the trade-off the existing `insertError` branch already reasons about.

**Checked and deliberately not changed, with reasons:**
- **The delete-lead cleanup loop** discards errors across five child tables (`communications`, `communication_logs`, `lead_activity`, `transactions`, `kyc_documents`). Looks alarming, but every one of those has `ON DELETE CASCADE` on `lead_id`, and the `leads` delete that follows *is* error-checked - so the manual loop is belt-and-braces and a silent failure there is cleaned up by the cascade anyway. Left alone.
- **Eight `const { data } = await sb...` reads that never capture `error`** - all are settings lookups that fall back to a default when data is missing, so an error and an empty result take the same path. Benign.
- **Initials/avatar rendering** on live names: the live conversation list guards with `|| 'Unknown'`, and `initAgent` falls back to the email. A name of pure whitespace would render blank initials, which is cosmetic, not a crash. Not worth churn.
- **Joined-relation access** (`x.leads.y` without optional chaining): one static hit, which turned out to be a false positive in markup, not code.

**Verified:** script still parses, both send functions still defined, demo send path unaffected (regression), brace/paren/backtick balance clean in both files, zero em dashes. **The `Promise.all` destructure arity was double-checked** since adding a second destructured element to an existing array pattern is exactly the kind of edit that silently shifts positions.

**UNVERIFIED, and unavoidably so:** neither fix can be exercised here. Both only fire when a database write fails against live data, which needs a live session and a real failure.

**DEPLOYED (2026-08-07, Muhammad's laptop, him present).** `deno check` passed clean. Before deploying, downloaded the currently-live function and diffed it against this fix - confirmed the live version really was still the old, buggy one (no `takeoverError` check at all), so this was a real gap, not a stale worry. Deployed, then downloaded again and diffed against the committed source: zero difference, byte-identical. The `index.html` half of this fix (`sendWaViaBrowser`) needed no deploy - it shipped the moment it was pushed, being frontend code.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - sweep for database calls with no `demoMode` branch. Claim released.** The mirror of the handler sweep: that one found bugs invisible in demo mode, this one finds bugs that only appear *in* it. Conversations deliberately untouched, since the other session is working there.

**Method, since "I checked" is not evidence.** Static pass over every function in `index.html`, flagging any that calls `sb.from/storage/functions/auth/rpc` with no `demoMode` mention anywhere in its body: **14 candidates**. Reachability was then decided per function from the rendered DOM rather than by clicking - several are writes, and firing writes at production to test a theory is not acceptable. **Five were genuinely reachable in demo and are now fixed:**

- **`renameProfile`, `toggleRole`, `suspendAgent`** - all three render as buttons in **both** My Team and User Manager. In demo they hit the live database with fake ids like `demo-agent-1` while `currentUser` is null. Exactly the failure `agentSaveStatus` had (`invalid input syntax for type uuid: "dl3"` surfacing raw in the UI).
- **`saveMetaSettings`** - the guard had to go **before** the rows are built, not just before the write: every row reads `currentUser.id`, so it threw a TypeError before it ever reached the database.
- **`logCommunication`** - reachable from the lead detail panel's Communications sub-tab. Found by checking the rendered DOM, not by reading call sites, which is what caught it.

**A demo-branch subtlety worth recording.** These write to `_DEMO_PROFILES`, not `cachedProfiles`. `loadProfiles()` rebuilds `cachedProfiles` from `_DEMO_PROFILES` on every refresh, so a change written only to the cache is wiped by the very next render - it would have looked like it worked, then silently reverted.

**A second, pre-existing bug fell out of this, and it affects live mode too.** The roster is rendered by two tables - My Team (`agents-tbody`) and User Manager (`user-manager-tbody`) - but `loadProfiles()` only ever refreshed the first. Renaming, promoting or suspending someone **from User Manager** left that table showing the stale value until you switched tabs. Added `refreshAgentTables()`, which renders both; `renderAgentsTable` already no-ops when its tbody is absent, so calling both unconditionally is safe.

**The nine remaining candidates were each dismissed with a reason, not waved through:** `handleLogin`/`afterLogin` (demo is entered by its own path, never through login); `sendWaViaFunction`/`sendWaViaBrowser` (only called from the live branch of `sendConvMessage`, which returns early in demo); `viewKycFile`/`viewDepositScreenshot`/`loadConvAttachmentThumbs` (rendered only when a row has an `attachment_path`, which no demo record has); `notifyAdminPendingApproval` (both call sites sit after the `demoMode` early return in `saveLeadDetail` and `agentSaveStatus` - verified by character offset, not by eye); and `loadUpcomingFollowups`, which does fire a pointless read in demo but degrades to an honest "No follow-ups scheduled" empty state, so it is a wasted query rather than a visible bug. Left alone rather than churned.

**Verified in demo mode:** rename persists and both tables show it, including a name with an apostrophe; role toggle and suspend persist; `saveMetaSettings` returns its demo message; `logCommunication` returns its demo message and its empty-body validation still fires; acting from User Manager now refreshes User Manager in place and stays consistent with My Team. **Network log checked throughout: zero Supabase requests, so nothing reached production.** Brace, paren and tag balance clean; zero em dashes.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - broken-handler sweep. One more live bug found and fixed.**

**The Rename button in My Team / User Manager has been broken for any name containing an apostrophe.** `esc()` escapes `<`, `>`, `&` and `"` but **not** `'`, and the name was interpolated into a single-quoted argument: `renameProfile('${p.id}','${esc(p.full_name)}')`. A staff member called Sara O'Brien produced `renameProfile('u2','Sara O'Brien')`, which is a syntax error, so the button silently did nothing. Proved it by building the exact markup and compiling the parsed attribute, then re-proved the fix by clicking a real button and capturing the arguments `renameProfile` actually received.

This one is worth noting because Rename exists specifically to fix names that imported wrong - so the people most likely to need it are exactly the ones whose names are unusual.

**Same class, fixed defensively rather than left as "probably fine":** `selectBot(...)` in Bot Manager, and the copy-to-clipboard buttons for a lead's phone and email in the detail panel. An email may legally contain an apostrophe. All four now pass values through `esc()`d `data-` attributes read via `this.dataset.*`, matching the reply/forward fix from earlier today.

**How the sweep was done, since "I looked" is not evidence.** Static scan for two patterns: `JSON.stringify` inside an inline handler (zero left), and any single-quoted interpolation inside a handler attribute. The latter returned 21 distinct expressions; all but four were UUIDs, loop indices, `scope`/`ctx` constants or generated storage paths (`leadId/timestamp.ext`), none of which can contain a quote. A second scan looked for interpolation in any attribute without `esc()`, which returned only enums and computed values (role, status, channel, colours, widths).

Then the runtime half, which is what actually covers the live-only gap: **every demo dataset was poisoned with `O'Brien "Q" \x`** - profiles, leads, conversations, message bodies, subscribers - and all 24 admin tabs were walked, compiling every `onclick`/`oninput`/`onchange`/`onkeydown`/`onsubmit` in the rendered DOM. Then the parts that only render on interaction: the lead detail panel, all five of its sub-tabs, an open conversation, and the forward picker in both modes. **Zero broken handlers anywhere.**

**Still not covered, and worth being honest about:** this exercises the code paths demo mode can reach with hostile data, which is a big improvement on before, but screens whose markup only ever builds from live query results are still only covered by the static scan. The static scan is exhaustive over the file, so a new instance would have to be introduced in future code rather than hiding today.

**The general lesson for this repo, now demonstrated twice in one day:** `esc()` is safe for attribute *values* but not for values interpolated into JavaScript inside an attribute. Pass data through `data-` attributes and read `this.dataset.*` instead. Both live bugs found today came from ignoring that, and both were invisible in demo mode.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - internal forward to a teammate. Claim released.** Muhammad's option (a), picked by Junaid.

Rather than a third button on the bubble, the existing Forward picker gained a two-way toggle: **To a conversation** (the customer-facing forward) and **To a teammate** (internal). Team mode swaps the target list to active staff, adds an optional note field, and writes a `lead_activity` row (`channel: 'note'`) against the lead whose conversation the message is in. Nothing is sent to anyone outside the CRM.

**The two modes look nearly identical and their consequences are opposite, so that is signposted twice:** a coloured hint under the toggle that switches between "Sends a real WhatsApp message to that customer" and "Internal only. Nothing is sent to any customer", and a confirm dialog that names the recipient and states which of the two is about to happen.

**A promise I made when proposing this, and then could not keep honestly.** I offered to offset option (a)'s passivity by flagging the lead unread for the teammate. On inspection that is not buildable: `leads.is_unread` is a **single global boolean** meaning "the customer sent something new", and there is no notifications table and no per-user unread anywhere in the schema. Setting it would both assert a customer message that never happened and surface the lead to the entire team. So it is deliberately not set, and this remains passive - the teammate sees the entry when they open that lead's Activity. Making it actually notify someone is Muhammad's option (c) and needs a notifications mechanism built first. `lead_activity` also has no recipient column, so the teammate's name lives in the summary text.

**Verified in demo mode.** Mode switching: 11 checks covering which targets each mode lists, self excluded from teammates, current conversation excluded from conversations, the hint text, the note field appearing only for team mode, and switching back and forth. **The safety property was tested directly rather than assumed: with `sendWaViaFunction`, `sendWaViaBrowser` and `doForwardMessage` all replaced by counting stubs, a full team-mode forward called none of them - zero customer-send calls, no message added to any conversation.** Customer mode still forwards correctly after the refactor. Summary construction checked for naming the recipient, quoting the message, appending or omitting the note, and truncating a 500-character message. Handler scan clean in both modes.

**A test of mine failed for the right reason, worth recording.** I tried to exercise the live database write by stubbing `demoMode`, `sb` and `currentUser` from an injected script. Those are `let`-scoped in the page, so the assignments created unrelated globals and the function simply took its demo branch. **I checked the network log rather than assuming: only localhost requests, no Supabase traffic, so no write was attempted against production.** The live `lead_activity` insert therefore remains unverified, consistent with everything else in this session.

**Console note, stated precisely rather than as "zero errors":** two entries appear, but both are present on a clean page load with no interaction at all - a retained click error from before the handler fix earlier today (the console buffer survives navigation in this tool) and an ambient 400 from the ticker/market feed. Neither comes from this change. Brace, paren and tag balance clean; zero `JSON.stringify`-in-handler patterns remain; zero em dashes.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - customer-facing Forward, and a live bug it exposed. Claim released.**

**The bug matters more than the feature: the quote-reply button has been broken in production, for every message, since it shipped.** Building Forward I hit a syntax error, traced it, and found the existing reply button had the identical defect. Both used `${JSON.stringify(text)}` inside a double-quoted `onclick="..."`. `JSON.stringify` wraps its output in double quotes, which closes the HTML attribute early - the browser parsed `onclick="setReplyTarget('wamid.ABC==', ` and stopped, leaving invalid JavaScript that throws on click and does nothing. Verified by generating the exact live-path markup and reading back the parsed attribute, not by reasoning about it.

**Why nobody caught it:** the reply button only renders when a message has a `wa_message_id`, and demo messages have none - so the button exists *only* in live mode, and every verification pass on this feature has been in demo mode. A genuine blind spot in how this project tests, not carelessness by whoever wrote it.

All three sites now pass values through `data-` attributes escaped with `esc()` (which encodes `"` as `&quot;`) and read them via `this.dataset.*`, so no user text ever lands inside the handler source. Checked with hostile input - `He said "yes" & <script>alert(1)</script>` - which round-trips exactly and injects no element.

**A structural scan is now part of the check, and it earned its place immediately:** after fixing the two buttons I grepped for `JSON.stringify` inside any inline handler and found a **third** instance - my own forward-target picker. My tests had missed it because I called `confirmForward()` directly rather than clicking the target. Fixed, then re-tested with a real click on a target whose name contains a double quote. The file now has zero such patterns, and a runtime scan compiling every `onclick`/`oninput`/`onchange`/`onkeydown` in the rendered app reports zero broken handlers.

**The feature itself.** A `↪` button on every bubble opens a picker listing other conversations with name/phone search; choosing one raises a confirm dialog naming the recipient and quoting the text, and only then sends. Two steps on purpose: this reaches a real customer and a misdirected forward cannot be unsent. The current conversation is excluded from the list, since forwarding a message back into its own chat is almost always a misclick. Targets come from the conversation list already loaded, so there is no extra query.

**Worth telling Muhammad plainly:** the Cloud API has no forward operation and no "Forwarded" label a business can set, so this is a fresh outbound message containing the same text. The recipient sees an ordinary message from the business, not a marked forward. His own to-do note already anticipated this.

**Known limitation, deliberately not faked:** the picker does not show whether each target's 24-hour window is open. The conversation list only carries the most recent message per lead, so for any conversation whose last message was outbound the last *inbound* time is unknown - a per-target indicator would be right sometimes and wrong sometimes, which is worse than absent. Forwarding into a closed window fails at the API and the real WhatsApp error is surfaced in the toast.

**Verified in demo mode:** picker opens from a real bubble click; search filters by name and by phone; the no-match message; current conversation excluded; **cancel sends nothing and leaves the picker open**; confirm names the recipient and warns it is a real message; the message lands in the target with the right text and direction; overlay closes and state clears; Escape closes; backdrop click closes but a click inside the panel does not; empty text is refused; opening twice never stacks two overlays; both themes. Zero console errors, brace/paren/tag balance clean, zero em dashes.

**UNVERIFIED:** no forward has been sent for real. The live path reuses `sendWaViaFunction`, which is the same path agent replies already use, but attachments aside it has not been exercised end to end from here.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - search within a conversation. Claim released.** Was meant to be two parity gaps; the other one turned out to be already built, see the collision note below.

A 🔍 button in the chat header opens a search bar over the thread. Typing highlights every matching bubble, dims the rest, and shows a `3/7` counter; the up/down buttons and Enter/Shift+Enter step through matches and scroll each into view, wrapping in both directions. Escape or ✕ closes and clears. Entirely client-side: it searches the bubbles already rendered, makes no query and touches no data.

**Two implementation choices worth knowing.** Matching highlights the whole bubble rather than wrapping hits in `<mark>` tags: the bubbles carry a reply button, an attachment block, the timestamp and the delivery tick, and rewriting their innerHTML to wrap matched text would risk breaking all of that for a cosmetic gain. And the timestamp and tick are stripped before matching, because otherwise searching `10` would hit almost every message through its clock rather than its text.

**COLLISION, and the process lesson is the useful part.** Day separators were the other half of this task, and I built them before discovering a parallel session had already shipped them in `37937d6` about an hour earlier. Worse, my version defined a second `convDayLabel()` with the same name as theirs, which JavaScript resolves silently by letting the later definition win - no error, no warning, just one of two implementations quietly in charge. Reverted mine entirely; `git diff` confirmed the file came back byte-identical before I moved on, and there is exactly one `convDayLabel` in the file now.

I had pulled and checked Active Work Claims immediately before starting, and it was empty - their work was already committed, so there was nothing left to claim. **The claims list only prevents collisions on work in progress; it says nothing about work already finished.** The check that would have caught this is reading recent commits touching the file, not just the claims section. Worth doing both before starting anything in `index.html`, since it is one enormous file that everyone edits.

**Verified in demo mode:** 14 search cases - bar toggling, a single match, multiple matches with the counter, stepping forwards and backwards including wrap-around, a query matching nothing, an empty query clearing state, and closing clearing everything. Specifically confirmed that searching `10:00` returns zero matches, which proves the timestamp stripping works rather than assuming it. Also confirmed switching conversation resets the match list (it holds DOM references into a thread that no longer exists), and that day dividers, delivery ticks and the attach button all still work afterwards. Both themes checked; zero console errors; brace, paren and tag balance clean; zero em dashes.

Nothing here needs a deploy or a migration: it is frontend only and ships as soon as it reaches `main`.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - delivery ticks frontend (B3/B4). Claim released.** B3/B4 is now complete end to end in code: the column, the webhook writer, and the UI.

Ticks use WhatsApp's own states and colours: grey `✓` sent, grey `✓✓` delivered, blue `✓✓` (#53bdeb) read, red `!` failed. Outbound only, since WhatsApp never ticks a message the customer sent.

**A null status renders NOTHING, and that is the important decision here.** The obvious choice is a pending clock, but the migration is not applied and the webhook is not deployed, so today every outbound row is permanently null - a clock would show every message in the CRM as forever unsent, which is far worse than the no-ticks state we have now. Rendering nothing degrades cleanly in both directions: nothing before that work lands, real ticks after, with no code change in between. The cost is that a message genuinely awaiting its first callback shows nothing for a second or two.

**A production hazard was found and defused while doing this.** The message query named its columns explicitly. Adding `delivery_status` to that list would make PostgREST fail the entire query until migration 20260806020000 is applied - and since Vercel deploys from `main` automatically, merging that would have **broken Conversations for every agent on live campaign traffic**, immediately, with no deploy step to catch it. Changed to `select('*')`, which makes the query indifferent to whether the column exists yet. Worth remembering as a general rule for this repo: naming a not-yet-migrated column in a frontend query is a live outage, not a staging problem.

**Ticks also update live, which needed more than rendering.** A tick arrives as an UPDATE to an existing row, not an INSERT, and `startConvRealtime` only ever subscribed to INSERTs - so ticks would have appeared only when a conversation was reopened, which defeats the point of a tick. Added an UPDATE subscription plus `applyDeliveryTickUpdate()`, which finds the bubble by `data-wamid` rather than by position, since the list re-renders and positions are not stable.

**Verified in demo mode:** the renderer against 9 cases (all four states, null, undefined, an unknown future status, and inbound rows for two different statuses - inbound correctly never ticks); real rendering in a demo conversation with computed colours confirmed as `rgb(83,189,235)` for read and `rgb(134,150,160)` for sent; both themes; and the live-update handler against 10 cases - each state advancing in turn, an inbound row ignored, an update for a different conversation ignored, a row with no wamid ignored, a null status clearing the tick, and never more than one tick element on a bubble. Demo conversations carry read/delivered/sent statuses so all states are visible without a database. Zero console errors, tag and brace balance clean, zero em dashes.

**UNVERIFIED:** no real tick has ever rendered. That needs the migration applied and `whatsapp-webhook` deployed, both on Muhammad's laptop. Until then this ships as a safe no-op: `select('*')` cannot fail, and a null status draws nothing.

**DONE, NOT DEPLOYED (2026-08-06, Junaid on the AYESHA laptop) - agents can attach a file to a WhatsApp reply.** Second of the two big parity gaps. Claim released.

A 📎 button and file picker in the Conversations input bar, a chip showing the picked file with name, size and a remove button, and `send-wa-message` extended to actually send it. JPG, PNG and PDF, 5MB cap. Caption optional, exactly like WhatsApp: an attachment with no caption is a valid message and gets a readable body (`[image sent]`, `[document sent: invoice.pdf]`) so the conversation and Comm Log never show a blank row.

**The design decision worth reviewing, because it is a tradeoff and not obviously right.** The file rides inside the JSON request to the edge function as base64, rather than the browser uploading to storage first. Uploading from the browser is the cleaner architecture, but it needs a storage RLS policy letting agents write to the bucket, which is a migration against the live database and this laptop cannot apply one. The base64 route needs no migration at all, so the feature ships on a single function deploy. The cost is the 5MB cap, since the whole file has to fit in one request body. **If larger files are ever wanted, the upgrade is: browser uploads straight to storage, sends only the path, and the function reads it with the service role** - the 5MB constant and this comment are the only things that change.

Other decisions: media is uploaded to Meta's `/media` endpoint and sent by id, because messages cannot carry media inline and the storage bucket is private, so a `link` would have to be publicly reachable. Our own copy goes into the existing `deposit-screenshots` bucket under an `outbound/` prefix - the bucket name is now a misnomer, but a second bucket means a migration, and the conversation renderer already resolves signed URLs from that one. Storing our copy is deliberately best-effort: if it fails the customer has still received the file, and failing the send over a lost thumbnail would be worse. Format list is deliberately narrow for a first version; anything else would still send as a document, but is not offered until someone asks.

**One real trap found and handled.** The legacy in-browser fallback (`sendWaViaBrowser`, used when the function is not deployed) can only send text. Left alone it would have sent the caption and silently dropped the file while showing "Message sent". It now refuses with a clear message instead, so an agent can never believe a file went when it did not.

**Verified in demo mode, all by driving the real handlers rather than reimplementing them:** 15 validation cases (JPG/PNG/PDF accepted, GIF/WEBP/DOCX/no-type rejected, empty file, exactly 5MB accepted, one byte over rejected, null); a real `File` through the actual picker `change` event producing the chip with correct icon, name and size; send with caption; send without caption for both PDF and image producing the right placeholder bodies; text-only send still working (no regression); an all-whitespace send correctly ignored; chip, picker, input and state all cleared after send; switching conversation dropping a pending file. Base64 round-trip is byte-identical including high bytes, with no `data:` prefix leaking. **The function's own size check was ported into the browser and run against real base64 at nine sizes including the 1/2/3/4-byte padding edges: it agrees exactly with the browser cap**, so a file the UI accepts cannot be rejected server-side for size. Zero console errors; tag balance, brace/paren balance and em dash count all clean.

Also fixed a small wart while testing: a file one byte over the limit formatted as "That file is 5.0 MB. The limit is 5 MB", which reads like a bug. Size in that message now rounds up.

**UNVERIFIED, and this is the important part:** **no file has ever actually been sent.** The Meta `/media` upload, the media message payload, the storage write and the resulting bubble have never run against anything real - there is no live Supabase or WhatsApp here, and `send-wa-message` is the live agent send path, so the deploy belongs on Muhammad's laptop with him present. The edge function is also **not type-checked** (still no `deno`/`node`/`tsc` on this machine). First real test should be one image and one PDF to a number Muhammad controls, checking the customer receives them, the bubble renders, and the stored copy resolves.

**DONE, NOT DEPLOYED (2026-08-06, Junaid on the AYESHA laptop) - inbound non-image media is no longer silently dropped.** The bug the parity audit turned up, fixed in `whatsapp-webhook` only. `index.html` untouched.

Before: anything that was not text, an image, or an interactive button/list reply hit `extractUserInput()` returning null, logged "Skipping unsupported message of type" and `continue`d. **No `communications` row was written**, so a voice note, PDF, video, sticker, location or contact card left no trace at all - the agent could not tell that a customer had sent anything.

Now: `recordUnsupportedMessage()` upserts the lead (which also flips `is_unread`, so the conversation surfaces under the Unread filter exactly like a normal inbound message) and writes one row with a readable placeholder from `describeUnsupportedMessage()` - `[voice note]`, `[document: receipt.pdf] my deposit`, `[location: HBL Bank DHA]`, `[contact card: Ali Raza]`, and `[unsupported message type: x]` as the catch-all so a future WhatsApp type still leaves a trace instead of vanishing. Captions are kept because they are real customer text, capped at 500 characters. `message.id` is stored as `wa_message_id`, so quote-reply works on these too.

**Deliberately not done, and worth knowing:** the media itself is **not downloaded or stored**. The agent sees that a voice note arrived, not the voice note. Storing it needs per-type handling in `downloadAndStoreMedia` plus bucket decisions, and is a bigger piece of work. Also nothing is sent to the customer and no agent is pinged - the existing image handler does both, but adding either here would be a new customer-facing or staff-facing send, which is not a decision this fix should make quietly. Messages of these types from a **staff** number are ignored rather than recorded, matching how the image branch already treats agents.

**Verified:** `describeUnsupportedMessage` was ported into the browser and run against 22 cases built from real Cloud API payload shapes - voice note versus audio file, document with and without filename and caption, video with and without caption, sticker, location by name / by address / by bare coordinates / empty, contact cards single, multiple and empty, template button replies with and without a label, an unknown type, a message with no `type` field, and a null message. All 22 passed, including the caption cap. Placeholder text was then rendered in the real Conversations UI in demo mode: reads clearly as an inbound bubble, no layout break, zero console errors. Braces, parens and brackets balanced; template literals even; zero em dashes.

**UNVERIFIED:** not type-checked (still no `deno`/`node`/`tsc` on this laptop), not deployed, and no real voice note or PDF has been through it. It changes nothing until `whatsapp-webhook` is deployed, which needs Muhammad's laptop with him present. **Deploy note: this and the B3/B4 delivery-tick change are now both sitting in the same undeployed file**, so one deploy ships both - and the B3/B4 migration must be applied first, per that entry.

**DONE (2026-08-06, Junaid on the AYESHA laptop) - WhatsApp feature-parity audit of Conversations.** Muhammad's question: "Have you added all of the features which we could see on WhatsApp?" Read-only: nothing was edited, no live data touched. Checked the Conversations markup and JS in `index.html`, the inbound handler in `whatsapp-webhook`, and the send path in `send-wa-message`, then confirmed the shell in demo mode at 1400x900.

**The framing that matters, and it is not obvious:** the CRM does not talk to WhatsApp the app, it talks to the **WhatsApp Cloud API**, which is a strictly smaller feature set. Several things Muhammad can see in his own WhatsApp are not "not built yet", they are not offered to any business integration at all. Sorting the gaps into buildable versus impossible is most of the value here, because otherwise the parity list reads as a backlog when part of it is a wall.

**The most serious finding, and it is not a missing button.** Any inbound message that is not text, an image, or an interactive button/list reply is **silently dropped**. `extractUserInput()` returns null, the webhook logs "Skipping unsupported message of type" and `continue`s, so **no `communications` row is ever written**. A customer sending a voice note, a PDF, a video, a sticker, a location or a contact card produces *nothing at all* in the inbox - the agent does not see a placeholder, does not see a filename, does not know a message arrived. Given this business asks leads for deposit screenshots, a customer sending a PDF receipt instead of an image is a plausible everyday case. This is a data-visibility bug, not a parity nicety, and it is the one item here worth fixing regardless of what else is decided.

**Present and verified:** conversation search; filter tabs (All / New / Unread / Warm / Hot / Converted); coloured initial avatars; last-message preview and timestamp; unread count badge on the sidebar; WhatsApp-styled bubbles with correct tails, per-message timestamps and consecutive-run grouping; quote-reply per message (the `↩` button, live path only - the demo branch renders a simpler bubble without it); inbound image rendering; the 24-hour window pill with live countdown (C2) and its warning banner; the contact info panel (D1, confirmed including the assign-agent dropdown from E1); Enter-to-send with Shift+Enter for newline; auto-growing input; realtime inbound messages; and a read receipt sent back to the customer so they get the blue ticks.

**Missing but buildable (Cloud API supports all of these):** delivery ticks (backend already written, see the B3/B4 entry, nothing renders yet); date separators such as Today / Yesterday, which is pure frontend and involves no API at all; **sending any attachment** - there is no attach control in the input bar and `send-wa-message` only ever sends `type: "text"`; receiving non-image media (the silent-drop bug above); reactions, which the API supports in both directions and neither side is built; an emoji picker; search within a single conversation; voice notes; and an outbound typing indicator, which newer API versions do offer.

**Buildable, but as CRM features rather than WhatsApp ones** - these are WhatsApp *app* conveniences with no API equivalent, so they would live in this CRM's own tables and would not sync anywhere: pin, archive and mute a conversation; star a message; manually mark a conversation unread; forward a message to another lead.

**Not possible through the Cloud API, at any effort:** group chats and Communities (already documented on the Broadcast Signal work); online and last-seen presence; seeing when a *customer* is typing; editing a message after sending; delete-for-everyone; status/stories; and voice or video calls. Worth stating plainly to Muhammad rather than leaving them on a wishlist. API capabilities do change, so this is a 2026-08-06 reading, not a permanent one.

**The gap the recent work created, worth deciding on:** C2 gave the inbox a live countdown to the 24-hour window closing, which is genuinely useful, but there is still no way to *act* on it from the inbox. Templates are the only thing WhatsApp accepts after that window, the CRM records template copy in Message Templates, and none of it can be sent from Conversations. So the timer now makes a limitation visible without offering the way out. Sending an approved template from the inbox is the natural completion of C2, and it is separately blocked on Meta approving at least one template.

**STATE OF JUNAID'S DELIVERY-TICKS WORK (B3/B4), checked 2026-08-06 from Muhammad's laptop - HALF-LANDED, read this before touching either half.**

Junaid built the backend (`6a16f2e`): the webhook now persists WhatsApp's status callbacks into a new `communications.delivery_status`, advancing only forwards (sent -> delivered -> read) with `failed` sticky, because Meta neither guarantees callback order nor sends each callback once. The reasoning in his migration and code is sound and I have no correction to make to it.

Where it actually stands:
- **Database: DONE.** `communications.delivery_status` and the partial `communications_wa_message_id_idx` were applied to the live project from Muhammad's laptop at the end of this session, and verified present.
- **Webhook: NOT DEPLOYED.** The deployed function is still **v70**, which does not contain `recordDeliveryStatus`. Junaid's laptop has no Supabase CLI, so he could not deploy it.
- **UI: NOT BUILT.** Nothing renders a tick yet. `renderContactPanel` and the message bubbles in `openConversation` are where it would go.

**The ordering matters and it is now safe in one direction only.** The column was applied first deliberately: with the column present and the old v70 webhook deployed, nothing changes at all. Deploying the webhook *before* the column would have meant every status callback erroring in the logs while looking like working software. That ordering hazard is now removed - a future deploy of the current repo source is safe.

To finish B3/B4, from Muhammad's laptop with him present, in a quiet hour (2am-7am PKT is roughly six times quieter than 1pm or 7pm on 30 days of real lead data): `supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`, then read the deployed source back down and diff it, then build the tick rendering. **Remember `--no-verify-jwt`** - the live function has `verify_jwt: false` and deploying without that flag re-enables JWT checks and breaks Meta's inbound webhook, which is live lead capture.

**Junaid also caught a real gap in my own work (`e1428a3`), and he was right.** I applied `profiles.phone` to the live database through the Supabase MCP tool, which records the migration remotely but does **not** write the file into the repo - so the migration file was missing and `schema.sql` still defined `profiles` without a phone column. Anyone rebuilding from `schema.sql` would have produced a database that `getAgentRotation()` and the Set/Edit Number button both depend on and that did not exist. He committed the missing file and fixed `schema.sql`. **Lesson for any future session: applying a migration through the MCP tool is only half the job - the file has to be committed too.** I did the same thing again this session with `20260806020000_communications_delivery_status`, except that file already existed in the repo because Junaid wrote it first.

**QUEUE FOR JUNAID - Muhammad's instruction 2026-08-06 was explicitly "I do not want him to sit idle", so keep this list stocked.** In priority order, none of these collide with the Conversations work:
1. **Production verification, still not done and still the biggest gap.** Everything shipped today was verified in demo mode on localhost only; this laptop has no CRM login and Junaid does. At crm.badartrader.com: the Bot Manager section, and the Conversations inbox against a **real** conversation in both themes - contact panel, the live 24-hour countdown, the assign-agent dropdown, and bubble width on a long bot message. **View only. Do not send, reply, assign or change anything in a real conversation.** Report, do not fix live.
2. **Create the two missing accounts** - Syed Bilal Ahmad Hashmi (`syedbilalahmadhashmi786@gmail.com`, `923325822756`) and Syed Faisal Shah (`syedfaisalbasit@gmail.com`, `923002731461`). Junaid's own hands, not his Claude - it needs a real password. Then set each number with the Set Number button in My Team.
3. **The WhatChimp export**, which blocks the whole import job Muhammad has asked for. He runs WhatChimp day to day, so it is his tool and his hands; his Claude must not log in. Needed: a screenshot of the export screens so the importer can be designed against what actually exists, then the files.
4. **Catalog D4, Labels** - free-form labels on a conversation, mirroring WhatChimp's Chat Actions panel. **Muhammad agreed this as the next Conversations feature**, so coordinate with whoever holds the Conversations claim before starting; the contact panel built today is where it belongs.
5. **The `converted_at` fix**, if not already done - `saveLeadDetail()` and `agentSaveStatus()` both let a lead be set to Converted without stamping `converted_at`, which only `approveConversion()` does.

**FOR JUNAID (assigned 2026-08-06 by Muhammad) - four items, none of which touch the Conversations section of `index.html`, which Muhammad's laptop has claimed.**

**1. Create the two missing Supabase Auth accounts. Junaid does this himself, not his Claude** - it requires setting a real password, which stays a human-only action. Supabase Dashboard -> Authentication -> Users -> Add User, leave User Metadata as `{}` for the default Agent role:
   - Syed Bilal Ahmad Hashmi - `syedbilalahmadhashmi786@gmail.com`
   - Syed Faisal Shah - `syedfaisalbasit@gmail.com`
   Then in the CRM, My Team -> Set Number, enter `923325822756` for Bilal and `923002731461` for Faisal. Until both steps are done, neither is recognised by the webhook, can receive escalation pings, or can be assigned leads.

**2. Verify today's deployed work on production, which no session has been able to do.** Everything shipped today was verified in demo mode only, because this laptop has no CRM login. Junaid does. At crm.badartrader.com: walk the new Bot Manager section (all seven primary tabs and their sub-tabs), then open the Omnichannel Inbox and check the WhatsApp restyle against a **real** conversation in both light and dark. Pay particular attention to bubble width on a long bot message - Muhammad has had to correct that twice before. **View only. Do not send, reply, assign, or change anything in a real conversation.** Report anything that looks wrong rather than fixing it live.

**3. Export whatever WhatChimp offers, so the import work can start.** Junaid runs WhatChimp day to day, so this is his own tool and his own hands - his Claude must not log in. Muhammad wants WhatChimp's existing data pulled into this CRM while the live campaign keeps running untouched. Needed: a screenshot of whatever export screens exist so we know what is actually available, then the exports themselves (subscribers/contacts, conversation history if it can be exported, and the dashboard counters). Reading and exporting is fine; changing anything in WhatChimp is not.

**4. Coding task, safe to give to his Claude - fix the `converted_at` reporting hole.** Found 2026-08-06 while explaining the lead status pipeline. `converted_at` is only ever stamped by `approveConversion()` (`index.html:5093`). But `saveLeadDetail()` (`index.html:5042`, `.update({ status, assigned_agent_id })`) and `agentSaveStatus()` (`index.html:5159`, `.update({ status })`) both let a lead be set straight to Converted from the dropdown without stamping it. Any future revenue or time-to-convert report would silently miss those leads. Nothing is broken today because no lead has reached Converted yet, so this is a good moment to fix it. Both functions should stamp `converted_at` when the status is moving *to* `converted` and it is not already set, and should leave it alone otherwise. Test in demo mode, check the console, and do not touch the Conversations section.

**DONE, NOT DEPLOYED (2026-08-06, Junaid on the AYESHA laptop) - delivery ticks (catalog B3/B4), BACKEND HALF ONLY.** `index.html` was not touched at all, verified with `git status` before committing - Muhammad's D1/C2 claim below names Junaid directly, and the tick rendering lives in exactly that markup.

**The job turned out to be much smaller than the earlier note assumed, because half of it already existed.** The webhook has always received Meta's status callbacks (`change.value.statuses`) and looped over them - it just logged them and acted only on `failed`, throwing the rest away. And the correlation key was already there: `communications.wa_message_id` has been populated on inbound (`message.id`) and outbound (`waData.messages[0].id` in `send-wa-message`) since Phase 13. So `send-wa-message` needed **no change at all** - the claim above over-scoped it. Only the state itself was missing.

Built: migration `20260806020000_communications_delivery_status.sql` adding `communications.delivery_status`, plus a partial index on `wa_message_id` (the status handler filters on it several times per outbound message, and `communications` grows with every message ever sent or received, so this would otherwise be a repeated full scan). And `recordDeliveryStatus()` in the webhook, called from the existing status loop.

**Two design decisions worth knowing, both about failing quietly:**
- **Statuses only ever move forward.** Meta does not guarantee callback order and re-sends them, so a late `delivered` arriving after `read` must not walk the tick backwards. The guard is expressed in the UPDATE's own WHERE clause (`.or(delivery_status.is.null,delivery_status.in.(...))`) rather than read-then-write, so two callbacks racing cannot both conclude they are the newer one. `failed` sits outside the ladder: it always wins, and because it is absent from `DELIVERY_RANK` it is sticky - nothing can overwrite it afterwards.
- **No CHECK constraint on the column, deliberately.** Meta has added status values before (`deleted`). A CHECK would turn an unrecognised value into a rejected UPDATE that fails silently in the logs while looking like working software. Instead the webhook ignores statuses it does not recognise, so an unknown value can never clobber a real `read`.

**Also fixed while here: `ai_agents` was a second instance of the same drift** as `profiles.phone` - applied to the live database on 2026-08-06, but never added to `schema.sql`. Backfilled as Phase 26; the new column is Phase 27.

**Verified:** the forward-only guard was exercised in the browser against 14 cases (out-of-order `delivered` after `read`, duplicate re-delivery, `failed` overwriting `read`, `failed` resisting both `delivered` and `read`, unknown `deleted` against every prior state). First run showed 1 failure that turned out to be a bug in the test harness, not the code - the no-write path was asserted to leave `null` when it actually leaves the row untouched; fixing the harness alone brought it to 14/14. Both new `schema.sql` phases were diffed against their migration files after normalising comments and whitespace, in both directions: identical. That check earned its place - it caught a `COMMENT ON COLUMN` present in the migration but missing from `schema.sql`, which would have made a rebuild subtly different. Webhook braces/parens/brackets balanced and template literals even; zero em dashes.

**UNVERIFIED, and the reasons are specific:**
- **The webhook was not type-checked.** This laptop has no `deno`, `node`, `npx`, `tsc` or `bun` - the logic was ported into the browser and tested there instead, which validates the decision logic but not the TypeScript. Worth a `deno check` from a machine that has it before deploying.
- **Not deployed, and no status callback has ever been written to a real row.** The webhook change does nothing until deployed, which needs Muhammad's laptop with him present. **The migration must be applied BEFORE the webhook is deployed** - deploying first means every status callback tries to write a column that does not exist, and `recordDeliveryStatus` logs an error for each one.
- **No tick renders anywhere yet.** That is the frontend half, blocked behind the D1/C2 claim.

**DONE (2026-08-06, AYESHA laptop) - closed the schema drift left behind by the `profiles.phone` work below.** Went looking for the next actionable to-do, pulled first (standing rule), and found the `20260806010000_profiles_phone` migration that the entry below says was "applied" does not exist in `supabase/migrations/`, and `schema.sql` still defined `profiles` with no `phone` column at all. The live database has the column; the repo did not describe it.

Why it matters rather than being cosmetic: both `getAgentRotation()` in the webhook (`select("id, full_name, phone")`) and the Set/Edit Number action in `index.html` (`update({ phone })`) depend on that column. Rebuild the database from `schema.sql` and the webhook's read fails, `getAgentRotation` logs and silently returns `AGENT_ROTATION_FALLBACK` - the exact hardcoded two-agent list that work existed to remove. Silent, and it looks like working software. This is the same drift that caused Phase 15 on 21 July, which is why `schema.sql` is supposed to stay a complete picture of the intended database.

Written now: `supabase/migrations/20260806010000_profiles_phone.sql` (idempotent `ADD COLUMN IF NOT EXISTS`, plus the two seed numbers matched on the same ids as `AGENT_ROTATION_FALLBACK`, guarded so a re-run can never overwrite a number since corrected in the UI), and `profiles.phone` added to `schema.sql` section 1 with a comment on what reads it.

**UNVERIFIED, and the reason matters:** this migration was reconstructed from what the entry below describes, **not** diffed against the live column - there are no database credentials and no Supabase CLI on this laptop. If the live column carries a length limit, default or constraint, the committed file is what needs correcting, not the database. Worth one check from a machine that can read the live schema.
**DONE (2026-08-06) - Conversations: contact panel (D1), live 24-hour window timer (C2), and assign-from-inbox (E1).** All three verified in demo mode at localhost:8744 and pushed to `main`, so all three are live on crm.badartrader.com.

- **D1** - a third column beside the chat, opened from an info button in the header, the way WhatsApp's contact pane works. Name, phone, status, source, assigned agent, email, lead created date, reply window, and a button through to the full lead record. Under 1100px it replaces the chat rather than squeezing three columns in; under 768px the same, via a rule that has to sit *after* the `list-collapsed` rule because they have identical specificity.
- **C2** - the 24-hour window is now visible while still open, not only after it shuts. Live `h:mm:ss` countdown in both the header and the contact panel, ticking every second to match how WhatChimp displays it, amber under two hours, red when closed. **When the window is closed the composer is disabled outright** with an explanation, so an agent cannot type out a reply Meta is going to reject. The pre-existing after-the-fact warning banner was kept.
- **E1** - an Assigned Agent dropdown in the contact panel, mirroring WhatChimp's Chat Actions panel. Agents see the owner as plain text, only admins get the dropdown, matching the permission rule used everywhere else in this CRM. Reassignment also writes a `lead_activity` note so a mid-conversation owner change is explainable later.

Fixed along the way: the chat header was clipping its Copy Link button once the pill and info button were added.

**NEXT TASK, agreed with Muhammad: catalog D4, Labels.** He first wrote "E1 and E4" and then corrected it to **D4** - free-form labels on a conversation, the way WhatChimp's Chat Actions panel has a Labels section. Not started. E4 (auto-assignment rules) was **not** requested.

**Where the Conversations work stands against WhatChimp's own right-hand panel**, from the screenshots Muhammad shared:

| WhatChimp Chat Actions | This CRM |
|---|---|
| Messaging Window countdown | **Built** (C2), and ours also disables the composer, which WhatChimp does not |
| Customer Snapshot | **Partly** - email, status, source, assigned agent, created date. Missing: Last Seen, Bot Name |
| Assigned Agent dropdown | **Built** (E1) |
| Labels | **Not built** - D4, agreed as next |
| Quick Actions: Pause Bot, Pause AI, Scheduled, Google Meet | Not built |
| Top strip: Customer Since, Last Seen, Language, Country, Timezone | Not built |
| Composer: attach, emoji, canned responses, voice note, translate | Not built - catalog C4, C5, C6 |

**The verification gap that matters most right now.** Everything shipped today was verified in **demo mode on localhost only**. This laptop has no CRM login, so nothing has been checked against real data on crm.badartrader.com. Junaid was asked to do exactly that (item 2 of his task list) and had not reported back by the end of this session. Until he does, treat today's Conversations and Bot Manager work as **deployed but not production-verified**. Particular thing to look at: bubble width on a long bot message, which Muhammad has had to correct twice before.

**Roster disagreement, unresolved and worth settling before any WhatChimp import.** WhatChimp's own User Manager lists four team members - Syed Faisal Shah, Syed Bilal Ahmed Hashmi, Hanzla, Ehsan Wazir - all active. This CRM has Hanzla and Ehsan active, Syed Hamza suspended, and no rows at all for Bilal or Faisal. Muhammad's decision on Hamza (2026-08-06): **leave him suspended, he will unsuspend once the CRM is complete.** His number is already set, so it is a one-click action in My Team whenever he wants it.

**INVESTIGATED, NOT STARTED (2026-08-06) - importing WhatChimp's existing data into this CRM.** Muhammad wants WhatChimp's existing contacts, conversations and dashboard numbers pulled into Supabase so real data exists here to test against, while the live WhatChimp campaign keeps running untouched. He drew the line explicitly: reading and exporting from WhatChimp is fine, altering anything there is not.

**The safety finding that shapes the design.** `leads` has an enabled AFTER INSERT trigger, `automation_lead_created`, which calls `fire_automation_event('lead_created', ...)` and fires a pg_net HTTP call to the `fire-automation` edge function on *every single insert*. Bulk-inserting a WhatChimp export of roughly a thousand contacts would fire roughly a thousand of those calls. Nothing would send today, because there are two independent brakes - the only `lead_created` rule ("Meta Lead Ads - welcome message") is `is_active = false`, and `fire-automation` has `AUTOMATION_ENABLED = false` - but relying on both holding during a bulk insert is exactly the kind of assumption that produced the 2026-08-03 incident, where `send-follow-ups` matched `trigger_status = 'new'` and targeted 39 real leads instead of one.

So any import must: disable `automation_lead_created` for the duration of the load and re-enable it after, land rows with a distinct `source` value (for example `whatchimp_import`) so they can always be told apart from live campaign leads and excluded from future automation, and be dry-run into a staging table first with a diff shown to Muhammad before anything touches `leads`. Also relevant: `follow_up_sequences` is currently empty, so there is no status-based sender to trip today, but that could change the moment someone adds a rule - which is another reason imported rows should not simply land as `status = 'new'` alongside real campaign leads.

Blocked on Muhammad: what WhatChimp can actually export, and the scope and dedup decisions. No Claude session is to log into WhatChimp to find out - the export is Muhammad's own action, and the file comes to Claude afterwards.

**DONE (2026-08-06) - agent phone numbers moved out of hardcoded webhook code into the database. Webhook now v70.** Muhammad reprioritised this ahead of D1/C2 after asking why WhatChimp wants agent phone numbers; answering that question surfaced this as a real gap.

The problem: `AGENT_ROTATION` was a code constant holding only Ehsan Wazir and Muhammad Hanzala. The webhook uses those numbers for three things - recognising an inbound message as staff rather than a customer, sending escalation pings, and round-robin assignment. Any other agent messaging the business number would have been created as a **lead**, could never receive an escalation ping, and was skipped by round-robin. `profiles` had no phone column at all.

Changes: new `profiles.phone` column (migration `20260806010000_profiles_phone`, applied) seeded with the two numbers that were hardcoded, so behaviour carried over unchanged; `getAgentRotation()` in the webhook reads active, non-suspended agents who have a phone, ordered by `created_at` for a stable rotation index, cached per function instance; the old hardcoded list is kept **only** as a fallback, because if the database read ever fails, degrading to two working agents beats the alternative of treating staff as new leads. A WhatsApp column plus a Set/Edit Number action was added to My Team and User Manager, with `normaliseAgentPhone()` accepting `+92...`, `0300...`, `0092...` or bare forms and showing the normalised result for confirmation before saving.

**One deliberate behaviour change worth knowing:** the old array order was [Ehsan, Hanzala]; the database order by `created_at` is [Hanzala, Ehsan]. With 120 leads the round-robin index is currently 1, so the next batch shifts from Hanzala to Ehsan. One-time, self-levelling, both agents active - flagged rather than hidden.

Verified: `deno check` shows the same 7 pre-existing errors as before the change, so it added none; `normaliseAgentPhone` unit-checked against 10 input formats in the browser, which caught a real bug of my own (`0092...` was dropping the country code) that was fixed before deploy; the demo-mode save path confirmed to normalise correctly and never touch the database; both team tables render 7 headers and 7 cells in both themes with no horizontal overflow; zero console errors. After deploy: version 70 ACTIVE, `verify_jwt` still false, deployed source byte-identical to the repo, all three reply gates still false, and GET/GET-bad-token/POST all answered correctly (403/403/200) against version 70 in the edge logs.

**UNVERIFIED:** no real agent message or real escalation has run through v70 yet - that needs live traffic. If an agent's message ever gets created as a lead, or an escalation ping goes to the wrong person, `getAgentRotation` is the first place to look.

**Still to do:** Bilal and Faisal have no `profiles` row yet, and Syed Hamza's row exists but is suspended with no number. Until each has a row and a number set, they remain invisible to all three mechanisms.

**DONE (2026-08-06) - `whatsapp-webhook` deployed to v69, closing the local-vs-deployed gap the 2026-08-05 entry flagged.** Run from Muhammad's laptop with Muhammad present, which is the condition the standing rule requires. This deploy flips no flags and enables no sends: `BOT_REPLIES_ENABLED`, `KEYWORD_REPLIES_ENABLED` and `AI_REPLIES_ENABLED` are all still false in the deployed code, verified by reading the source back down after the deploy, not by trusting the CLI's success message.

Checked before deploying: the live function was still v68 and still differed from the repo by exactly the `getOpenAIModel()` addition and the `model:` line, nothing else, so no live-only edit was at risk of being reverted. **One thing worth remembering for any future edge-function deploy: the live function has `verify_jwt: false`, and deploying without `--no-verify-jwt` would have turned JWT verification back on and broken Meta's inbound webhook calls entirely** - which is the live campaign's lead capture. The correct command is `supabase functions deploy whatsapp-webhook --no-verify-jwt --project-ref vfskqzgphrunjxquqpks`.

Verified after deploying: version 69, ACTIVE, `verify_jwt` still false, deployed source byte-identical to `supabase/functions/whatsapp-webhook/index.ts`, and the endpoint smoke-tested with two GETs (no params, and a deliberately wrong verify token) - both returned 403 Forbidden in ~1.3s with no boot error, and both show in the edge logs against version 69. The correct-token handshake was not exercised, since Meta only re-runs it on a config change and there was no reason to touch the live subscription.

`settings.openai_model` is already `gpt-5-mini` and a real OpenAI key is saved (both written 2026-08-05 from the AYESHA laptop), so the model picker is now genuinely wired end to end. **It still changes nothing for a real customer** - `tryAIReply()` is unreachable while `AI_REPLIES_ENABLED = false`. Turning that on remains a separate, deliberate decision.

**UNVERIFIED, deliberately:** no real inbound WhatsApp message has been observed through v69 yet, because that depends on a real customer messaging in. The function boots and routes correctly, but the first real lead-capture POST through the new version has not been watched. Worth a glance at the edge logs for a `POST | 200` on version 69 next session.

**DONE (2026-08-05) - "Train AI" renamed to "Bot Manager" (label only, matching WhatChimp's naming).** Muhammad asked to change the section name to match WhatChimp's own "Bot Manager" terminology. Confirmed scope first (label-only rename, not merging Create Flow/Follow-ups/Templates into it) before touching anything. Changed every user-visible occurrence: sidebar nav item, Dashboard quick-tile, the tab's own `<h3>` and page-header title (`adminTab`'s titles map), and the matching card title in the admin Guide tab. Left every internal identifier untouched on purpose - `data-tab="train-ai"`, `id="admin-tab-train-ai"`, `adminTab('train-ai')`, function names (`loadAiKb`, `submitAiKb`, `loadOpenAiSettings`, etc.), the `ai_knowledge_base` table - renaming those would be a much bigger, riskier refactor across many files for zero user-visible benefit. Verified in demo mode: sidebar, dashboard tile, tab header and page title all show "Bot Manager," zero console errors.

**DONE (2026-08-05) - Also flagged but declined: enabling real AI replies, and testing `AI_REPLIES_ENABLED` against a second (UAE) number.** Muhammad set up a real training campaign (bot_number labeled `+971 52 558 6541`, a previously-planned separate test number, not the live `3903` campaign) and asked to "start testing it" live. Declined per the standing rule (flag flips only from Muhammad's laptop, with him present) - and separately found a real technical reason the UAE-only framing wouldn't have been safe anyway: confirmed by grep that `whatsapp-webhook/index.ts` never references `bot_number` anywhere - `tryAIReply()` just picks whichever `ai_knowledge_base` row is most-recently active, with zero per-number scoping. Flipping the flag today would apply to whichever number is actually wired to the live webhook (documented elsewhere in this file as the real `3903` campaign number), not just the UAE one. Offered to build real bot-number scoping into `tryAIReply()` so that a future test could actually stay contained to one number - not done yet, no go-ahead given.

**DONE (2026-08-05) - Train AI: key masking + model picker, closing the gap vs. WhatChimp's own AI API Integration screen.** Muhammad sent a screenshot of WhatChimp's AI API Integration page (masked secret key with a show/hide eye icon, a model dropdown - gpt-4.1/4.1-mini/4.1-nano/gpt-5/5-mini/5-nano) and asked whether the CRM's new Train AI field matches it. It didn't: the key was plain text with no reveal toggle, and the webhook had `model: "gpt-4o-mini"` hardcoded with no way to change it - a visibly older model than what WhatChimp's own screenshot showed configured (`gpt-5-mini`). Closed both gaps:
- `openai-api-key` is now `type="password"` with a Show/Hide button (`toggleOpenAiKeyVisibility()`), matching WhatChimp's pattern.
- New Model dropdown (same option set as WhatChimp's screenshot) saved to a new `settings.openai_model` key alongside the API key.
- `whatsapp-webhook/index.ts` gained `getOpenAIModel()` (mirrors `getOpenAIKey()`), defaulting to `"gpt-4o-mini"` when unset so leaving the field alone changes nothing. `tryAIReply()` now uses `model` instead of the hardcoded string.

**Important gap to know about:** the webhook source change is **not deployed**. This laptop has no Supabase CLI installed (checked - `supabase` isn't on PATH), so the live `whatsapp-webhook` function still runs the old hardcoded `gpt-4o-mini` regardless of what gets saved in this new Model dropdown, until someone runs `supabase functions deploy whatsapp-webhook --no-verify-jwt` from a machine with the CLI set up. This is the same kind of local-vs-deployed gap flagged before elsewhere in this file - don't treat the model picker as live until that deploy happens and the source is re-downloaded to confirm it matches.

Verified in demo mode: password field masks input, Show/Hide toggle flips both the input type and button label correctly, model select defaults to `gpt-4o-mini`, changing it and saving returns the same demo-safe message as before, zero console errors. The webhook TypeScript change was reviewed by hand (no `deno`/`npx`/`esbuild` available on this laptop to parse-check it) - straightforward one-line addition mirroring the already-proven `getOpenAIKey()` shape, but flagging that it wasn't run through a type-checker before being committed.

**DONE (2026-08-05) - Train AI: added a real UI field for the OpenAI key, closing the one genuine coding gap in the 5 dashboard quick-tiles.** Muhammad asked what's remaining on the 5 dashboard quick-tiles (New Broadcast, Open Inbox, Create Flow, Train AI, Connect Channel). Checked the actual deployed-source logic rather than assuming from old notes: `tryKeywordReply()`, `tryAIReply()`, and `send-broadcast-signal`'s send path are all fully implemented already - every one of the 3 gated tiles is code-complete, blocked only on non-coding steps (Meta template approval, a WhatChimp double-reply check, an OpenAI key, and the actual flag flip + first real send, all restricted to Muhammad's laptop with him present per the standing rule).

The one real gap: saving `settings.openai_api_key` required pasting raw SQL in the Supabase editor, per the 2026-08-04 go-live checklist entry ("no UI field exists for this yet"). Added a proper field. New "AI Provider" card in the Train AI tab (`index.html`, above the existing prompt preview card) with an OpenAI API Key input and its own Save button, plus `loadOpenAiSettings()` / `saveOpenAiSettings()` following the exact same `settings` table upsert pattern `saveMetaSettings()` already uses (`key`/`value`/`updated_by`/`updated_at`, `onConflict: 'key'`). Wired into the tab switch alongside the existing `loadAiKb()` call. Unlike `saveMetaSettings()` (which has no demoMode branch at all), this one does - matches the safer pattern used everywhere else Muhammad and Junaid fixed that exact gap earlier this week.

This changes nothing at runtime: `AI_REPLIES_ENABLED` is still false, the webhook still doesn't call OpenAI. It only means the key can now be saved through the CRM's own UI instead of hand-written SQL, once Muhammad has a real key to put there.

Verified in demo mode: field renders correctly in the Train AI tab (both themes, styling inherited from existing `.card`/`input` rules), save path returns "Key saved. (demo - not written to a real database)" without touching a real table, zero console errors. The real-mode `sb.from('settings').upsert(...)` path is code-reviewed against `saveMetaSettings()`'s already-proven pattern, not live-tested - no live Supabase write was made this session.

**DONE (2026-08-05) - Full admin-tab-by-tab demo-mode walkthrough, found and fixed a sitewide dark-mode hover bug.** Muhammad asked to see the CRM interface, confirmed the right file (`index.html`) was open, then walked every admin tab in demo mode: Dashboard, All Leads, My Team, Meta Ads, Add Lead, Omnichannel Inbox (viewed only, no conversation touched), Comm Log, Reports, Automation, Create Flow, Train AI, Follow-ups, Templates, Appointments, Payroll, Broadcast Signal, Subscribers, AI Signals, User Permission, User Manager, Meta Integration, Notifications, Sites, Guide. Zero console errors across all of it.

Found a real bug while hovering a row in Appointments: text went nearly invisible. Root cause confirmed via computed styles - `tr:hover td { background: #f8fafc; }` (a light near-white background) was never scoped per theme, unlike every other rule in the dark-mode block, while `[data-theme="dark"] [style*="color:#0f172a"] { color: #f1f5f9 !important; }` flips the ~85 inline `color:#0f172a` text spots in the file to near-white on the assumption they always sit on a dark card. On hover, that assumption breaks: near-white text landed on the same rule's own near-white background, on every table in the app, in dark mode (the sitewide default), not just Appointments. Fixed with `[data-theme="dark"] tr:hover td { background: #16223a; }`, matching the existing dark-hover-surface color already used elsewhere (`th` background, `.account-menu` background). Verified: row text stays legible on hover in dark mode on both Appointments and All Leads, light mode hover unaffected (checked directly, no override added there), zero console errors.

**DONE (2026-08-04) - Role-based QA pass on the agent-facing "My Leads" view, following up on the admin-facing "All Leads" pass above.** Muhammad's explicit push: everything tested so far had been the admin's All Leads - My Leads is a different code path (`agent-leads-tbody`, `agent-lead-detail`, `initAgent()`) that had never been exercised this session. Manually switched a demo session into agent role (`currentProfile.role = 'agent'`) since `enterDemoMode()` only ever sets up the admin shell. Found and fixed 3 more real bugs, same root cause each time - a function with no `demoMode` branch at all, unlike its sibling that has one:

- **`loadAgentLeads()` had zero `demoMode` handling** - the entire My Leads tab was permanently stuck on "No leads assigned to you yet." in demo mode. Not a thrown error - RLS silently returns zero rows for the unauthenticated demo session, so nothing even logged to console. Fixed to mirror `loadAdminLeads()`'s existing demo branch.
- **`agentSaveStatus()` (an agent's own status-update button) had zero `demoMode` handling** - clicking it in demo mode fired a real Supabase call against a fake demo id and surfaced the raw Postgres error `invalid input syntax for type uuid: "dl3"` directly in the UI. This is arguably the single most common action an agent takes; if this had been demoed live it would have looked completely broken.
- **`logActivityStandalone()` (the sidebar's own Log Activity tab) had the identical gap**, same fix applied.

Found the second and third by grepping every onclick handler reachable from the agent shell for functions containing a real `sb.from`/`sb.storage` call with zero `demoMode` mentions - a systematic sweep, not reactive discovery - which also confirmed `addCommNote` and `deleteLeadRecord` are already correctly handled and needed no change.

**Also verified clean, no bugs**: all 5 lead-detail sub-tabs render and function correctly under the agent role, permission boundaries hold exactly as documented (no Delete Lead button, no KYC document upload/approve, no Financial Ledger transaction entry, no pending-approval banner ever shown to an agent even when a lead's status is `pending_approval`) - agents get read access plus their own status/notes/activity actions, nothing more. My Leads search (name/phone/email) matches expected results. Guide tab renders correctly. Both themes and 375px mobile checked on My Leads and the agent detail panel, zero console errors throughout.

**DONE (2026-08-04) - Full pre-client-demo QA pass of the entire Leads section (All Leads, lead detail panel, status/approval pipeline, Add Lead, CSV import), Muhammad's explicit request the night before a client demo: "test each and every single inch of my leads page... never come back unverified."** Every action exercised with real function calls in a real browser (not just read the code), console checked clean after each. Junaid was testing Dashboard in parallel on his own session. Found and fixed 6 real bugs, all committed and pushed:

1. **The lead detail panel (opened from every lead - the single most-used view in the CRM) had zero dark-mode CSS at all**, just hardcoded `background:#fff`. Now that dark is the sitewide default, this meant a plain white panel with dark-styled inputs floating inside it. Themed `.detail-panel`, `.detail-header`, `.detail-row`, `.detail-label`, `.subtabs`, `.subtab-btn`, `.section-h` to match `.card`'s existing dark pattern. Also added a `color:#555` catch-all (same architecture as the existing `color:#0f172a` one) after checking all 8 occurrences don't regress anywhere. All 5 sub-tabs (Overview, Financial Ledger, KYC/Compliance, Client Profile, Communications) verified in both themes. Commit `c2cbb6f`.
2. **`saveLeadDetail()` (admin's "Save Changes" button) never refreshed the open detail panel after saving** - moving a lead to Pending Approval and clicking Save updated the data and the leads table, but the approval banner and Approve/Reject buttons silently didn't appear until the panel was closed and reopened. Sibling functions (`agentSaveStatus`, `logFromDetail`) already correctly did this; only `saveLeadDetail` was missed. Fixed to match.
3. **`approveConversion()` and `rejectConversion()` had no `demoMode` branch at all**, unlike every other action in this panel - clicking Approve or Reject in demo mode fired a real Supabase call that silently failed with a raw error toast instead of the intended success message. If demoed to the client in demo mode, this would have looked broken on the spot. Added demoMode branches matching the established pattern.
4. **`addKycDocument()` and `reviewKycDocument()` had the same gap.** The former's "Add Document Record" form is always clickable in demo mode regardless of whether any documents exist, so it was reachable and broken; the latter is currently unreachable in demo (`kycRows` is always empty there) but fixed for consistency before real KYC documents ever exist. All four of these gaps found by grepping every onclick handler used in the detail panel for missing `demoMode` mentions, not by stumbling into each one individually. Commit `0f4c736` (bugs 2-4 plus the next item).
5. **The All Leads status filter dropdown was missing "Pending Approval"** as an option - every other status dropdown in the file had it, this one didn't, so there was no way to filter the list down to exactly what needs an admin's attention. Added.
6. **`.pending-approval-banner` had no `flex-wrap`** - on a real phone width the message text got squeezed into a column next to the two full-size Approve/Reject buttons, wrapping one word per line while the buttons stayed rigid beside it. Found testing the approval flow at 375px. Added `flex-wrap: wrap`, verified in both themes. Commit `e91c28a`.

**Also reviewed but found no bugs, verified clean**: All Leads filters (status/agent/source/needs-human, individually and combined) and search (name/phone/email) all match expected results exactly; Export CSV; every lead-detail sub-tab's save actions (notes, ledger, client profile); the full status pipeline including Lost from mid-pipeline; Add Lead's required-field validation, phone normalization, and round-robin auto-assign; CSV import's parsing (valid rows, quoted names, missing-name rows correctly skipped, empty phone handled), preview table, and the correct "Import works in live mode only" block on Confirm in demo mode; malformed-CSV error paths (no data rows, no name column) both give clear messages, not crashes.

**DONE (2026-08-04) - Reviewed Junaid's AI Signals real-analysis rebuild and full-codebase audit, added the one fix his audit flagged but correctly declined to make unilaterally, found two more legibility bugs live-testing AI Signals myself.**
- `fire-automation` was the one send-capable function with no `_ENABLED` kill-switch of its own (relied solely on zero active `automation_rules` rows). Muhammad confirmed adding one; added `AUTOMATION_ENABLED = false` matching the pattern every other send function already uses, deployed, verified byte-identical against the downloaded source. No behavior change today.
- Verified Junaid's claim that all reply-generating webhook flags are false by downloading the live deployed `whatsapp-webhook` source directly, not trusting the commit message - confirmed `BOT_REPLIES_ENABLED`, `KEYWORD_REPLIES_ENABLED`, `AI_REPLIES_ENABLED` all false. `ESCALATION_NOTIFICATIONS_ENABLED = true` is expected, that's an internal agent notification, not a customer-facing send.
- Live-tested AI Signals myself (real Generate Signal click, real Binance/gold-api.com network call, not just reading the code) - worked, produced a real SMA(5/20) crossover signal. Found a real bug while looking at it: the AI Signals result panel's four stat boxes (Pattern/R:R Ratio/Trend/Session) and Train AI's prompt preview both hardcode an always-light box with inline `color:#0f172a` text - correct on their own, but the global dark-mode catch-all rule (added earlier for the light-theme era, `[style*="color:#0f172a"] { color: #f1f5f9 !important }`) force-flips that text to near-white, making it unreadable against its own unchanged light background. Only surfaced now that dark is the sitewide default. Fixed with scoped ID-selector exceptions (`#ai-pattern`, `#ai-rr-display`, `#ai-trend`, `#ai-session`, `#akb-preview-pre`) that win on specificity regardless of source order - light mode untouched. Worth checking for the same pattern (`background:#f8fafc` + inline `color:#0f172a`) if any other always-light box surfaces illegible in dark mode going forward.

**DONE (2026-08-04) - Full Dashboard link/button/section audit after the dark-default flip above, Muhammad's request ("check if any of those is still malfunctioned").** Programmatically exercised all 5 quick-tiles, Export CSV, +Add Lead, and all 24 sidebar nav tabs (admin role) in demo mode - every one activates cleanly, zero console errors across the full sweep. Two real bugs found and fixed, both pre-existing (not caused by the theme flip, but only became reachable/relevant now that dark is default for everyone):
- `loadDashMetaAds()` left the "Loading campaign metrics..." message stuck forever whenever Meta wasn't connected (no token/account) or the fetch failed - it silently `return`ed without ever updating that text. Now updates to "Connect Meta Ads in Meta Integration to see performance" when unconfigured, or "Could not load Meta Ads metrics" on a genuine fetch error, instead of implying it's still loading indefinitely. This was already true in demo mode and would be true in production too if the Meta token ever expired.
- The five Meta Ads metric-value divs (Impressions/Clicks/Cost per Lead/Ad Spend/Leads) hardcoded `color:#cbd5e1` (correct for dark, illegible on light mode's white card) - a JS line was quietly patching this to `#0f172a` only after live data loaded, so the empty "--" placeholder state was already broken in light mode before this session. Removed the hardcoded inline colors entirely so they inherit `.card`'s already theme-aware default (`#334155` light / `#cbd5e1` dark via the existing `[data-theme="dark"] .card` rule) - correct in both themes now, verified by checking computed color in each. Committed `4e8392e`, merged clean with Junaid's concurrent AI Signals real-indicator work and his own bug-fix audit, pushed as `ca7a09c`.

**DONE (2026-08-04) - Navy/gold dark theme is now the sitewide default, Muhammad's explicit decision after reviewing a "Redesign Concept" artifact.** He originally asked about a full CRM visual overhaul matching that artifact (new sidebar sections, stat rings, a different IA); scoped down after discussion to: keep today's tabs/sidebar/IA exactly as they are, adopt the artifact's navy/gold color language as the default look. Turned out to need almost no new styling - the existing dark mode (toggle-based since the light redesign) already IS that navy/gold palette (`#0b1220`/`#0f172a`/`#111b2e` navy with `#d4a843` gold accents on active nav), already built out across every tab from earlier dark-mode passes (Train AI, Create Flow, Follow-ups, Message Templates, All Leads, Dashboard, etc). So this was a one-line default flip in `initTheme()`, not a rebuild: `saved || 'dark'` instead of `saved || (matchMedia(prefers-color-scheme) ? 'dark' : 'light')`. Anyone who has ever manually toggled theme keeps their own choice via `localStorage['bt-theme']`; only visitors with nothing saved get dark now - which means **every agent who has never touched the theme toggle will see their screen switch to dark on their next page load**, not something they opted into that session. Verified in demo mode with `localStorage` cleared (simulating a first-time visitor): Dashboard, Pipeline Overview chart, and All Leads table all render correctly in dark by default, zero console errors. Committed `92c0db4`, merged clean with Junaid's concurrent work, pushed as `9219c02`.

**Explicitly out of scope, not done, per the same conversation:** the rest of the "Redesign Concept" artifact - reorganized sidebar sections (Broadcasting, KYC Review, Transactions, Agents, Settings), the three-stat-ring header layout, and the side-by-side Lead Growth donut+trend composition. Two of the mockup's numbers also aren't backed by any real data in this CRM and were flagged rather than faked: a lead target/quota ("128/180") and SLA/first-response-time tracking ("SLA met under 15m") - neither concept exists anywhere in the schema today. If either is wanted for real, it needs new tracking built first, not just a UI number.

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

## 2026-08-04 (later still) - AI Signals made real; Train AI wired to a real webhook path; go-live checklist for Muhammad's laptop

**AI Signals replaced Math.random() with real technical analysis**, verified live against all 5 instruments in a real browser (not curl, not demo mode) - see the Section index entry below for the exact indicators and data sources (Binance for BTC/gold-via-PAXG, Frankfurter.app for FX). Can now honestly return "no clear signal."

**Train AI now has a real webhook integration, same "built, tested, switched off" shape as Create Flow's `KEYWORD_REPLIES_ENABLED`.** `whatsapp-webhook` gained `tryAIReply()`: reads the active `ai_knowledge_base` campaign, assembles the same prompt the tab's own preview shows, calls OpenAI's Chat Completions API, sends the reply. Checked after keyword replies (a specific rule match should win over an LLM's judgment call), falls through silently on any missing piece. New flag `AI_REPLIES_ENABLED = false`. OpenAI specifically because Badar's brother already has a real OpenAI key funding WhatChimp's AI Agent for this same number (see the 2026-08-02 entry) - reusing that provider keeps the prompt portable, not a new vendor guess. Deployed with all four webhook flags confirmed false first - zero behaviour change on this deploy.

**Full go-live checklist, in order, for whenever Muhammad sits down to actually turn any of this on. All of it needs his laptop and his presence, per the standing rule in this file - not something to do from Junaid's laptop, and not something to do piecemeal without him.**

1. **WhatChimp precondition (blocks Create Flow and Train AI both):** confirm WhatChimp's AI Agent and its own Keyword Replies are still off for the `3903` bot. If either is live, flipping `KEYWORD_REPLIES_ENABLED` or `AI_REPLIES_ENABLED` will double-reply to real customers. Two-minute check in the WhatChimp UI, same one the 2026-08-03 WhatChimp-decision entry already describes.
2. **Meta template approval (blocks Follow-ups and Broadcast Signal both):** submit and get approved at least one WhatsApp message template in Meta's WhatsApp Manager. Without this, sends to anyone outside the 24h customer-service window get rejected - which is most Follow-ups targets and nearly all Broadcast Signal subscribers.
3. **For Train AI specifically, also needed before `AI_REPLIES_ENABLED` can do anything:**
   - Save a real OpenAI API key to `settings.openai_api_key` (SQL Editor: `INSERT INTO public.settings (key, value) VALUES ('openai_api_key', 'sk-...') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;` - no UI field exists for this yet, deliberately not built ahead of the provider decision being confirmed).
   - Have an active row in `ai_knowledge_base` with a real system prompt - use the Train AI tab's own preview to read exactly what the AI would be told before turning it on.
4. **Flip the flag(s)** in the relevant edge function source (`FOLLOW_UPS_ENABLED`, `SIGNAL_BROADCAST_ENABLED`, `KEYWORD_REPLIES_ENABLED`, `AI_REPLIES_ENABLED` - each is its own switch, in `send-follow-ups`, `send-broadcast-signal`, and `whatsapp-webhook` respectively), redeploy that one function, and verify the flip actually landed by re-downloading the deployed source rather than trusting the deploy command's success message alone.
5. **Test with a real message before trusting it** - send one real WhatsApp message through whichever path was just enabled and confirm the reply actually arrives correctly, the same way `BOT_REPLIES_ENABLED` was originally verified.

None of this is a coding task at that point - it's account access, a business decision on template copy, and a deliberate, watched first real send.

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
- **Train AI** - system prompt plus knowledge notes per bot number, with a preview that assembles the exact instruction text an AI would receive, character and token counts, and warnings for paused, empty or oversized prompts. The webhook can now read the active campaign and call a real OpenAI model with it, but this is gated off by `AI_REPLIES_ENABLED = false` until an API key is saved and the WhatChimp precondition is checked.
- **Message Templates** - WhatsApp template copy and Meta approval status. Nothing is submitted to Meta from here; status is set by hand. Needed because WhatsApp blocks free-form replies more than 24h after a customer's last message.
- **Automation** - the older rules engine (trigger event to channel action). Predates the Part 3 work.

### Scheduling and audience (real)
- **Appointments** - book calls with prospects, overdue flagging, per-owner assignment. Visible to all staff.
- **Subscribers** - members of the signalling communities. Real table: adds, edits and CSV import all persist, de-duplicated by phone. Status starts Pending and becomes Active once membership is confirmed.

### Signals
- **Broadcast Signal** - real target group/subscriber counts and signal history. A real send path (`send-broadcast-signal`, individual DMs to each active subscriber - Cloud API cannot post into WhatsApp Communities at all) now exists but ships with `SIGNAL_BROADCAST_ENABLED = false`; going live almost certainly needs Meta template approval first since most subscribers are outside the 24h customer-service window.
- **AI Signals** - real technical analysis (SMA crossover, RSI, 20-period breakout/breakdown) against real historical price data (Binance for BTC/XAU-via-PAXG, Frankfurter.app ECB daily rates for FX pairs). Can honestly return "no clear signal." Win rate and signal history stay empty until signals are broadcast and outcomes tracked, which is not built.

### Admin and setup
- **User Manager** - promote, suspend and manage staff accounts.
- **User Permission** - honest reference of what Admin versus Agent can currently do. No granular per-feature toggles exist; the page says so.
- **Meta Integration** - WhatsApp Cloud API credentials and webhook URL.
- **Meta Ads** - campaign metrics from the ad account.
- **Notifications** - notification settings.
- **Sites** - links to the landing and form pages.
- **Guide** - in-app explanation of every section, for admins and agents separately.
