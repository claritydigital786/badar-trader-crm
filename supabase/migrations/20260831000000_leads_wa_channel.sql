-- Phase 35 - Which real WhatsApp number a lead came in on (Muhammad, 2026-08-31)
--
-- Muhammad asked to bifurcate the Omnichannel Inbox into two views, one per
-- real WhatsApp number (6541, the main line with the automated bot; 3903, the
-- second, ingest-only line connected 2026-08-27). This was never possible
-- before today - upsertLead() in whatsapp-webhook never recorded which
-- number's webhook a message actually arrived on, and neither leads nor
-- communications carries anything to distinguish them after the fact.
--
-- Backfill is honest, not guessed: 3903 was only connected 2026-08-27, so any
-- WhatsApp lead created strictly before that date is definitively 6541 - it's
-- the only number that existed. Leads created on/after that date, with no
-- other stored signal to tell them apart, are left NULL (unattributed) rather
-- than assumed - the CRM shows these as their own honest bucket, not silently
-- folded into either number.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS wa_channel text
    CHECK (wa_channel IS NULL OR wa_channel IN ('6541', '3903'));

CREATE INDEX IF NOT EXISTS idx_leads_wa_channel ON public.leads(wa_channel);

UPDATE public.leads
SET wa_channel = '6541'
WHERE source = 'meta'
  AND wa_channel IS NULL
  AND created_at < '2026-08-27T00:00:00Z';
