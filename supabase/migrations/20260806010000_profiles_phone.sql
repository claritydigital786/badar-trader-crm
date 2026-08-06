-- Agent WhatsApp numbers on profiles (August 2026)
--
-- Backs getAgentRotation() in supabase/functions/whatsapp-webhook, plus the
-- WhatsApp column and Set/Edit Number action in My Team and User Manager.
--
-- Before this column existed the webhook held agent numbers in a code
-- constant (AGENT_ROTATION) listing only Ehsan Wazir and Muhammad Hanzala.
-- Those numbers decide three things: whether an inbound message is treated as
-- staff or as a new customer lead, who receives an escalation ping, and how
-- round-robin assignment splits leads. Any agent missing from that list was
-- invisible to all three.
--
-- RECONSTRUCTED 2026-08-06 from the AYESHA laptop. The column was applied to
-- the live database from Muhammad's laptop earlier the same day, but the
-- migration file was never committed, so supabase/migrations no longer
-- reproduced the live database and schema.sql did not describe it either.
-- This file closes that drift. It was NOT diffed against the live column
-- definition - there are no database credentials on this machine - so if the
-- live column differs (a length limit, a default, a constraint), this file is
-- what needs correcting, not the database.
--
-- Idempotent - safe to run more than once.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Seed the two numbers that used to be hardcoded, so behaviour carries over
-- unchanged. Matched on id against AGENT_ROTATION_FALLBACK in the webhook.
-- Only fills a number that is not already set, so re-running this can never
-- overwrite a number someone has since corrected in the UI.
UPDATE public.profiles
   SET phone = '923342224925'
 WHERE id = '9bfb2f92-658b-4868-90b9-dd041515d111'
   AND (phone IS NULL OR phone = '');

UPDATE public.profiles
   SET phone = '923235163874'
 WHERE id = '2bc20292-76bb-467b-a2a1-7bfa0cad4421'
   AND (phone IS NULL OR phone = '');
