-- Payroll persistence: reusable agent compensation settings and saved run snapshots.
-- Created manually because the Supabase CLI is not installed on this laptop.

CREATE TABLE IF NOT EXISTS public.payroll_settings (
  agent_id            UUID          PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_salary_monthly NUMERIC(15,2) NOT NULL DEFAULT 500 CHECK (base_salary_monthly >= 0),
  commission_percent  NUMERIC(6,3)  NOT NULL DEFAULT 5 CHECK (commission_percent BETWEEN 0 AND 100),
  updated_by          UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type        TEXT          NOT NULL CHECK (period_type IN ('daily','weekly','biweekly','monthly')),
  period_start       TIMESTAMPTZ   NOT NULL,
  period_end         TIMESTAMPTZ   NOT NULL,
  result_rows        JSONB         NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(result_rows) = 'array'),
  total_revenue      NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  total_commission   NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_commission >= 0),
  total_pay          NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_pay >= 0),
  created_by         UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS payroll_runs_created_at_idx
  ON public.payroll_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_settings_updated_by_idx
  ON public.payroll_settings (updated_by);
CREATE INDEX IF NOT EXISTS payroll_runs_created_by_idx
  ON public.payroll_runs (created_by);

DROP TRIGGER IF EXISTS payroll_settings_updated_at ON public.payroll_settings;
CREATE TRIGGER payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs     ENABLE ROW LEVEL SECURITY;

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

-- New Supabase projects no longer expose new public tables automatically.
-- Older projects may still add broad default grants, so revoke first.
REVOKE ALL ON TABLE public.payroll_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.payroll_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_settings TO authenticated;
GRANT SELECT, INSERT ON TABLE public.payroll_runs TO authenticated;
