-- Let an agent read their own payroll settings (base salary + commission %),
-- so the agent-side Dashboard can show a real "My Payroll" estimate instead
-- of nothing. payroll_settings was admin-only until now (schema.sql, no
-- agent policy existed at all).
--
-- payroll_runs is deliberately NOT touched here: each run stores every
-- agent's calculated pay together in one JSONB column (result_rows), so RLS
-- can't scope it to "your own row" without leaking every other agent's
-- pay - the agent Dashboard computes its own live estimate client-side from
-- payroll_settings + the agent's own visible transactions instead, never
-- reading payroll_runs.

DROP POLICY IF EXISTS "payroll_settings: agent read own" ON public.payroll_settings;
CREATE POLICY "payroll_settings: agent read own" ON public.payroll_settings
  FOR SELECT TO authenticated
  USING ((SELECT is_active_staff()) AND agent_id = (SELECT auth.uid()));
