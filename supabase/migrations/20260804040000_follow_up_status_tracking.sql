-- Part 3: Follow-ups sender infrastructure (August 2026)
--
-- follow_up_sequences (Phase 20) already stores "when a lead sits in status
-- X for N hours, send this" rules, but nothing could ever read it: there was
-- no real "how long has this lead been in its current status" signal, and
-- no record of what was already sent. This migration adds both, so a
-- scheduled sender can be built on top without resending the same follow-up
-- every time it runs.
--
-- leads.updated_at is NOT usable for this - it's touched by ANY edit (a
-- note, a KYC change, anything), not just a status change, so it would make
-- follow-ups fire on the wrong schedule. status_changed_at tracks only real
-- status transitions.
--
-- Idempotent, and does not touch communications, conversations, or anything
-- the live ad campaigns produce.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows: best available guess is updated_at (falls back to
-- created_at), since the real transition time was never tracked before now.
UPDATE public.leads
  SET status_changed_at = COALESCE(updated_at, created_at, NOW())
  WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- Separate trigger from leads_updated_at (schema.sql Phase 1, §7) - both are
-- BEFORE UPDATE and Postgres chains them, so this is safe to add alongside
-- it rather than folding the logic into that shared trigger.
DROP TRIGGER IF EXISTS leads_status_changed_at ON public.leads;
CREATE TRIGGER leads_status_changed_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_status_changed_at();

CREATE INDEX IF NOT EXISTS leads_status_changed_at_idx
  ON public.leads (status, status_changed_at);

-- One row per (lead, sequence) marks a follow-up as attempted, whether it
-- sent successfully or failed - stops a permanently-broken phone number
-- from being retried every single cron run forever. status/error let the
-- sender explain what happened without needing to look at communications.
CREATE TABLE IF NOT EXISTS public.follow_up_sends (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id  UUID        NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error        TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS follow_up_sends_lead_sequence_key
  ON public.follow_up_sends (lead_id, sequence_id);

ALTER TABLE public.follow_up_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_up_sends: admin full access" ON public.follow_up_sends;
CREATE POLICY "follow_up_sends: admin full access" ON public.follow_up_sends
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
