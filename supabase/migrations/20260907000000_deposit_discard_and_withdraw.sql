-- Phase 45 - an agent can discard a mistaken deposit verification, and withdraw
-- one from admin review before it is approved (Muhammad, 2026-09-07)
--
-- The problem this closes: a customer who submits twice (or submits the wrong
-- screenshot) leaves a second verification card on the agent's dashboard that
-- the agent can do nothing with. Sending it on wastes the admin's time;
-- leaving it there means the queue permanently lies about how much work is
-- outstanding. There was no way to say "this one is not real".
--
-- WHY A FOURTH status VALUE, and not a nullable cancelled_at flag:
-- the two functions that can turn a document into money already refuse
-- anything that is not exactly 'pending' -
--   approve_deposit_and_convert:  IF v_doc_status IS DISTINCT FROM 'pending' THEN RAISE
--   escalate_deposit_to_admin:    IF v_status NOT IN ('pending','rejected') THEN RAISE
-- - and the Google Sheet trigger only fires on a transition INTO 'verified'.
-- So moving the row to 'cancelled' makes it unapprovable, un-escalatable and
-- un-syncable with ZERO edits to any of them. A nullable flag would have left
-- the row sitting at status='pending', i.e. still approvable by every one of
-- those paths unless each was individually taught about the new column. The
-- larger-looking change is the smaller blast radius.
--
-- ADDITIVE ONLY. One CHECK widened (strictly: the old set is a subset of the
-- new one, so no existing row can fail it), four nullable columns, one new
-- function, one new guard trigger. No DROP of a column, no rename, no type
-- change, no backfill, no UPDATE of any existing row, no RLS policy change,
-- and nothing touching transactions, leads.account_balance, payroll or the
-- converted-lead sheet queue.

-- ── 1. the fourth status ───────────────────────────────────────
-- Deliberately NOT reusing 'rejected'. 'rejected' means "returned to the agent,
-- still live work" and escalate_deposit_to_admin() explicitly re-sends it; a
-- discarded submission that reappears as an action item is the exact bug this
-- is meant to remove.
ALTER TABLE public.kyc_documents DROP CONSTRAINT IF EXISTS kyc_documents_status_check;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_status_check
  CHECK (status IN ('pending','verified','rejected','cancelled'));

-- ── 2. who / when / why ────────────────────────────────────────
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS cancellation_note text;
-- The stage it was discarded FROM, so the audit can tell a discard from a
-- withdrawal after the fact. Derivable from agent_reviewed_at today, but that
-- column can be re-stamped by a later escalation of a different document and
-- the audit answer must not be able to drift.
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS cancelled_from_stage text;

COMMENT ON COLUMN public.kyc_documents.cancelled_by IS
  'The staff member who discarded or withdrew this submission. NULL for every submission that was never discarded.';
COMMENT ON COLUMN public.kyc_documents.cancelled_at IS
  'When it was discarded or withdrawn. Never cleared - a restored submission keeps its history.';
COMMENT ON COLUMN public.kyc_documents.cancellation_reason IS
  'One of duplicate / wrong_screenshot / wrong_details / customer_requested / other.';
COMMENT ON COLUMN public.kyc_documents.cancellation_note IS
  'Free text, required only when the reason is "other".';
COMMENT ON COLUMN public.kyc_documents.cancelled_from_stage IS
  'awaiting_agent | awaiting_admin | returned - which queue it was removed from.';

ALTER TABLE public.kyc_documents DROP CONSTRAINT IF EXISTS kyc_documents_cancellation_reason_check;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_cancellation_reason_check
  CHECK (cancellation_reason IS NULL OR cancellation_reason IN
    ('duplicate','wrong_screenshot','wrong_details','customer_requested','other'));

-- Admin history reads "everything discarded, newest first", so index exactly that.
CREATE INDEX IF NOT EXISTS kyc_documents_cancelled_idx
  ON public.kyc_documents (cancelled_at DESC)
  WHERE cancelled_at IS NOT NULL;

-- ── 3. a discarded submission cannot become money ──────────────
-- approve_deposit_and_convert() already refuses a 'cancelled' document, but it
-- is not the only way a row reaches status='verified': the KYC/Compliance tab
-- writes kyc_documents.status directly (reviewKycDocument()), and that write
-- WOULD fire trg_enqueue_converted_lead_sheet_sync and put a discarded
-- submission on the Google Sheet against a lead that was never converted.
-- The UI hides those buttons for a discarded row; this trigger is the part that
-- is actually enforced.
--
-- An admin may still restore a discard that was a mistake, but only back to an
-- agent-controlled stage - never straight to approved. SECURITY INVOKER, like
-- guard_leads_admin_only_columns, so auth.uid() inside is_admin() is the real
-- caller.
CREATE OR REPLACE FUNCTION public.guard_kyc_cancelled_is_final()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  IF NEW.status = 'verified' THEN
    RAISE EXCEPTION 'A discarded deposit submission cannot be approved. The customer must submit again.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can restore a discarded deposit submission.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_kyc_cancelled_is_final ON public.kyc_documents;
