-- Phase 42 - actually apply the Phase 15 agent-scoping RLS (Muhammad, 2026-09-01)
--
-- Real, live bug found and confirmed directly against the database: Phase 15
-- (schema.sql, "assigned-lead access", dated as reversed by Muhammad on
-- 2026-08-10) was written into this repo's own reference schema, but was
-- never actually fully applied to the live project - or was applied then
-- partially reverted. Checked every affected table's real, live RLS policy
-- directly (pg_policy) rather than trusting the schema file or any prior
-- note claiming this was done:
--
--   leads              - still "staff select all" / "staff update all"
--                         (is_active_staff() only, no assignment check)
--   communications     - still "staff select all" / "staff insert any"
--   kyc_documents       - still "staff select all"
--   transactions        - still "staff select all"
--   lead_activity        - still "staff select all" / "staff insert any"
--   storage: deposit-screenshots - still "staff select all"
--   storage: kyc-documents       - ALREADY correctly scoped (the one
--                                   exception - proves this was a partial
--                                   application, not a decision)
--
-- Net effect until this migration: every active (non-suspended) agent could
-- see and, for leads, update every OTHER agent's real leads, WhatsApp
-- conversations, KYC documents, transactions, and activity log - not just
-- their own assigned ones. Confirmed directly by Muhammad noticing Hanzala's
-- and Ehsan's messages showing to each other in the Omnichannel Inbox.
--
-- This migration replaces every one of the still-broken policies with
-- exactly what schema.sql's own Phase 15 section already specifies -
-- restoring the agent-scoping to what this project has documented as
-- intentional since 2026-08-10, not introducing a new restriction.
-- is_active_staff() already exists (used by the very policies being
-- replaced), so it is not recreated here.

DROP POLICY IF EXISTS "leads: staff select all" ON public.leads;
DROP POLICY IF EXISTS "leads: agent select own" ON public.leads;
CREATE POLICY "leads: agent select own" ON public.leads
  FOR SELECT TO authenticated
  USING ((SELECT public.is_active_staff()) AND assigned_agent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "leads: staff update all" ON public.leads;
DROP POLICY IF EXISTS "leads: agent update own" ON public.leads;
CREATE POLICY "leads: agent update own" ON public.leads
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_active_staff()) AND assigned_agent_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_active_staff()) AND assigned_agent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "communications: staff select all" ON public.communications;
DROP POLICY IF EXISTS "communications: agent select own" ON public.communications;
CREATE POLICY "communications: agent select own" ON public.communications
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "communications: staff insert any" ON public.communications;
DROP POLICY IF EXISTS "communications: agent insert own" ON public.communications;
CREATE POLICY "communications: agent insert own" ON public.communications
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT public.is_active_staff()) AND logged_by = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "kyc: staff select all" ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc: agent select own clients" ON public.kyc_documents;
CREATE POLICY "kyc: agent select own clients" ON public.kyc_documents
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = client_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "transactions: staff select all" ON public.transactions;
DROP POLICY IF EXISTS "transactions: agent select own clients" ON public.transactions;
CREATE POLICY "transactions: agent select own clients" ON public.transactions
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = client_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity: staff select all" ON public.lead_activity;
DROP POLICY IF EXISTS "activity: agent select" ON public.lead_activity;
CREATE POLICY "activity: agent select" ON public.lead_activity
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity: staff insert any" ON public.lead_activity;
DROP POLICY IF EXISTS "activity: agent insert" ON public.lead_activity;
CREATE POLICY "activity: agent insert" ON public.lead_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff()) AND actor_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "deposit-screenshots: staff select all" ON storage.objects;
DROP POLICY IF EXISTS "deposit-screenshots: agent select own clients" ON storage.objects;
CREATE POLICY "deposit-screenshots: agent select own clients" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'deposit-screenshots' AND
    (SELECT public.is_active_staff()) AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id::text = (storage.foldername(name))[1]
      AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

-- Found in the same live audit, same root cause: communication_logs (the
-- MANUAL notes log, distinct from the auto-logged `communications` table
-- above) was also never actually scoped, despite loadCommLog()'s own code
-- comment in index.html already claiming "RLS scopes this to all rows for
-- Admins and assigned-lead rows for Agents." The comment described the
-- intent; the live policy never enforced it.
DROP POLICY IF EXISTS "comm_logs_staff_select_all" ON public.communication_logs;
DROP POLICY IF EXISTS "comm_logs_agent_select_own" ON public.communication_logs;
CREATE POLICY "comm_logs_agent_select_own" ON public.communication_logs
  FOR SELECT TO authenticated USING (
    (SELECT public.is_active_staff()) AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );

-- comm_logs_staff_insert_any is left as-is: it lets any active staff member
-- CREATE a manual note (WITH CHECK is_active_staff(), no lead-assignment
-- requirement), which is a real, separate policy question - Muhammad's
-- explicit call, not assumed here - about whether only a lead's own agent
-- may log a note on it. The bug being fixed today is agents READING other
-- agents' logs, which this migration closes; insert scope is unchanged.
