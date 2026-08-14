-- Authenticate database-to-Edge-Function calls without storing the secret in Git.
-- Before deploying the matching Edge Function sources, create one identical,
-- high-entropy value in both places:
--   1. Edge Function secret: INTERNAL_FUNCTION_SECRET
--   2. Supabase Vault secret named: internal_function_secret
-- Also store this environment's own Supabase URL in Vault as project_url.
-- If either side is missing or different, the functions fail closed and send nothing.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'nudge-agents-every-15-min-business-hours',
  '*/15 4-12 * * *',
  $job$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1), '/') || '/functions/v1/nudge-agents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-function-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'internal_function_secret');
  $job$
);

SELECT cron.schedule(
  'nudge-agents-6pm-pkt-close',
  '0 13 * * *',
  $job$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1), '/') || '/functions/v1/nudge-agents',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-function-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'internal_function_secret');
  $job$
);

SELECT cron.schedule(
  'send-follow-ups-every-30-min-business-hours',
  '*/30 4-12 * * *',
  $job$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1), '/') || '/functions/v1/send-follow-ups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-function-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1),
        ''
      )
    ),
    body := '{}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'internal_function_secret');
  $job$
);

CREATE OR REPLACE FUNCTION public.fire_automation_event(p_trigger_event TEXT, p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_url TEXT;
  v_internal_secret TEXT;
BEGIN
  -- This function is an internal trigger target, not a public RPC endpoint.
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'fire_automation_event may only run from a database trigger';
  END IF;

  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_function_secret' LIMIT 1;
  IF NULLIF(v_project_url, '') IS NULL OR NULLIF(v_internal_secret, '') IS NULL THEN
    RAISE WARNING 'fire_automation_event skipped because project_url or internal_function_secret is absent from Vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/fire-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-function-secret', v_internal_secret
    ),
    body := jsonb_build_object('trigger_event', p_trigger_event, 'lead_id', p_lead_id)
  );
END;
$$;

-- Client roles must not be able to invoke the dispatcher through PostgREST.
-- The four trigger functions run as their owner so legitimate row changes can
-- still dispatch after this EXECUTE privilege is removed from authenticated.
REVOKE ALL ON FUNCTION public.fire_automation_event(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fire_automation_event(TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_leads_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.fire_automation_event('lead_created', NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_leads_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.fire_automation_event('status_changed', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_leads_kyc_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kyc_status = 'verified' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    PERFORM public.fire_automation_event('kyc_verified', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_transactions_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM public.fire_automation_event('deposit_recorded', NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_leads_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_leads_status_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_leads_kyc_verified() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_transactions_deposit() FROM PUBLIC, anon, authenticated;
