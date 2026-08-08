-- Box 3 restructure: new "already have an account vs first time" bot stage
-- (August 2026). The funnel now asks, right after the main menu, whether the
-- customer already has a live Exness/XM account. An existing holder skips the
-- experience/traded-before questions and goes straight to deposit confirmation.
--
-- Two new bot_stage values back this:
--   awaiting_trader_status   - the new question (BOX 3)
--   awaiting_broker_existing - broker choice for an existing account holder
--                              (BOX 3B), which advances straight to deposit
--
-- leads.bot_stage carries a CHECK constraint listing the allowed stages, so
-- these two names MUST be added here BEFORE the whatsapp-webhook is deployed.
-- Deploying the new webhook first would make the very first "Start Trading"
-- tap throw a constraint violation and break the live bot flow - the same
-- apply-migration-first ordering the delivery_status column needed.
--
-- Idempotent: DROP ... IF EXISTS then ADD, matching the existing pattern in
-- schema.sql (which widened this same constraint for the language/menu step
-- and broker_choice for 'both'). The DROP assumes Postgres's default
-- auto-generated constraint name (leads_bot_stage_check); if it differs, find
-- the real name first:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
--     AND conname LIKE '%bot_stage%';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_bot_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_bot_stage_check
  CHECK (bot_stage IN (
    'awaiting_language',
    'awaiting_menu',
    'awaiting_trader_status',
    'awaiting_broker',
    'awaiting_broker_existing',
    'awaiting_experience',
    'awaiting_traded_before',
    'awaiting_deposit_confirm',
    'qualified',
    'declined'
  ));
