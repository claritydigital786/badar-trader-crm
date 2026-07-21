-- Bot "Go Back" navigation support (added July 2026)
-- Tracks the stack of stages a lead has moved through so a mistaken tap can
-- be undone one step at a time instead of leaving the lead stuck or forcing
-- a full restart. Idempotent — safe to run more than once.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bot_stage_history TEXT[] NOT NULL DEFAULT '{}';
