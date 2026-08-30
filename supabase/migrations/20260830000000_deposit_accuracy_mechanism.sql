-- Deposit-accuracy mechanism (Muhammad, 2026-08-30): a lead's account_balance
-- becomes locked the moment its conversion is approved, every real change is
-- logged with who/when/old/new, and unlocking a balance to correct it
-- afterward is a deliberate, logged action rather than a quiet edit. See
-- REMAINING_TODOS.md's 2026-08-30 deposit-accuracy entry - this is a
-- verified-process mechanism, not a claim of mathematical certainty. True
-- 100% accuracy still needs a real broker/platform API, a separate open
-- question for Badar to answer.

-- 1. Widen kyc_documents.document_type to actually allow 'deposit_screenshot'.
-- index.html's KYC upload dropdown has offered this option for a while
-- (see the "Deposit Screenshot" option and viewDepositScreenshot()), but
-- schema.sql's own CHECK constraint never included it - only
-- passport/national_id/utility_bill/other were ever allowed, so every real
-- attempt to upload one would have failed at the database level. Checked
-- live before writing this: zero rows exist in kyc_documents at all yet, so
-- this cannot have silently dropped real data - it closes the gap before
-- approveConversion starts depending on this document type existing.
ALTER TABLE public.kyc_documents DROP CONSTRAINT IF EXISTS kyc_documents_document_type_check;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_document_type_check
  CHECK (document_type IN ('passport','national_id','utility_bill','deposit_screenshot','other'));

-- 2. balance_locked: set true the moment a conversion is approved
-- (approveConversion in index.html). Once locked, account_balance cannot be
-- changed again without an explicit unlock in the same statement (see the
-- trigger below) - a correction after approval is a deliberate act, not a
-- silent overwrite.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS balance_locked BOOLEAN NOT NULL DEFAULT false;

-- 3. Audit trail: every real account_balance change, who, when, old, new -
-- none existed before this. `reason` is filled by the frontend when a
-- locked balance is deliberately unlocked to correct it; the trigger's own
-- automatic row (below) leaves it null for an ordinary pre-lock edit.
CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  changed_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_balance NUMERIC,
  new_balance NUMERIC,
  action      TEXT        NOT NULL DEFAULT 'edit' CHECK (action IN ('edit','unlock')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "balance_audit_log: admin full access" ON public.balance_audit_log;
CREATE POLICY "balance_audit_log: admin full access" ON public.balance_audit_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Extend the existing admin-only-columns guard (schema.sql §14). This
-- trigger already runs BEFORE UPDATE on every write to leads regardless of
-- which client or code path made it, so it is the one place that can log a
-- balance change with zero chance of being bypassed by a new call site
-- someone adds later and forgets to instrument.
CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;

  IF NEW.account_balance IS DISTINCT FROM OLD.account_balance THEN
    -- Still locked after this write (i.e. the statement did not also
    -- unlock it) - refuse. An admin correcting a locked balance must
    -- explicitly set balance_locked = false in the same update, which the
    -- frontend only does after it has already logged a reason.
    IF OLD.balance_locked AND NEW.balance_locked THEN
      RAISE EXCEPTION 'This lead''s balance is locked after approval - unlock it (with a reason) before editing.';
    END IF;
    INSERT INTO public.balance_audit_log (lead_id, changed_by, old_balance, new_balance, action)
      VALUES (NEW.id, auth.uid(), OLD.account_balance, NEW.account_balance,
              CASE WHEN OLD.balance_locked AND NOT NEW.balance_locked THEN 'unlock' ELSE 'edit' END);
  END IF;

  RETURN NEW;
END;
$$;
