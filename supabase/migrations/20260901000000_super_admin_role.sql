-- Phase 39 - a super_admin role above admin (Muhammad, 2026-09-01)
--
-- Real hierarchy change, requested directly: Ehsan becomes the day-to-day
-- admin (approves deposit screenshots/converts leads, the role Badar was
-- sitting in only because he was the original admin, not because the
-- approval flow needs to be him specifically). Badar moves up to a new
-- super_admin role, above admin, not replaced by Ehsan.
--
-- Single choke point: every RLS policy and the Converted-approval trigger
-- (20260831041000_restrict_converted_to_admins.sql) already gate on
-- public.is_admin() alone, never on a raw role='admin' comparison. So this
-- widens that one function to treat super_admin as admin-or-above, and every
-- existing policy extends to super_admin with no per-policy changes needed.
-- A super_admin can do everything an admin can, plus whatever the frontend
-- chooses to reserve for super_admin specifically in the future - none of
-- that reservation exists yet, this migration only adds the role itself.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'super_admin'));

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
