-- Harden helper and trigger functions that predate the disposable-staging
-- security pass. Trigger functions are not client RPCs. Report functions
-- remain callable by signed-in users, but still enforce is_admin() internally.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_suspended, false) = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'agent'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE OR REPLACE FUNCTION public.audit_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data)
    VALUES (auth.uid(), 'leads', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_leads() TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

CREATE OR REPLACE FUNCTION public.set_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_status_changed_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_status_changed_at() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_leads_admin_only_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_leads_admin_only_columns() TO service_role;

CREATE OR REPLACE FUNCTION public.report_agent_performance()
RETURNS TABLE(agent_id uuid, agent_name text, leads_assigned bigint, converted bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name,
           COUNT(l.id) AS leads_assigned,
           COUNT(l.id) FILTER (WHERE l.status = 'converted') AS converted
    FROM public.profiles AS p
    LEFT JOIN public.leads AS l ON l.assigned_agent_id = p.id
    WHERE p.role = 'agent'
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_source_performance()
RETURNS TABLE(source text, total_leads bigint, converted bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT l.source,
           COUNT(*) AS total_leads,
           COUNT(*) FILTER (WHERE l.status = 'converted') AS converted
    FROM public.leads AS l
    GROUP BY l.source
    ORDER BY total_leads DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_financial_summary()
RETURNS TABLE(total_deposits numeric, total_withdrawals numeric, net_aum numeric, verified_clients bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deposits numeric;
  withdrawals numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT COALESCE(SUM(t.amount), 0)
    INTO deposits
    FROM public.transactions AS t
    WHERE t.type = 'deposit';
  SELECT COALESCE(SUM(t.amount), 0)
    INTO withdrawals
    FROM public.transactions AS t
    WHERE t.type = 'withdrawal';
  RETURN QUERY
    SELECT deposits, withdrawals, (deposits - withdrawals),
           (SELECT COUNT(*) FROM public.leads AS l WHERE l.kyc_status = 'verified');
END;
$$;

REVOKE ALL ON FUNCTION public.report_agent_performance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_source_performance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_financial_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_agent_performance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_source_performance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_financial_summary() TO authenticated, service_role;
