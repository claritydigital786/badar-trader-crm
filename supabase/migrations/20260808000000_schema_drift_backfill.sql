-- Schema drift backfill (2026-08-08)
--
-- Closes the "schema drift" item that has been sitting in PROJECT_BLUEPRINT.md's
-- TO BUILD list: a table and six `leads` columns that live code writes to on every
-- run, but that no CREATE TABLE / ADD COLUMN in this repo ever defines. Anyone
-- rebuilding this project from `supabase/schema.sql` alone got a database where
-- the Comm Log tab, the deposit/conversion path and the bot's Go Back button all
-- fail on a missing relation or column.
--
-- IMPORTANT - what this migration is and is not:
--   * It is a NO-OP against the live database. Every statement is guarded
--     (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / a policy guard),
--     and all of these objects already exist live - proven by the fact that the
--     Comm Log tab reads rows, conversion-hook's error-checked update stamping
--     converted_at/verified/deposit_* succeeds, and the bot's Go Back works.
--   * It does NOT drop, rename, retype or re-permission anything. There is no
--     DROP in this file.
--
-- The definitions below are RECONSTRUCTED from every read and write site in the
-- codebase, not dumped from the live database (no session here has database
-- credentials). Column names, nullability and the type CHECK are certain; exact
-- live types (e.g. NUMERIC precision) and the live RLS policy text are not.
-- Whoever next has DB access should diff this against the real catalog and
-- correct this file if they differ - same caveat as 20260806010000_profiles_phone.

-- ── 1. communication_logs ────────────────────────────────────────────────
-- The manual/diagnostic log, distinct from `communications` (which is the real
-- WhatsApp message stream). It exists because `communications.type` only allows
-- email/whatsapp/call/sms, and this table needs 'note' as well - see the comments
-- in conversion-hook and submit-lead-form, both of which hit that constraint for
-- real before switching to this table.
--
-- Written by: conversion-hook, submit-lead-form, send-wa-message (send failures),
-- and index.html (addCommNote, plus the [SEND FAILED] path in sendConvMessage).
-- Read by: loadCommLog. Deleted by: the delete-lead cleanup loop, which relies on
-- ON DELETE CASCADE below.
CREATE TABLE IF NOT EXISTS public.communication_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('note','whatsapp','email','call','sms')),
  message    TEXT        NOT NULL,
  created_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- created_by is nullable on purpose: the three Edge Functions write rows with
-- created_by = null, because a public form submission or a server-side send
-- failure has no signed-in user behind it.
COMMENT ON COLUMN public.communication_logs.created_by IS
  'The staff member who logged this line, or NULL when it was written server-side by an Edge Function (public form submission, send failure) with no signed-in user.';

CREATE INDEX IF NOT EXISTS communication_logs_lead_created_idx
  ON public.communication_logs (lead_id, created_at DESC);

-- RLS: created ONLY if this table currently has no policies at all - i.e. on a
-- fresh rebuild from this repo. Against the live database, where policies already
-- exist, the whole block is skipped and nothing about access changes.
--
-- Why that guard rather than the DROP POLICY IF EXISTS + CREATE POLICY pattern
-- used elsewhere in schema.sql: those policies were written from the live
-- definitions. These were reconstructed from a code comment in index.html
-- ("admins see every lead's logs, agents only see logs for leads assigned to
-- them (comm_logs_agent_select_own)"), so overwriting the live policy set with a
-- reconstruction could silently widen or narrow who can read customer notes.
-- Creating them only where none exist cannot do that.
--
-- Note the shape below is the pre-Phase-15 agent-scoped model that the index.html
-- comment describes. Phase 15 widened `leads` and `communications` to "staff select
-- all"; whether that was ever extended to this table is UNVERIFIED. The narrower
-- reconstruction is the safer default for a rebuild.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communication_logs'
  ) THEN
    CREATE POLICY comm_logs_admin_all ON public.communication_logs
      FOR ALL USING (public.is_admin())
      WITH CHECK (public.is_admin());

    CREATE POLICY comm_logs_agent_select_own ON public.communication_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
        )
      );

    CREATE POLICY comm_logs_agent_insert_own ON public.communication_logs
      FOR INSERT WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
        )
      );

    -- Enabled last, so there is never a moment where RLS is on with no policies.
    ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ── 2. leads: the deposit / conversion / bot-history columns ─────────────
-- All six are written by live code and none is defined anywhere in this repo.

-- Stamped when a lead becomes converted. Written by conversion-hook and by
-- approveConversion in index.html. Nothing reads it yet - it exists so
-- time-to-conversion reporting is possible later without backfilling from
-- audit_log, which is exactly why the stamping hole is worth closing now
-- rather than after months of unstamped rows.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- false = the deposit was self-reported through the form but nobody has checked
-- the broker IB portal yet. An agent flips it true after confirming. Rendered in
-- the leads table as "verified / pending" next to the platform badge.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- Which broker the deposit went to. Deliberately NO CHECK constraint: the
-- accepted values live in conversion-hook's PLATFORMS array and have already
-- changed once (Do Prime was dropped from the bot in Phase 16), so pinning them
-- in the database would mean a migration every time that list moves.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deposit_platform TEXT;
COMMENT ON COLUMN public.leads.deposit_platform IS
  'Broker the deposit was made with, from conversion-hook PLATFORMS (exness, xm, dooprime, course_only, other). Historical rows may read "other" for XM deposits - see the 2026-08-08 conversion-hook fix.';

-- The self-reported deposit amount. NUMERIC(15,2) matches leads.account_balance,
-- which conversion-hook sets from the same value.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(15,2);

-- The broker account number / "Broker ID" from the public forms. Already
-- referenced by name in the Phase 9 comment in schema.sql, which is what makes
-- its absence from the schema an oversight rather than a decision.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deposit_account_ref TEXT;

-- The bot's Go Back stack. This one DOES have a migration
-- (20260721000000_bot_back_navigation.sql) but was never written back into
-- schema.sql, so a rebuild from that file alone produces a database where every
-- advanceStage() write in whatsapp-webhook fails on a missing column.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_stage_history TEXT[] NOT NULL DEFAULT '{}';
