-- Phase 37 - manual_tier gains a real 'qualified' value (Muhammad, 2026-08-31)
--
-- computeLeadTier() used to lump status='qualified' (said yes to the $500
-- deposit, escalated, awaiting an admin's approval - not yet actually
-- converted) in with status='converted' under one tier, 'closed', whose
-- badge always reads "CONVERTED". A real qualified lead (Junaid's own test
-- number, caught live by Muhammad from a screenshot: account_balance still
-- $0, status still 'qualified') showed a green "Converted" badge it hadn't
-- earned. Split into its own tier, distinct from a genuine conversion - this
-- widens the CHECK constraint manual_tier is also bound by, so the new
-- "Qualified" option in the conversation header's tier picker can actually
-- be saved instead of being silently rejected by the database.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_manual_tier_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_manual_tier_check
  CHECK (manual_tier IS NULL OR manual_tier IN ('new','warm','hot','qualified','closed'));
