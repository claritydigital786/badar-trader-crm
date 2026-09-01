-- Phase 41 - the agent review checkpoint on a deposit submission
-- (Muhammad, 2026-09-01)
--
-- The workflow gains one step. A customer's deposit submission now belongs to
-- the lead's assigned agent first: the agent checks the screenshot and the
-- details, then explicitly sends it to Ehsan, and only Ehsan's approval sets
-- leads.status='converted'. Nothing is escalated merely because a customer
-- pressed submit.
--
-- Deliberately NOT a new lead status. The visible hierarchy stays
-- Pending Approval -> Converted; this checkpoint lives on the submission
-- record (kyc_documents), not on the lead.
--
-- Deliberately NOT leads.agent_escalated: that column already means
-- "nudge-agents escalated an unacknowledged NEW LEAD to the rest of the team"
-- (see nudge-agents/index.ts), and reusing it would corrupt that flow.
--
-- ADDITIVE ONLY. Two nullable columns, one partial index, one function, one
-- grant. No DROP, no column rename, no type change, no constraint change, no
-- backfill, no UPDATE of any existing row. Every historical lead, every
-- converted record and the existing kyc_documents.status/reviewed_by/
-- reviewed_at columns are left exactly as they are - reviewed_by keeps
-- meaning "the admin who made the final call", which is why the agent stage
-- gets its own pair of columns rather than borrowing it.

ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS agent_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS agent_reviewed_at timestamptz;

COMMENT ON COLUMN public.kyc_documents.agent_reviewed_by IS
  'The agent who reviewed this submission and sent it to an admin. NULL means it is still waiting on the assigned agent.';
COMMENT ON COLUMN public.kyc_documents.agent_reviewed_at IS
  'When the agent sent this submission to an admin for final verification.';

-- Ehsan''s queue is "escalated and still pending", so index exactly that.
CREATE INDEX IF NOT EXISTS kyc_documents_agent_reviewed_idx
  ON public.kyc_documents (agent_reviewed_at DESC)
  WHERE agent_reviewed_at IS NOT NULL;

-- The escalation itself.
--
-- This is a SECURITY DEFINER function rather than a new UPDATE policy on
-- kyc_documents because agents have SELECT on their own clients' documents but
-- no UPDATE policy at all, and widening that would let an agent write any
-- column on any document they can see, not just this one stamp.
--
-- Note (corrected 2026-09-01, after Phase 15 agent-scoping RLS was actually
-- applied live in e9e1947): RLS now does scope agents to their assigned leads
-- and their own clients' kyc_documents. This function's own assignment check is
-- therefore defence in depth rather than the only control - but it is still the
-- thing that decides WHO may escalate, and it keeps that decision in one place
-- instead of depending on which policies happen to be live.
--
-- Idempotent on purpose. A double-click, a replayed request or a second tab
-- must not stamp the row twice or ping Ehsan twice, so the UPDATE only fires
-- when agent_reviewed_at IS NULL and the function reports whether it was the
-- one that did it.
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
  -- A submission an admin has already ruled on is finished; re-escalating it
  -- would put a decided item back in the queue.
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This submission has already been reviewed by an admin.' USING ERRCODE = '22023';
  END IF;

  -- The assigned agent, or an admin acting on their behalf. Nobody else.
  IF NOT (public.is_admin() OR v_assigned = v_uid) THEN
    RAISE EXCEPTION 'This deposit belongs to another agent.' USING ERRCODE = '42501';
  END IF;

  IF v_already_at IS NOT NULL THEN
    RETURN QUERY SELECT false, true, v_lead, v_already_by;
    RETURN;
  END IF;

  UPDATE public.kyc_documents
     SET agent_reviewed_by = v_uid,
         agent_reviewed_at = now()
   WHERE id = p_document_id
     AND agent_reviewed_at IS NULL;

  IF NOT FOUND THEN
    -- Lost a race with a concurrent click; the other one already stamped it.
    SELECT k.agent_reviewed_by INTO v_already_by FROM public.kyc_documents k WHERE k.id = p_document_id;
    RETURN QUERY SELECT false, true, v_lead, v_already_by;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, false, v_lead, v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_deposit_to_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_deposit_to_admin(uuid) TO authenticated;