CREATE TRIGGER trg_guard_kyc_cancelled_is_final
  BEFORE UPDATE ON public.kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_kyc_cancelled_is_final();

-- ── 4. the action itself ───────────────────────────────────────
-- SECURITY DEFINER for the same reason escalate_deposit_to_admin() is: agents
-- have SELECT on their own clients' kyc_documents and NO update policy at all.
-- Giving them one would let an agent write any column on any document they can
-- see - including status='verified'. This function is the only write they get,
-- it decides for itself who may call it, and it can only ever move a row from
-- an agent-controlled stage to 'cancelled'.
--
-- Idempotent: a double-click, a second tab or a replayed request finds the row
-- already cancelled and reports that instead of stamping a second time.
CREATE OR REPLACE FUNCTION public.cancel_deposit_submission(
  p_document_id uuid,
  p_reason      text,
  p_note        text DEFAULT NULL
)
RETURNS TABLE (cancelled boolean, already_cancelled boolean, lead_id uuid, was_stage text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_lead     uuid;
  v_status   text;
  v_type     text;
  v_esc_at   timestamptz;
  v_assigned uuid;
  v_stage    text;
  v_reason   text;
  v_note     text;
  v_label    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Your account cannot change deposit submissions.' USING ERRCODE = '42501';
  END IF;

  v_reason := lower(btrim(coalesce(p_reason, '')));
  IF v_reason NOT IN ('duplicate','wrong_screenshot','wrong_details','customer_requested','other') THEN
    RAISE EXCEPTION 'Choose a reason before discarding a deposit submission.' USING ERRCODE = '22023';
  END IF;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  -- "Other" with no explanation is an audit entry that explains nothing.
  IF v_reason = 'other' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Describe the reason when you choose "Other".' USING ERRCODE = '22023';
  END IF;

  SELECT k.client_id, k.status, k.document_type, k.agent_reviewed_at, l.assigned_agent_id
    INTO v_lead, v_status, v_type, v_esc_at, v_assigned
    FROM public.kyc_documents k
    JOIN public.leads l ON l.id = k.client_id
   WHERE k.id = p_document_id
   FOR UPDATE OF k;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'That deposit submission does not exist.' USING ERRCODE = 'P0002';
  END IF;
  IF v_type IS DISTINCT FROM 'deposit_screenshot' THEN
    RAISE EXCEPTION 'Only a deposit submission can be discarded.' USING ERRCODE = '22023';
  END IF;

  -- The assigned agent, or an admin. Another agent gets nothing, and gets the
  -- same message whether or not the document exists for them to see.
  IF NOT (public.is_admin() OR v_assigned = v_uid) THEN
    RAISE EXCEPTION 'This deposit belongs to another agent.' USING ERRCODE = '42501';
  END IF;

  -- An approved deposit has a transaction, a locked balance and a converted
  -- lead behind it. Nobody discards that from here, admin included.
  IF v_status = 'verified' THEN
    RAISE EXCEPTION 'This deposit is already approved and cannot be discarded or withdrawn.'
      USING ERRCODE = '22023';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN QUERY SELECT false, true, v_lead, NULL::text;
    RETURN;
  END IF;
  IF v_status NOT IN ('pending','rejected') THEN
    RAISE EXCEPTION 'This submission cannot be discarded.' USING ERRCODE = '22023';
  END IF;

  v_stage := CASE WHEN v_status = 'rejected'   THEN 'returned'
                  WHEN v_esc_at IS NOT NULL    THEN 'awaiting_admin'
                  ELSE 'awaiting_agent' END;

  UPDATE public.kyc_documents
     SET status               = 'cancelled',
         cancelled_by         = v_uid,
         cancelled_at         = now(),
         cancellation_reason  = v_reason,
         cancellation_note    = v_note,
         cancelled_from_stage = v_stage
   WHERE id = p_document_id
     AND status IN ('pending','rejected');

  IF NOT FOUND THEN
    -- Lost a race with a concurrent click or with an admin approving it.
    RETURN QUERY SELECT false, true, v_lead, NULL::text;
    RETURN;
  END IF;

  -- The audit entry a human actually reads. lead_activity is the existing
  -- per-lead trail shown in the lead detail; no parallel log is created.
  v_label := CASE v_reason
    WHEN 'duplicate'          THEN 'duplicate submission'
    WHEN 'wrong_screenshot'   THEN 'wrong screenshot'
    WHEN 'wrong_details'      THEN 'wrong amount or details'
    WHEN 'customer_requested' THEN 'customer requested cancellation'
    ELSE 'other' END;

  INSERT INTO public.lead_activity (lead_id, actor_id, channel, summary)
  VALUES (
    v_lead, v_uid, 'note',
    CASE WHEN v_stage = 'awaiting_admin'
      THEN 'Withdrew deposit verification from admin review'
      ELSE 'Discarded deposit verification' END
    || ' - ' || v_label
    || coalesce(': ' || v_note, '')
  );

  RETURN QUERY SELECT true, false, v_lead, v_stage;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_deposit_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_deposit_submission(uuid, text, text) TO authenticated;
