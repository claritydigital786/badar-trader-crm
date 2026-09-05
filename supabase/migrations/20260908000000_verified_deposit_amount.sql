-- Phase 46 - the customer's claimed amount stops being the ledger amount
-- (Muhammad, 2026-09-08)
--
-- On 2026-09-05 a customer typed 60037 into the deposit form, an admin clicked
-- Approve, and USD 60,037 went straight into leads.account_balance, the
-- transactions ledger, AUM, Reports and the Converted Leads sheet. The real
-- deposit was USD 637.16. Nothing in the system had ever asked a human what the
-- screenshot actually showed - Approve meant "accept whatever the customer
-- typed", and the only defence was that somebody noticed.
--
-- The model now separates the two amounts that were conflated:
--
--   claimed_deposit_amount  - what the CUSTOMER submitted. Evidence, never money.
--   verified_deposit_amount - what an ADMIN read off the screenshot. The only
--                             number that may become money.
--
-- Every financial consumer (transactions, account_balance, AUM, Reports, the
-- Google Sheet) is fed from verified_deposit_amount alone.
--
-- ADDITIVE except for one deliberate breaking change: the single-argument
-- approve_deposit_and_convert(uuid) is kept but now REFUSES, because leaving a
-- callable one-argument version would leave the old "approve whatever was
-- claimed" path open and defeat the entire point. It raises a message that
-- names the fix rather than failing as "function does not exist".

-- ── 1. the two amounts ─────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS claimed_deposit_amount  numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verified_deposit_amount numeric;

COMMENT ON COLUMN public.leads.claimed_deposit_amount IS
  'What the customer typed on the deposit form. Evidence for a human to check against the screenshot - never used as a financial figure. NULL means the original claim could not be proven from the submission ledger (historical rows only).';
COMMENT ON COLUMN public.leads.verified_deposit_amount IS
  'The amount an admin read off the screenshot and approved. The ONLY amount that may reach transactions, account_balance, AUM, Reports or the Google Sheet.';

-- The decision itself, recorded on the approval record so later edits to the
-- lead can never rewrite what was actually approved and on what basis.
ALTER TABLE public.kyc_documents ADD COLUMN IF NOT EXISTS claimed_amount_at_approval  numeric;
ALTER TABLE public.kyc_documents ADD COLUMN IF NOT EXISTS verified_amount_at_approval numeric;
COMMENT ON COLUMN public.kyc_documents.claimed_amount_at_approval IS
  'The customer claim as it stood at the moment of approval. Immutable history.';
COMMENT ON COLUMN public.kyc_documents.verified_amount_at_approval IS
  'The amount the approving admin entered. Immutable history.';

-- ── 2. historical backfill ─────────────────────────────────────
-- verified_deposit_amount comes from the LEDGER, because for an already
-- approved deposit the transaction is the historical financial truth - not
-- leads.deposit_amount, which is a claim field that has been edited.
UPDATE public.leads l
   SET verified_deposit_amount = t.amount
  FROM public.kyc_documents k
  JOIN public.transactions t ON t.deposit_document_id = k.id
 WHERE k.client_id = l.id
   AND k.document_type = 'deposit_screenshot'
   AND k.status = 'verified'
   AND l.verified_deposit_amount IS NULL;

-- claimed_deposit_amount comes ONLY from deposit_submissions, the ledger of
-- what customers actually submitted (one row per distinct accepted claim,
-- written by conversion-hook at submission time). It is deliberately NOT
-- copied from leads.deposit_amount: that column has been overwritten by
-- corrections, so using it would invent a claim that was never made - it would
-- have recorded the Numan case as "claimed 637.16", erasing the very error
-- this phase exists to prevent recurring.
--
-- Matched on lead AND broker account, earliest submission first: the earliest
-- row for that account is the original claim, later ones are re-submissions.
-- Where no submission row exists the claim stays NULL - historical unknown,
-- honestly recorded, never guessed.
UPDATE public.leads l
   SET claimed_deposit_amount = (
     SELECT ds.amount FROM public.deposit_submissions ds
      WHERE ds.lead_id = l.id
        AND ds.account_ref IS NOT DISTINCT FROM l.deposit_account_ref
      ORDER BY ds.first_seen_at
      LIMIT 1)
 WHERE l.claimed_deposit_amount IS NULL
   AND EXISTS (
     SELECT 1 FROM public.deposit_submissions ds
      WHERE ds.lead_id = l.id
        AND ds.account_ref IS NOT DISTINCT FROM l.deposit_account_ref);

