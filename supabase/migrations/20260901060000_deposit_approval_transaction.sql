-- Phase 43 - an approved deposit becomes a real transaction (Muhammad, 2026-09-01)
--
-- Found after the first genuine end-to-end deposit ran in production: AUM moved
-- to $801 but Reports still said "RECORDED DEPOSITS - No deposits". Not a Reports
-- bug. The transactions table was, and still is, completely empty: approval wrote
-- leads.account_balance and nothing else, so the CRM had two parallel money
-- systems that had never met. leads.account_balance drives AUM; transactions
-- drives Reports and the Financials summary (and, for hand-entered rows only,
-- payroll commission - see the note at the INSERT).
--
-- Three things here, and deliberately nothing else:
--
--   1. transactions.deposit_document_id - the natural business key. One approved
--      deposit submission produces at most one transaction. Nullable, because
--      every manually recorded transaction (addTransaction() in the lead detail
--      Financial Ledger tab) has no deposit document behind it and must stay
--      unconstrained.
--
--   2. A PARTIAL unique index over that column. This is the idempotency
--      guarantee, and it is deliberately enforced by Postgres rather than by an
--      application read-then-write: a read-then-write loses a race between two
--      tabs, two admins, or a retry after a timeout. Partial (WHERE NOT NULL) so
--      it constrains only approval-generated rows - many manual rows may, and do,
--      have NULL.
--
--   3. approve_deposit_and_convert() - the whole approval as ONE database
--      transaction. Previously the browser converted the lead in one round trip
--      and marked the document in another, which is how an approval could
--      half-write. Adding a third write (the transaction) to that sequence would
--      have made it worse, so the sequence moves into the database, where either
--      all of it lands or none of it does.
--
-- No RLS policy, grant or existing trigger is changed. The function is SECURITY
-- DEFINER but re-checks is_admin() itself, and auth.uid() still resolves to the
-- real caller inside it - the same pattern escalate_deposit_to_admin() already
-- uses - so guard_leads_admin_only_columns is satisfied on its own terms and
-- balance_audit_log records the approving admin as the real actor.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deposit_document_id uuid
    REFERENCES public.kyc_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.deposit_document_id IS
  'The approved deposit_screenshot kyc_documents row this transaction was generated from. NULL for manually recorded transactions.';

-- At most one transaction per approved deposit document, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_per_deposit_document
  ON public.transactions (deposit_document_id)
  WHERE deposit_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.approve_deposit_and_convert(p_document_id uuid)
