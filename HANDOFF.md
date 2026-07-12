# Badar Trader CRM — Handoff

_Last updated: 2026-07-13, end of session._

This replaces the previous handoff doc, which was stale (dated 2026-07-10 and describing
version 7 of the webhook — the live one is now version 27+). Everything below was verified
against the live Supabase project and the actual deployed code, not assumed from memory.

---

## The product in one paragraph

A Meta Ads campaign drives people to WhatsApp number **+92 371 5773903**. A bot greets
them, asks their language, shows a main menu, then walks qualifying leads through broker
choice → trading experience → a **$500 account balance** requirement (Exness or Do Prime)
in exchange for Badar's **Premium Signals Group + a $250 Forex course, both free**. New
leads round-robin to two agents (Ehsan, Hanzala), who get a tappable WhatsApp reminder that
repeats every 5 minutes until acknowledged. Deposit screenshots sent back to the bot are now
received, stored, and shown in the CRM. Everything is live on branch
`feat/bot-human-handoff` (14 commits ahead of `main`, not yet merged).

---

## ✅ Done and verified live this session

- **Schema/code drift fixed**: the live DB's `bot_stage` constraint was missing values the
  deployed bot actually used (`awaiting_language`, `awaiting_menu`) — this was a real,
  silent production bug, not a hypothetical. Fixed and migrated live.
- **Language/main-menu bot flow** — deployed, confirmed working with real lead
  conversations end to end (language → menu → broker → experience → deposit → qualified).
- **Round-robin agent assignment**: Ehsan Wazir + Muhammad Hanzala only (Syed Hamza removed
  from rotation and his CRM login suspended, per Badar's request). Batch size raised from 5
  to 10 consecutive leads per agent.
- **Agent ping is non-blocking**: previously a slow/failed agent notification could delay
  the customer's own greeting; now fired via `EdgeRuntime.waitUntil` and never blocks it.
- **Agent pings contain no lead PII** (name/phone) — just "a lead is waiting," per Badar's
  explicit instruction. Agents check the CRM for details.
- **Repeat-until-acknowledged reminders**: the round-robin ping is now a tappable "✅ I've
  got this" button. `nudge-agents` (new Edge Function, cron every 5 min via pg_cron) re-pings
  the assigned agent until they tap it, and broadcasts to the rest of the team + admin once
  after 3 unanswered pings (15 min).
- **Deposit screenshots now work.** Previously the bot asked customers to send a screenshot
  and then silently dropped every image message it received — no ack, no CRM record, no
  agent notified. Now: downloaded from Meta, stored in a private `deposit-screenshots`
  bucket, logged against the lead with a **View** button in the CRM's Communications tab,
  customer gets an ack, assigned agent gets notified.
- **KYC document file upload** — real Supabase Storage upload/download replacing the old
  "notes as file reference" placeholder, with a **View** button in the KYC tab.
- **Real bull/arrow favicon** — replaced the placeholder SVG with the actual logo.
- **CRM conversation tier filter tabs** (All/New/Unread/Warm/Hot/Closed).
- **Meta app published** — was stuck in "Development" mode; confirmed via Meta for
  Developers dashboard and published to Live.
- **Repo cleanup**: removed a stray nested duplicate git repo (including an accidental
  gitlink commit), an unused/undeployed `lead-capture` function, and a stale draft message
  file that had a plaintext CRM password in it.

---

## 🔴 Open items

### 1. Branch not merged to `main`
`feat/bot-human-handoff` is 14 commits ahead of `main`, fully deployed and tested live, but
never merged/PR'd. Worth doing now that it's proven stable.

### 2. Automation rules don't actually send anything
The CRM's Automation tab (rules: trigger event → channel → template) is pure CRUD today.
Nothing listens for real events (`lead_created`, `status_changed`, `kyc_verified`,
`deposit_recorded`) and fires a rule — the only way to "see" a rule work is the ▶ Test
button, which just simulates against a fake lead and logs to console. To make this real,
two things are needed: (a) Twilio (SMS) / SendGrid (email) credentials — WhatsApp can reuse
the bot's existing Cloud API creds — and (b) actual trigger-firing code, which doesn't
exist yet in any form.

### 3. Ad creatives — copy finalized, images not yet generated
Five Meta ad creative prompts are finalized (Batch 24, "Forex Mastery Programme" as the
course name, leads with the Premium Signals Group + free course offer, "$500 in your
account" instead of "deposit" so it also covers traders already on Exness/Do Prime, no em
dashes, footer stripped to logo only, "FREE" as an enlarged badge). Muhammad still needs to
run these through an image generator and confirm the results look right — the last one
tested was creative #5 (Scarcity/Batch 24 angle); #1–#4 haven't been re-tested with the
latest fixes (no dashes, stripped footer, short CTA + small qualifier line under it).

---

## Key facts & where things live

- **Production site:** https://crm.badartrader.com (Vercel, deploys from `main`).
- **Supabase project:** `vfskqzgphrunjxquqpks`. WhatsApp credentials live in the
  `public.settings` table (`wa_access_token`, `wa_phone_number_id`) — not Edge Function
  secrets, though the secrets are also kept updated as a fallback.
- **Campaign number:** +92 371 5773903 — live, registered, webhooks subscribed, Meta app
  published (Live mode).
- **Agents:** Ehsan Wazir, Muhammad Hanzala. Syed Hamza removed/suspended.
- **Referral links:** Exness `https://one.exnesstrack.org/a/eatgh2cl7y` (code eatgh2cl7y);
  Do Prime `https://my.dooprime.com/links/go/45031` (code 45031).
- **Public simulator:** [simulator.html](simulator.html) — browser demo of the bot flow,
  kept in sync with the live webhook copy.
- **Storage buckets:** `kyc-documents`, `deposit-screenshots` — both private, admin full
  access + agent read-only for their own assigned leads.
- **Cron job:** `nudge-agents-every-5-min` (pg_cron + pg_net), fires `nudge-agents` Edge
  Function every 5 minutes.

## Demo script (no WhatsApp needed)

Open [simulator.html](simulator.html): pick a language, walk the main menu → Start Trading
→ pick a broker → trading experience → the $500 requirement → see the Premium Signals
Group + free course confirmation. Matches the live bot's copy exactly.