-- Same two figures onto the approval records, for the ones already approved.
UPDATE public.kyc_documents k
   SET verified_amount_at_approval = t.amount,
       claimed_amount_at_approval  = l.claimed_deposit_amount
  FROM public.transactions t, public.leads l
 WHERE t.deposit_document_id = k.id
   AND l.id = k.client_id
   AND k.status = 'verified'
   AND k.verified_amount_at_approval IS NULL;

-- ── 3. new claims keep landing in the claim column, with no Edge Function change ──
-- conversion-hook and submit-lead-form write leads.deposit_amount, which has
-- always BEEN the customer's claim. Rather than redeploy those functions, the
-- claim is mirrored here at the database edge. Only while the lead is not yet
-- converted: once approved, the claim is history and must stop moving.
CREATE OR REPLACE FUNCTION public.capture_claimed_deposit_amount()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.deposit_amount IS NOT NULL
     AND NEW.deposit_amount IS DISTINCT FROM COALESCE(OLD.deposit_amount, NULL)
     AND COALESCE(NEW.status, '') <> 'converted' THEN
    NEW.claimed_deposit_amount := NEW.deposit_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_claimed_deposit_amount ON public.leads;
CREATE TRIGGER trg_capture_claimed_deposit_amount
  BEFORE INSERT OR UPDATE OF deposit_amount ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.capture_claimed_deposit_amount();

-- ── 4. configurable high-value warning ─────────────────────────
INSERT INTO public.settings (key, value)
VALUES ('deposit_high_value_threshold', '10000')
ON CONFLICT (key) DO NOTHING;

