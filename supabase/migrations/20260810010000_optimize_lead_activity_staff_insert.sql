-- Avoid re-evaluating auth helpers for every row in a bulk activity insert.

DROP POLICY IF EXISTS "activity: staff insert any" ON public.lead_activity;

CREATE POLICY "activity: staff insert any" ON public.lead_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND actor_id = (SELECT auth.uid())
  );
