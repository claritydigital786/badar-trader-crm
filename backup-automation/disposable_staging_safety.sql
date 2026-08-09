-- DISPOSABLE STAGING ONLY. Never apply this file to production.
--
-- The authoritative schema contains production pg_net URLs and scheduled jobs.
-- Apply this immediately after building a disposable staging schema and before
-- seeding or restoring any lead or transaction. restore.php refuses to write
-- until the verification function at the bottom proves these controls hold.

ALTER TABLE public.leads DISABLE TRIGGER automation_lead_created;
ALTER TABLE public.leads DISABLE TRIGGER automation_status_changed;
ALTER TABLE public.leads DISABLE TRIGGER automation_kyc_verified;
ALTER TABLE public.transactions DISABLE TRIGGER automation_deposit_recorded;

CREATE OR REPLACE FUNCTION public.fire_automation_event(p_trigger_event TEXT, p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE DEBUG 'Disposable staging suppressed automation event % for lead %',
    p_trigger_event, p_lead_id;
END;
$$;

DO $$
DECLARE
  job RECORD;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job IN EXECUTE
      'SELECT jobid FROM cron.job WHERE command ILIKE ''%vfskqzgphrunjxquqpks%'''
    LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_disposable_restore_safety()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  enabled_trigger_count INTEGER;
  production_cron_count INTEGER := 0;
  production_callback_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO enabled_trigger_count
  FROM pg_catalog.pg_trigger
  WHERE tgrelid IN ('public.leads'::regclass, 'public.transactions'::regclass)
    AND tgname IN (
      'automation_lead_created',
      'automation_status_changed',
      'automation_kyc_verified',
      'automation_deposit_recorded'
    )
    AND tgenabled <> 'D';

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM cron.job WHERE command ILIKE ''%vfskqzgphrunjxquqpks%'''
    INTO production_cron_count;
  END IF;

  SELECT COUNT(*)
  INTO production_callback_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fire_automation_event'
    AND p.prosrc ILIKE '%vfskqzgphrunjxquqpks%';

  IF enabled_trigger_count <> 0
     OR production_cron_count <> 0
     OR production_callback_count <> 0 THEN
    RAISE EXCEPTION 'Disposable staging outbound safety check failed';
  END IF;

  RETURN 'BADAR_DISPOSABLE_STAGING_SAFE_V1';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_disposable_restore_safety() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_disposable_restore_safety() TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_disposable_restore_auth_ids(p_profile_ids UUID[])
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  missing_auth_user_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO missing_auth_user_count
  FROM (
    SELECT DISTINCT requested.profile_id
    FROM unnest(COALESCE(p_profile_ids, ARRAY[]::UUID[])) AS requested(profile_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      WHERE auth_user.id = requested.profile_id
    )
  ) AS missing_auth_users;

  IF missing_auth_user_count <> 0 THEN
    RAISE EXCEPTION 'Disposable staging is missing % archived Auth user ID(s)',
      missing_auth_user_count;
  END IF;

  RETURN 'BADAR_DISPOSABLE_AUTH_IDS_READY_V1';
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_disposable_restore_auth_ids(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_disposable_restore_auth_ids(UUID[]) TO service_role;
