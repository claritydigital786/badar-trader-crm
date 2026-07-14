-- Bot → human handoff support (added July 2026)
-- Adds the columns the whatsapp-webhook needs to count failed attempts per step
-- and flag a lead for a human agent. Idempotent — safe to run more than once.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS retry_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_human    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT;

-- Fast lookup for the "Needs Human" queue in the CRM.
CREATE INDEX IF NOT EXISTS idx_leads_needs_human
  ON public.leads (needs_human)
  WHERE needs_human = TRUE;
