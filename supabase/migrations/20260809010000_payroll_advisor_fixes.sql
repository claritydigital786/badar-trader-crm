-- Tighten grants and address the advisor findings discovered after the
-- payroll persistence migration was verified against the live project.

CREATE INDEX IF NOT EXISTS payroll_settings_updated_by_idx
  ON public.payroll_settings (updated_by);
CREATE INDEX IF NOT EXISTS payroll_runs_created_by_idx
  ON public.payroll_runs (created_by);

DROP POLICY IF EXISTS "payroll_settings: admin full access" ON public.payroll_settings;
CREATE POLICY "payroll_settings: admin full access" ON public.payroll_settings
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "payroll_runs: admin read" ON public.payroll_runs;
CREATE POLICY "payroll_runs: admin read" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "payroll_runs: admin insert" ON public.payroll_runs;
CREATE POLICY "payroll_runs: admin insert" ON public.payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()) AND created_by = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.payroll_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.payroll_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_settings TO authenticated;
GRANT SELECT, INSERT ON TABLE public.payroll_runs TO authenticated;

