-- Some staff need a CRM login and full visibility without being handed leads.
-- Suspending them was the only lever before, but a suspended account is locked
-- out entirely, which is the wrong tool for an observer (Syed Hamza, social
-- media manager, Muhammad 2026-08-22). Defaults to true so every existing agent
-- keeps behaving exactly as it does today.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS receives_leads BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.receives_leads IS
  'When false, this person is skipped by round-robin lead assignment but keeps normal access. For observers and non-sales staff.';
