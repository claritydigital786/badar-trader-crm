-- Phase 41b - a returned deposit must be re-sendable (Muhammad, 2026-09-01)
--
-- Found in testing, not in production: escalate_deposit_to_admin() refused any
-- document whose status was not 'pending', which is right for one an admin has
-- already APPROVED but wrong for one he RETURNED. The agreed loop is
--   Returned - Action Required -> agent corrects -> Awaiting Admin Approval
-- and that second hop was impossible: the agent would get "This submission has
-- already been reviewed by an admin" and the deposit would be stuck forever.
--
-- A returned document now re-enters the queue on escalation: status goes back
-- to 'pending' so it is visible to the admin again, and the agent stamp is
-- refreshed. An APPROVED document is still refused, because re-opening a
-- completed conversion is not a thing an agent may do.
--
-- ADDITIVE / CORRECTIVE ONLY: one CREATE OR REPLACE FUNCTION. No schema change,
-- no column change, no data rewrite, no policy change.

CREATE OR REPLACE FUNCTION public.escalate_deposit_to_admin(p_document_id uuid)
RETURNS TABLE (escalated boolean, already_escalated boolean, lead_id uuid, reviewer uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_lead       uuid;
  v_assigned   uuid;
  v_status     text;
  v_type       text;
  v_already_at timestamptz;
  v_already_by uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Your account cannot review deposit submissions.' USING ERRCODE = '42501';
  END IF;

  SELECT k.client_id, k.status, k.document_type, k.agent_reviewed_at, k.agent_reviewed_by,
         l.assigned_agent_id
    INTO v_lead, v_status, v_type, v_already_at, v_already_by, v_assigned
    FROM public.kyc_documents k
    JOIN public.leads l ON l.id = k.client_id
   WHERE k.id = p_document_id
   FOR UPDATE OF k;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'That deposit submission does not exist.' USING ERRCODE = 'P0002';
  END IF;
  IF v_type IS DISTINCT FROM 'deposit_screenshot' THEN
    RAISE EXCEPTION 'Only a deposit submission can be sent for verification.' USING ERRCODE = '22023';
  END IF;
  -- An approved deposit is finished. A returned one is explicitly re-sendable.
  IF v_status = 'verified' THEN
    RAISE EXCEPTION 'This submission has already been approved.' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'This submission cannot be sent for verification.' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_admin() OR v_assigned = v_uid) THEN
    RAISE EXCEPTION 'This deposit belongs to another agent.' USING ERRCODE = '42501';
  END IF;

  -- Only a still-pending document can be "already escalated". A returned one is
  -- being sent back deliberately, so it always re-stamps.
  IF v_status = 'pending' AND v_already_at IS NOT NULL THEN
    RETURN QUERY SELECT false, true, v_lead, v_already_by;
    RETURN;
  END IF;

  UPDATE public.kyc_documents
     SET agent_reviewed_by = v_uid,
         agent_reviewed_at = now(),
         -- back into the admin queue; the return note stays for context
         status = 'pending'
   WHERE id = p_document_id
     AND status <> 'verified'
     AND (status = 'rejected' OR agent_reviewed_at IS NULL);

  IF NOT FOUND THEN
    SELECT k.agent_reviewed_by INTO v_already_by FROM public.kyc_documents k WHERE k.id = p_document_id;
    RETURN QUERY SELECT false, true, v_lead, v_already_by;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, false, v_lead, v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_deposit_to_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_deposit_to_admin(uuid) TO authenticated;
