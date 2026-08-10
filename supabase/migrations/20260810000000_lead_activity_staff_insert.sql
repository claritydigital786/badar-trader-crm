-- Align activity inserts with the pooled active-staff access model.
--
-- Phase 15 changed lead and activity visibility from assigned-agent-only to
-- pooled staff access. The old activity INSERT policy was left behind, so an
-- agent could open a teammate's lead but could not use the Log Activity form
-- for it. The User Permission screen explicitly says active agents can log
-- activity on every active lead.

DROP POLICY IF EXISTS "activity: agent insert" ON public.lead_activity;
DROP POLICY IF EXISTS "activity: staff insert any" ON public.lead_activity;

CREATE POLICY "activity: staff insert any" ON public.lead_activity
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff() AND actor_id = auth.uid());
