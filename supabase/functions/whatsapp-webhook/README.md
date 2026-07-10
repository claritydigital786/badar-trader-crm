# WhatsApp Webhook — Supabase Edge Function

Handles inbound WhatsApp Cloud API messages for the Badar Trader CRM.

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
| `SUPABASE_URL` | Auto-injected by Supabase (no action needed) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` key (keep this secret) |

> `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are needed only when
> **sending** outbound messages (not yet implemented). Add them later when
> Badar provides the credentials from the Meta Developer Portal.

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
- **POST** — parses inbound text messages, then:
  - Creates a new lead in `leads` (source = `whatsapp`, status = `new`) if no lead with that phone number exists
  - Inserts an inbound record into `communications` (type = `whatsapp`, direction = `inbound`)
  - Always returns HTTP 200 so Meta does not retry

---

## Schema dependency

Requires Phase 1 + Phase 3 schema to be applied (`leads` and `communications` tables).
Run `schema.sql` in the Supabase SQL Editor before deploying this function.
