# Badar Trader CRM

Lead-management CRM + WhatsApp lead-automation bot for Badar Trader (forex
signals). Static single-page frontend on Vercel, backed by Supabase (Postgres +
Auth + Edge Functions).

- **Live app:** https://crm.badartrader.com
- **Frontend:** static HTML/CSS/JS (no build step, no `package.json`). `index.html`
  is the CRM SPA; `join.html` / `thankyou.html` are the deposit-confirmation flow;
  `simulator.html`, `track-record.html`, `signal-desk.html`, `privacy.html` are
  supporting pages. Served by Vercel per `vercel.json`.
- **Backend:** Supabase project `vfskqzgphrunjxquqpks`
  (Postgres schema in `supabase/schema.sql`, Edge Functions in
  `supabase/functions/`).

## Runtime configuration lives in the database, not in `.env`

The single most important thing for anyone taking this over: **operational
configuration (API tokens, phone number IDs, IB links, admin numbers) is stored
in the Supabase `settings` table** (key/value), and read at request time by the
edge functions — it is **not** kept in a `.env` file in this repo.

Known `settings` keys include: `wa_access_token`, `wa_phone_number_id`,
`meta_token`, `meta_account_id`, `admin_whatsapp_number`, `gh_push_token`.

`.env.example` documents the variable **names** the system expects (no values).
`whatsapp-webhook` will use `WHATSAPP_*` env vars if present, otherwise it falls
back to the `settings` table. Supabase supplies `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` to functions as function secrets.

## Edge functions

Production/runtime functions are vendored under `supabase/functions/<name>/index.ts`.
`supabase/functions/DEPLOYED_FUNCTIONS.md` lists **every** function currently
deployed to the Supabase project (including one-off maintenance scripts that are
documented there rather than vendored).

## Scheduled jobs

`pg_cron` runs `nudge-agents` every 5 minutes (see the bottom of
`supabase/schema.sql`). Postgres triggers on `leads`/`transactions` call
`fire-automation` via `pg_net`.

## Secrets / handover hygiene

No customer data, secrets, or tokens are committed to this repo. Rotate
`gh_push_token`, `wa_access_token`, and `meta_token` on handover.