-- ── 5. approval now requires a human-entered verified amount ────
-- The old one-argument form is kept ONLY so an un-updated browser gets an
-- explanation instead of a missing-function error. It approves nothing.
CREATE OR REPLACE FUNCTION public.approve_deposit_and_convert(p_document_id uuid)
RETURNS TABLE(approved boolean, already_approved boolean, lead_id uuid, transaction_id uuid, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'Approval now requires a verified deposit amount. Reload the CRM (Ctrl+Shift+R) and approve again - you will be asked to type the amount shown on the screenshot.'
    USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_deposit_and_convert(
  p_document_id      uuid,
  p_verified_amount  numeric,
  p_confirm_mismatch boolean DEFAULT false
)
RETURNS TABLE(
  approved         boolean,
  already_approved boolean,
  lead_id          uuid,
  transaction_id   uuid,
  amount           numeric,
  claimed_amount   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_lead       uuid;
  v_doc_status text;
  v_doc_type   text;
  v_esc_at     timestamptz;
  v_esc_by     uuid;
  v_assigned   uuid;
  v_status     text;
  v_claimed    numeric;
  v_platform   text;
  v_acct       text;
  v_txn        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can approve a deposit.' USING ERRCODE = '42501';
  END IF;

  -- The verified amount is the whole point: it is required, it is validated,
  -- and it is never defaulted from anything the customer supplied.
  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the deposit amount shown on the screenshot before approving.'
      USING ERRCODE = '22023';
  END IF;

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

  IF v_doc_status = 'verified' THEN
    SELECT t.id INTO v_txn FROM public.transactions t
     WHERE t.deposit_document_id = p_document_id LIMIT 1;
    RETURN QUERY SELECT false, true, v_lead, v_txn, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;
  -- A discarded submission stays unapprovable (phase 45).
  IF v_doc_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This submission is not awaiting approval - the agent must send it again.'
      USING ERRCODE = '22023';
  END IF;
  IF v_esc_at IS NULL THEN
    RAISE EXCEPTION 'The assigned agent has not sent this deposit for verification yet.'
      USING ERRCODE = '22023';
  END IF;

  SELECT l.assigned_agent_id, l.status,
         COALESCE(l.claimed_deposit_amount, l.deposit_amount),
         l.deposit_platform, l.deposit_account_ref
    INTO v_assigned, v_status, v_claimed, v_platform, v_acct
    FROM public.leads l
   WHERE l.id = v_lead
     FOR UPDATE;

  IF v_esc_by IS DISTINCT FROM v_assigned THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_esc_by AND p.role IN ('admin', 'super_admin')) THEN
      RAISE EXCEPTION 'This deposit was escalated by someone other than the assigned agent.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_status IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'The lead is "%", not Pending Approval.', v_status USING ERRCODE = '22023';
  END IF;
  IF v_platform IS NULL OR v_platform = '' THEN
    RAISE EXCEPTION 'No broker was recorded for this deposit.' USING ERRCODE = '22023';
  END IF;
  IF v_acct IS NULL OR v_acct = '' THEN
    RAISE EXCEPTION 'No trading account reference was recorded for this deposit.' USING ERRCODE = '22023';
  END IF;

  -- A verified amount that does not match the claim is allowed - that is the
  -- correction this phase exists to make possible - but it must be a deliberate
  -- act, not a slip. The browser shows the warning; this is what enforces it.
  IF v_claimed IS NOT NULL AND p_verified_amount <> v_claimed AND NOT p_confirm_mismatch THEN
    RAISE EXCEPTION 'The amount you entered (%) does not match the customer''s claim (%). Confirm the mismatch to continue.',
      p_verified_amount, v_claimed USING ERRCODE = '22023';
  END IF;

  -- 1. Convert. account_balance takes the VERIFIED amount, never the claim.
  UPDATE public.leads
     SET status                  = 'converted',
         converted_at            = now(),
         balance_locked          = true,
         account_balance         = p_verified_amount,
         verified_deposit_amount = p_verified_amount,
         claimed_deposit_amount  = COALESCE(claimed_deposit_amount, v_claimed)
   WHERE id = v_lead;

  -- 2. Mark the submission approved, recording BOTH figures immutably.
  UPDATE public.kyc_documents
     SET status                      = 'verified',
         reviewed_by                 = v_uid,
         reviewed_at                 = now(),
         claimed_amount_at_approval  = v_claimed,
         verified_amount_at_approval = p_verified_amount
   WHERE id = p_document_id;

  -- 3. Exactly one deposit transaction, at the verified amount.
  INSERT INTO public.transactions
    (client_id, type, amount, currency, notes, recorded_by, deposit_document_id)
  VALUES
    (v_lead, 'deposit', p_verified_amount, 'USD',
     'Approved deposit verification - ' || v_platform || ', acct ' || v_acct
       || CASE WHEN v_claimed IS NOT NULL AND v_claimed <> p_verified_amount
               THEN ' (customer claimed ' || v_claimed || ', admin verified ' || p_verified_amount || ')'
               ELSE '' END,
     v_uid, p_document_id)
  RETURNING id INTO v_txn;

  -- 4. Permanent, human-readable audit of the decision.
  INSERT INTO public.lead_activity (lead_id, actor_id, channel, summary)
  VALUES (v_lead, v_uid, 'note',
    'Deposit approved. Customer claimed ' || COALESCE(v_claimed::text, 'unknown')
      || ', admin verified ' || p_verified_amount::text
      || CASE WHEN v_claimed IS NOT NULL AND v_claimed <> p_verified_amount
              THEN ' (MISMATCH, confirmed by approver)' ELSE '' END || '.');

  RETURN QUERY SELECT true, false, v_lead, v_txn, p_verified_amount, v_claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_deposit_and_convert(uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_deposit_and_convert(uuid, numeric, boolean) TO authenticated;
