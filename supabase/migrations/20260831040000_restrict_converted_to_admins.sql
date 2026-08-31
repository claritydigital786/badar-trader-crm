-- Phase 38 - Converted becomes admin/system-only (Muhammad, 2026-08-31)
--
-- Before this, any agent could mark any lead assigned to them Converted:
-- the Inbox tier picker and the lead-detail Status dropdown both offered it
-- to everyone, `leads: agent update own` allows an agent every column on
-- their own leads, and the manual_tier CHECK accepts 'closed' from anybody.
-- So "Converted" could mean nothing more than a lead saying yes on WhatsApp.
--
-- The approved rule: agents classify up to Qualified; only an admin, or a
-- trusted backend path, may declare an actual conversion.
--
-- The UI hides the option, but the UI is not a control - this trigger is the
-- real one. It deliberately does NOT touch RLS: `leads: agent update own`
-- stays exactly as it is, so agents keep full control of every other column
-- on their own leads. This narrows two specific value transitions and
-- nothing else.
--
-- What stays working, verified against the code before writing this:
--   * supabase/functions/conversion-hook - the deposit-confirmation form.
--     Uses the SERVICE ROLE key, so auth.uid() is NULL and it is exempt.
--     This is the only backend writer of status='converted' in the repo.
--   * approveConversion() in index.html - the admin deposit approval, which
--     already requires a deposit_screenshot in kyc_documents before it will
--     run. Called by an admin, so is_admin() passes.
--   * whatsapp-webhook sets status='qualified' on a deposit yes, never
--     'converted' - unchanged, and Qualified stays distinct from Converted.

CREATE OR REPLACE FUNCTION public.enforce_converted_admin_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_tier   TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.manual_tier ELSE NULL END;
  old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status      ELSE NULL END;
BEGIN
  -- No authenticated end user means a trusted context: an Edge Function on
  -- the service role key, a migration, or psql. Those are the system
  -- conversion paths and must not be broken. Note anon cannot reach here
  -- anyway - the only anon policy on leads is INSERT, and RLS still applies
  -- on top of this trigger.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.manual_tier = 'closed' AND old_tier IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION
      'Only an admin can mark a lead Converted. Set the lead to Qualified and ask an admin to approve the deposit.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'converted' AND old_status IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION
      'Only an admin can set a lead to Converted. Use Pending Approval so an admin can approve the deposit.'
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