RETURNS TABLE(
  approved         boolean,
  already_approved boolean,
  lead_id          uuid,
  transaction_id   uuid,
  amount           numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_lead       uuid;
  v_doc_status text;
  v_doc_type   text;
  v_esc_at     timestamptz;
  v_esc_by     uuid;
  v_assigned   uuid;
  v_status     text;
  v_amount     numeric;
  v_platform   text;
  v_acct       text;
  v_txn        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;
  -- Deliberately admin-only and re-checked here, not trusted from the caller.
  -- is_admin() covers super_admin too.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can approve a deposit.' USING ERRCODE = '42501';
  END IF;

  -- Lock the document first. This row is the serialization point for the whole
  -- approval: a second concurrent call blocks here, and when it resumes it sees
  -- the document already 'verified' and returns already_approved instead of
  -- doing the work twice. The unique index is the backstop behind this.
  SELECT k.client_id, k.status, k.document_type, k.agent_reviewed_at, k.agent_reviewed_by
    INTO v_lead, v_doc_status, v_doc_type, v_esc_at, v_esc_by
    FROM public.kyc_documents k
   WHERE k.id = p_document_id
     FOR UPDATE;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'That deposit submission does not exist.' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc_type IS DISTINCT FROM 'deposit_screenshot' THEN
    RAISE EXCEPTION 'Only a deposit submission can be approved.' USING ERRCODE = '22023';
  END IF;

  -- Already approved: report it, change nothing, and hand back the transaction
  -- that already exists so the caller can tell this is a no-op, not a failure.
  IF v_doc_status = 'verified' THEN
    SELECT t.id INTO v_txn
      FROM public.transactions t
     WHERE t.deposit_document_id = p_document_id
     LIMIT 1;
    RETURN QUERY SELECT false, true, v_lead, v_txn, NULL::numeric;
    RETURN;
  END IF;

  -- A returned ('rejected') document is back with the agent and must be re-sent
  -- before it can be approved again.
  IF v_doc_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This submission is not awaiting approval - the agent must send it again.'
      USING ERRCODE = '22023';
  END IF;
  IF v_esc_at IS NULL THEN
    RAISE EXCEPTION 'The assigned agent has not sent this deposit for verification yet.'
      USING ERRCODE = '22023';
  END IF;

  SELECT l.assigned_agent_id, l.status, l.deposit_amount, l.deposit_platform, l.deposit_account_ref
    INTO v_assigned, v_status, v_amount, v_platform, v_acct
    FROM public.leads l
   WHERE l.id = v_lead
     FOR UPDATE;

  -- The escalation must have come from the agent the lead is actually assigned
  -- to (or from an admin working their own lead - Ehsan still carries leads).
  IF v_esc_by IS DISTINCT FROM v_assigned THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = v_esc_by AND p.role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'This deposit was escalated by someone other than the assigned agent.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The whole submission has to hang together. A screenshot on its own is not
  -- enough: a half-failed submission once left an orphan document against a lead
  -- carrying no deposit at all, and that alone would have converted it for $0.
  IF v_status IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'The lead is "%", not Pending Approval.', v_status USING ERRCODE = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'No deposit amount was submitted for this lead.' USING ERRCODE = '22023';
  END IF;
  IF v_platform IS NULL OR v_platform = '' THEN
    RAISE EXCEPTION 'No broker was recorded for this deposit.' USING ERRCODE = '22023';
  END IF;
  IF v_acct IS NULL OR v_acct = '' THEN
    RAISE EXCEPTION 'No trading account reference was recorded for this deposit.' USING ERRCODE = '22023';
  END IF;

  -- 1. Convert, and only now write the approved balance. The amount comes from
  --    leads.deposit_amount - what the customer actually submitted and the agent
  --    and admin both reviewed - never from anything the caller passed in.
  UPDATE public.leads
     SET status          = 'converted',
         converted_at    = now(),
         balance_locked  = true,
         account_balance = v_amount
   WHERE id = v_lead;

  -- 2. Mark the submission approved.
  UPDATE public.kyc_documents
     SET status      = 'verified',
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_document_id;

  -- 3. Exactly one deposit transaction, which is what Reports, the Financials
  --    summary and the client ledger read.
  --
  --    PAYROLL DELIBERATELY DOES NOT COUNT IT (Muhammad, 2026-09-01): commission
  --    is out of scope for this phase, and calculatePayroll() is not a preview -
  --    it inserts a payroll_runs row carrying total_commission, a persisted
  --    payable. loadPayrollDepositTransactions() therefore filters
  --    deposit_document_id IS NULL, so hand-entered deposits keep counting for
  --    payroll exactly as they do today and approval-generated ones do not.
  --    When approved deposits are meant to be commissionable, that one filter
  --    is what changes; nothing here needs to.
  --
  --    USD because the deposit form is USD-only ("Deposit Amount (USD)") and the
  --    payroll query matches on currency = 'USD'; multi-currency handling
  --    elsewhere is untouched.
  INSERT INTO public.transactions
    (client_id, type, amount, currency, notes, recorded_by, deposit_document_id)
  VALUES
    (v_lead, 'deposit', v_amount, 'USD',
     'Approved deposit verification - ' || v_platform || ', acct ' || v_acct,
     v_uid, p_document_id)
  RETURNING id INTO v_txn;

  RETURN QUERY SELECT true, false, v_lead, v_txn, v_amount;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_deposit_and_convert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_deposit_and_convert(uuid) TO authenticated;
