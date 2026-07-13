# WhatsApp Webhook — Supabase Edge Function

Runs the lead-qualification bot for the Badar Trader CRM: greets new leads on
WhatsApp, asks broker choice / trader experience / $500 deposit confirmation,
sends the broker signup link on success (or falls back to the free-signals
offer on decline), and marks qualified leads in the CRM.

---

## Deploy

```bash
# 1. Link your Supabase project (one-time)
supabase link --project-ref vfskqzgphrunjxquqpks

# 2. Deploy the function (skip JWT auth — Meta signs requests differently)
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

---

## Environment Variables

Set these in **Supabase Dashboard → Settings → Edge Functions → Manage secrets**:

| Variable | Where to get it |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Any secret string you choose — copy it into Meta Developer App → WhatsApp → Configuration → Verify Token |
| `WHATSAPP_ACCESS_TOKEN` | Business Settings → System Users → Crmbot → Generate token (needs `whatsapp_business_messaging` + `whatsapp_business_management`) |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Manager → Trade Campus → Phone numbers → the lead-gen number (+92 371 5773903) → Phone Number ID, once verified |
| `SUPABASE_URL` | Auto-injected by Supabase (no action needed) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` key (keep this secret) |

> If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` are missing, the
> function still records inbound leads/messages — it just skips sending any
> reply and logs a warning instead of crashing.

---

## Meta Developer Portal Setup

1. Go to **Meta Developer App → WhatsApp → Configuration → Webhooks**
2. **Webhook URL:**
   ```
   https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/whatsapp-webhook
   ```
3. **Verify Token:** paste the value you set for `WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and Save**
5. Subscribe to the **messages** field under Webhook Fields

---

## What it does

- **GET** — responds to Meta's verification handshake (returns `hub.challenge`)
- **POST** — parses inbound text/button messages, then:
  - Creates a new lead in `leads` (source = `meta`, status = `new`) if no lead with that phone number exists
  - Inserts an inbound record into `communications`
  - Drives the qualification bot based on `leads.bot_stage`:
    1. Broker choice (Exness / Do Prime)
    2. New vs. experienced trader (new traders are also asked "traded before?")
    3. $500 deposit confirmation
    4. **Yes** → sends broker signup link + referral code, sets `status = 'qualified'`, writes a summary row to `communications` for the CRM dashboard
    5. **No** → sends the free-signals fallback offer instead of dropping the lead
  - Always returns HTTP 200 so Meta does not retry

---

## Schema dependency

Requires Phase 1 + Phase 3 + Phase 4 schema to be applied (`leads`, `communications`,
and the bot-tracking columns: `bot_stage`, `broker_choice`, `trader_experience`,
`ready_to_deposit`). Run `schema.sql` in the Supabase SQL Editor before deploying
this function.
