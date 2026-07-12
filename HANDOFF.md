# Badar Trader CRM — Handoff

_Last updated: 2026-07-10, late night._

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

## 🎉 BIG WIN THIS SESSION — inbound WhatsApp → CRM is finally working

Real WhatsApp messages sent to **+92 371 5773903** now land in the `leads` table. Confirmed
with multiple real test messages from different phones (not simulated payloads — actual
WhatsApp texts). This was broken for days; root cause and fix below.

### Root cause (the actual bug, in order of discovery)

1. **+92 371 5773903 lived on a completely different Meta Business Manager** ("Trade
   Campus", WABA `1342908727797643`) than the one running the CRM's webhook app
   ("Badar Trader CRM" app, subscribed to WABAs under the "Badar Trader" business).
   Two separate Meta assets, same person, never linked. No webhook call could ever reach
   Supabase for messages sent to that number.
2. **Fix:** deleted the number from Trade Campus's WABA entirely (WhatsApp Manager →
   Phone numbers → trash icon → confirm with password), then re-added it fresh under the
   **Badar Trader** business's WABA (`1697502401503391`) via the Meta app's own
   "Add phone number" flow → OTP verification → **Register** step (6-digit PIN) →
   confirmed **"Subscribe webhooks"** toggle is ON for that WABA.
3. New Phone Number ID for 3903 under its new home: **`1150847781454379`**.

### A second landmine: the deployed function doesn't read secrets the way this repo's code implies

The `whatsapp-webhook` function's code **as deployed on Supabase** ("v10", visible in the
dashboard's Code tab) is **not the same file** as
[supabase/functions/whatsapp-webhook/index.ts](supabase/functions/whatsapp-webhook/index.ts)
in this repo. The deployed version reads its config from the **`settings` Postgres table**
(via a `getSetting(sb, key)` helper), not from Edge Function secrets/env vars. This repo's
local file is stale and does not match production — worth reconciling later (pull the real
deployed source into git so they don't keep diverging).

Config keys that matter, all in `public.settings` (key/value rows):
- `wa_phone_number_id` — **just corrected to `1150847781454379`**. It was pointing at the
  old, deleted Trade Campus phone number ID and silently failing every outbound send.
- `wa_access_token` — Meta System User token; **may not have permission on the new
  WABA (`1697502401503391`)** — see open item #1 below.
- `wa_campaign_number`, `wa_phone_number_alt`, `wa_2fa_pin`, `wa_2fa_pin_pk`,
  `meta_waba_id`, `meta_account_id`, `meta_pixel_id`, `meta_token`, `admin_whatsapp_number`,
  `lead_whatsapp_number` — other config the same table holds; not touched this session
  except where noted.

We also updated the Supabase Edge Function **secret** `WHATSAPP_PHONE_NUMBER_ID` to the
new ID as a first attempt, before discovering it's the `settings` table (not secrets) that
the live function actually reads. Leaving the secret updated too doesn't hurt, but it is
not what fixed anything — the `settings` table row is what matters.

---

## 🔴 Open items

### 1. Outbound bot replies still failing — TOP PRIORITY
Inbound works (leads land in the CRM). Outbound (the bot's automated reply — broker choice
buttons, etc.) still fails. Latest error in Edge Function logs after fixing the phone
number ID:
```
send failed 400 {"error":{"message":"Unsupported post request. Object with ID
'1150847781454379' does not exist, cannot be loaded du[e to missing permissions?]"}}
```
The ID is now correct, so this reads like a **permissions problem on `wa_access_token`** —
the token was very likely generated/scoped against the old WABA and doesn't have
`whatsapp_business_messaging` on the new one (`1697502401503391`).
**Next step:** in Meta Business Suite → System Users → the system user behind this token
→ regenerate/re-scope a token with `whatsapp_business_messaging` +
`whatsapp_business_management` explicitly including WABA `1697502401503391` → update
`settings.wa_access_token` with the new value → send a fresh test message → confirm the
bot's welcome + broker-choice buttons actually arrive on WhatsApp.

### 2. Meta app is still in "Development" mode
The "Badar Trader CRM" Meta app (ID `4639983159657359`) shows **Mode: In development**,
not Live. This can restrict who can message the number in some configurations. Worth
checking App Review / Go Live requirements before the real ad campaign scales up, even
though it hasn't blocked the tests done so far.

### 3. Screenshot-receiving number is a placeholder
3903 is API-only now and can't show incoming images in a normal chat UI, so a **separate
number** was expected from the client for deposit screenshots. Until provided,
[join.html](join.html) shows placeholder **`+92 3XX XXXXXXX`**. Replace once received.

### 4. This repo's webhook source is out of sync with the deployed version
As noted above, the deployed Supabase function is a newer/different version than what's
committed here. Before making any further code changes to the bot, pull the real deployed
source (Supabase dashboard → Edge Functions → whatsapp-webhook → Code → copy) into this
repo so `git` reflects reality.

---

## Key facts & where things live

- **Production site:** https://crm.badartrader.com (Vercel, deploys from `main`).
- **Admin login:** syedbadartk@gmail.com (also claritydigitalllcus@gmail.com). Both admin.
- **Supabase project:** `vfskqzgphrunjxquqpks`. Live config (tokens, WABA/phone IDs, PINs)
  lives in the `public.settings` table — **not** Edge Function secrets.
- **Campaign number:** +92 371 5773903, now correctly registered under the **Badar
  Trader** business's WABA `1697502401503391`, Phone Number ID `1150847781454379`,
  status Registered, webhooks subscribed.
- **Old/retired WABA:** "Trade Campus" (`1342908727797643`) — 3903 fully removed from it;
  that WABA now only holds its other UAE number.
- **Signalling/community add number (manual step):** +971 50 262 9138.
- **Referral links:** Exness `https://one.exnesstrack.org/a/eatgh2cl7y` (code eatgh2cl7y);
  Do Prime `https://my.dooprime.com/links/go/45031` (code 45031).
- **Public simulator:** [simulator.html](simulator.html) — a browser demo of the exact bot
  flow, needs no WhatsApp connection.

## Demo script (works today, no WhatsApp needed)

Open the simulator, pick a language, walk the menu: Join Premium Signalling Group → pick a
broker → see the $500 + IB link + screenshot + form steps; Course Details → the 1-month
program; Links & Community → the clean links list. The full real WhatsApp demo (inbound +
bot reply) waits on open item #1 (access token permissions).
