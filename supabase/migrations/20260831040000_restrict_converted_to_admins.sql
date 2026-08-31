-- Phase 38 - Converted is a verified business outcome, not a tier anyone picks
-- (Muhammad, 2026-08-31)
--
-- Before this, any agent could mark any lead assigned to them Converted: the
-- Inbox tier picker and the lead-detail Status dropdown both offered it to
-- everyone, `leads: agent update own` allows an agent every column on their
-- own leads, and the manual_tier CHECK accepts 'closed' from anybody. So
-- "Converted" could mean nothing more than a lead saying yes on WhatsApp.
--
-- The approved rule:
--   * Converted means leads.status = 'converted', reached through a real
--     verification process. It is never a manual classification.
--   * Agents classify up to Qualified and may not move a lead INTO Converted
--     or OUT of it.
--   * Admins and trusted service-role paths may, where appropriate.
--   * manual_tier = 'closed' is retired as a way to express conversion. The
--     value stays in the CHECK constraint (0 rows use it in production, so
--     dropping it would be migration risk for no gain) but no UI writes it and
--     computeLeadTier() ignores it. This trigger stops authenticated clients
--     writing it at all, leaving it reachable only from a backend/service
--     context for compatibility and any future backfill.
--
-- RLS is deliberately untouched: `leads: agent update own` still gives an
-- agent every other column on their own leads. This narrows specific value
-- transitions and nothing else.
--
-- What stays working, verified against the code before writing this:
--   * approveConversion() in index.html - the ONE canonical conversion path.
--     Already refuses to run without a deposit_screenshot in kyc_documents.
--     Runs as an admin, so is_admin() passes.
--   * supabase/functions/conversion-hook - the deposit-confirmation form. As
--     of this change it writes status='pending_approval', not 'converted', so
--     an unverified form submission no longer claims a conversion at all. It
--     runs on the SERVICE ROLE key, so auth.uid() is NULL and it stays exempt
--     either way - including for a future broker-verification path that
--     legitimately converts.
--   * whatsapp-webhook sets status='qualified' on a deposit yes, never
--     'converted'. Unchanged. Qualified stays distinct from Converted.

CREATE OR REPLACE FUNCTION public.enforce_converted_admin_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_tier   TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.manual_tier ELSE NULL END;
  old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status      ELSE NULL END;
  is_backend BOOLEAN := auth.uid() IS NULL;
BEGIN
  -- No authenticated end user means a trusted context: an Edge Function on the
  -- service role key, a migration, or psql. Those are the system conversion
  -- paths (and the future broker-verification one) and must not be broken.
  -- Note anon cannot reach here anyway - the only anon policy on leads is
  -- INSERT, and RLS still applies on top of this trigger.
  IF is_backend THEN
    RETURN NEW;
  END IF;

  -- manual_tier='closed' can no longer express a conversion, so no signed-in
  -- client has any reason to write it - not an agent, not an admin.
  IF NEW.manual_tier = 'closed' AND old_tier IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION
      'Converted is not a manual tier. It is set by the deposit approval flow (leads.status), never by picking a tier.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- An agent may not declare a conversion...
  IF NEW.status = 'converted' AND old_status IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION
      'Only an admin can convert a lead. Set it to Pending Approval so an admin can approve the deposit.'
      USING ERRCODE = '42501';
  END IF;

  -- ...nor quietly undo one. A confirmed conversion is a business record, and
  -- reversing it is an admin decision.
  IF old_status = 'converted' AND NEW.status IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION
      'Only an admin can move a lead out of Converted.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_converted_admin_only() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_leads_converted_admin_only ON public.leads;
CREATE TRIGGER trg_leads_converted_admin_only
  BEFORE INSERT OR UPDATE OF manual_tier, status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_converted_admin_only();
