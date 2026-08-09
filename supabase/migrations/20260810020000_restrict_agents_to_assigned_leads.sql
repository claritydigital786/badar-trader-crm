-- Restore assigned-lead isolation after every pooled Phase 15 policy migration.
--
-- Admin policies remain unchanged. Active Agents can read and update only
-- leads assigned to their own auth user, and can access only records attached
-- to those leads. Service-role Edge Functions continue to bypass RLS.

CREATE INDEX IF NOT EXISTS leads_assigned_agent_id_idx
  ON public.leads (assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

DROP POLICY IF EXISTS "leads: staff select all" ON public.leads;
DROP POLICY IF EXISTS "leads: agent select own" ON public.leads;
CREATE POLICY "leads: agent select own" ON public.leads
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND assigned_agent_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "leads: staff update all" ON public.leads;
DROP POLICY IF EXISTS "leads: agent update own" ON public.leads;
CREATE POLICY "leads: agent update own" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND assigned_agent_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND assigned_agent_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "communications: staff select all" ON public.communications;
DROP POLICY IF EXISTS "communications: agent select own" ON public.communications;
CREATE POLICY "communications: agent select own" ON public.communications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = communications.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "communications: staff insert any" ON public.communications;
DROP POLICY IF EXISTS "communications: agent insert own" ON public.communications;
CREATE POLICY "communications: agent insert own" ON public.communications
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND logged_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = communications.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "transactions: staff select all" ON public.transactions;
DROP POLICY IF EXISTS "transactions: agent select own clients" ON public.transactions;
CREATE POLICY "transactions: agent select own clients" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = transactions.client_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "kyc: staff select all" ON public.kyc_documents;
DROP POLICY IF EXISTS "kyc: agent select own clients" ON public.kyc_documents;
CREATE POLICY "kyc: agent select own clients" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = kyc_documents.client_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity: staff select all" ON public.lead_activity;
DROP POLICY IF EXISTS "activity: agent select" ON public.lead_activity;
CREATE POLICY "activity: agent select" ON public.lead_activity
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = lead_activity.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "activity: staff insert any" ON public.lead_activity;
DROP POLICY IF EXISTS "activity: agent insert" ON public.lead_activity;
CREATE POLICY "activity: agent insert" ON public.lead_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND actor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = lead_activity.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "communication_logs: staff select all" ON public.communication_logs;
DROP POLICY IF EXISTS "communication_logs: admin full access" ON public.communication_logs;
CREATE POLICY "communication_logs: admin full access" ON public.communication_logs
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "communication_logs: agent select own" ON public.communication_logs;
CREATE POLICY "communication_logs: agent select own" ON public.communication_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = communication_logs.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "communication_logs: staff insert any" ON public.communication_logs;
DROP POLICY IF EXISTS "communication_logs: agent insert own" ON public.communication_logs;
CREATE POLICY "communication_logs: agent insert own" ON public.communication_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id = communication_logs.lead_id
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "appointments: staff full access" ON public.appointments;
DROP POLICY IF EXISTS "appointments: admin full access" ON public.appointments;
CREATE POLICY "appointments: admin full access" ON public.appointments
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "appointments: agent own" ON public.appointments;
DROP POLICY IF EXISTS "appointments: agent select own" ON public.appointments;
DROP POLICY IF EXISTS "appointments: agent insert own" ON public.appointments;
DROP POLICY IF EXISTS "appointments: agent update own" ON public.appointments;
DROP POLICY IF EXISTS "appointments: agent delete own" ON public.appointments;

CREATE POLICY "appointments: agent select own" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND agent_id = (SELECT auth.uid())
  );

CREATE POLICY "appointments: agent insert own" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND agent_id = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "appointments: agent update own" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND agent_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.is_active_staff())
    AND agent_id = (SELECT auth.uid())
  );

CREATE POLICY "appointments: agent delete own" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_active_staff())
    AND agent_id = (SELECT auth.uid())
  );

CREATE OR REPLACE FUNCTION public.protect_appointment_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.created_by IS DISTINCT FROM NEW.created_by
     AND (SELECT auth.role()) = 'authenticated'
     AND NOT (SELECT public.is_admin()) THEN
    RAISE EXCEPTION 'Agents cannot change appointment created_by'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_protect_created_by ON public.appointments;
CREATE TRIGGER appointments_protect_created_by
  BEFORE UPDATE OF created_by ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_created_by();

DROP POLICY IF EXISTS "kyc-documents: agent select own clients" ON storage.objects;
CREATE POLICY "kyc-documents: agent select own clients" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id::text = (storage.foldername(storage.objects.name))[1]
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "deposit-screenshots: agent select own clients" ON storage.objects;
CREATE POLICY "deposit-screenshots: agent select own clients" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'deposit-screenshots'
    AND (SELECT public.is_active_staff())
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lead.id::text = (storage.foldername(storage.objects.name))[1]
        AND lead.assigned_agent_id = (SELECT auth.uid())
    )
  );
