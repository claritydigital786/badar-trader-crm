# Badar Trader CRM — Handoff

_Last updated: 2026-07-10, mid-session._

This is the current state of the WhatsApp lead-automation project: what's done, what's
live, what's blocked, and exactly what to do next.

---

## The product in one paragraph

A Meta Ads campaign drives people to WhatsApp number **+92 371 5773903**. A bot greets
them, offers Badar's **$250 Forex course FREE** in exchange for a **$500 deposit** into
an Exness or Do Prime account opened through Badar's IB referral link. The bot walks the
lead through broker choice → deposit → screenshot → verification form, then the lead lands
in the CRM dashboard (crm.badartrader.com) and, once verified, in Badar's **Premium
Signalling Group**. If the lead won't deposit, the bot falls back to a free-signals offer
instead of dropping them.

---

## ✅ Done and LIVE on crm.badartrader.com

All content edits below are deployed to production (served from Vercel, branch `main`)
and were verified against the live pages this session:

- **Offer is a flat $500** everywhere (was "$100–$500"). This is the lead's own trading
  capital, not a fee.
- **Referral codes shown without asterisks** — Exness `eatgh2cl7y`, Do Prime `45031`.
  (The simulator also now renders WhatsApp-style `*bold*` properly instead of literal
  asterisks.)
- **Course block** = "1 Month Mentorship Program", price removed, with Badar's benefits:
  12 Exclusive Sessions (1 month), Live Trading (1 month), WhatsApp access to Sir Badar,
  Psychological Mentorship + live-account road map, assignments checking, trading room,
  funded accounts for top performers.
- **IB-change flows rewritten** and professionally formatted with breathing space:
  - **Exness** — via Live Chat: type "IB Partner Code Change" → select Education/Signals →
    paste the Exness link → submit → share screenshot.
  - **Do Prime** — via email to `en.support@dooprime.com` (Cc `sadi.nor@dooprime.com`),
    subject "IB Change Request", body asks to shift the account under the Do Prime link →
    share screenshot.
- **Links section** redesigned — title "Team Badar — Zaroori Links", each link on its own
  block with a bold label and blank-line spacing (no more merged text).
- **"Premium options" section removed** from the menu — BUT the group is now named
  **"Premium Signalling Group"** throughout (menu button, join flow, FAQ). Only the old
  premium-vs-free options screen was dropped; the "Premium" wording stays.
- **Deposit-confirmation form** ([join.html](join.html)) → thank-you page → writes a
  converted lead + revenue (split by platform) into the dashboard.
- **Dashboard**: Meta ad spend in PKR, per-lead deposit platform + verified badges,
  revenue split Exness vs Do Prime.

## ✅ Backend that already works (verified this session)

- **Webhook + database are healthy end-to-end.** A simulated WhatsApp payload POSTed to
  the edge function instantly created a lead with the bot conversation started; the test
  record was then deleted. So the CRM side is proven.
- **3903 is registered on WhatsApp Cloud API** — status CONNECTED, verified name
  "Trade Campus", account mode LIVE, webhook pointing at the right URL.

---

## 🔴 Blocked / open items

### 1. Real WhatsApp messages don't reach the bot yet — TOP PRIORITY
Test messages sent to 3903 do **not** create leads, even though the webhook works when
called directly. Meta's health diagnostic (`/{phone_number_id}?fields=health_status`)
returned real account-level problems:

- **Payment method error on the WABA** (error 141006) — blocks business-initiated
  conversations. Fix in Meta Business Suite → Billing/Payment settings.
- **Display name not approved** — keeps messaging limits low (currently TIER_250).
- **Business verification not passed** (error 141010) — caps volume; fine for a demo,
  a problem at campaign scale.

**Most likely cause of the inbound failure:** the number may still have an old **WhatsApp
Business App** account living on it, catching the messages before Cloud API. **Action:**
confirm whether "Salam" test messages show up in anyone's WhatsApp Business App inbox for
3903 (ask Ehsan). If yes → that app account must be fully deleted and the number
re-registered on Cloud API. If no → check the "messages" webhook field subscription in
the Meta developer app.

Note: 3903 can **no longer** be used as a normal WhatsApp number — once on Cloud API it's
disconnected from the WhatsApp/Business apps entirely. All inbound goes only to the webhook.

### 2. Screenshot-receiving number is a placeholder
Because 3903 is now API-only and can't receive/show screenshots, the client is providing a
**separate number** for deposit screenshots (expected within a few hours as of this
session). Until then, [join.html](join.html) shows placeholder **`+92 3XX XXXXXXX`**.
**Action:** when the client sends the number, replace the placeholder in join.html (and
any bot message that tells the lead where to send the screenshot).

### 3. Bot function has 2 committed text tweaks not yet deployed to Supabase
On branch `feat/bot-human-handoff`, the edge function
[supabase/functions/whatsapp-webhook/index.ts](supabase/functions/whatsapp-webhook/index.ts)
has two committed changes (flat $500 in the fallback message; "Premium Signalling Group"
naming) that are **not yet deployed** to Supabase. Not urgent — the bot isn't receiving
messages anyway.
**Deploy blocker:** `npx supabase login` hits a macOS keychain popup asking for the Mac
login password, which isn't being accepted (keychain password likely out of sync with a
changed Mac login password).
**Clean workaround (no keychain):** generate a Supabase access token at
https://supabase.com/dashboard/account/tokens, then
`SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy whatsapp-webhook --no-verify-jwt`.

---

## Key facts & where things live

- **Production site:** https://crm.badartrader.com (Vercel, deploys from `main`).
- **Admin login:** syedbadartk@gmail.com (also claritydigitalllcus@gmail.com). Both admin.
- **Supabase project:** `vfskqzgphrunjxquqpks`. Secrets/tokens are stored in the
  `settings` table (Meta token, WABA id, phone number ids, verify token `badarcrm2026`).
- **Campaign number:** +92 371 5773903 (fixed — confirmed by Badar/Ehsan, do not change).
- **Signalling/community add number (manual step):** +971 50 262 9138.
- **Referral links:** Exness `https://one.exnesstrack.org/a/eatgh2cl7y` (code eatgh2cl7y);
  Do Prime `https://my.dooprime.com/links/go/45031` (code 45031).
- **Public simulator:** [simulator.html](simulator.html) — a browser demo of the exact bot
  flow. This is what to show Badar; it needs no WhatsApp connection.

## Demo script (works today, no WhatsApp needed)

Open the simulator, pick a language, walk the menu: Join Premium Signalling Group → pick a
broker → see the $500 + IB link + screenshot + form steps; Course Details → the 1-month
program; Links & Community → the clean links list. The real end-to-end WhatsApp demo waits
on the inbound-delivery fix (open item #1).
