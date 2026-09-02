-- Agent dashboard KPIs computed in SQL.
--
-- loadAgentLeads() ran at agent login and did select('*') with no bound: every
-- lead assigned to that agent, all columns, purely so four numbers could be
-- counted in JavaScript. Measured on production: Hanzala 1,412 rows / 1.6 MB,
-- Faisal 1,090 rows / 1.2 MB - to render "My Leads / New / Converted / Revenue".
-- Same anti-pattern as the admin Dashboard, one table smaller.
--
-- SECURITY INVOKER on purpose: the existing agent RLS policy on leads already
-- restricts an agent to their own rows, so this inherits that boundary instead
-- of re-implementing it. The explicit assigned_agent_id = auth.uid() predicate
-- makes the scope true regardless of who calls it, so an admin calling this
-- gets their own assigned leads (Ehsan carries a real agent caseload) rather
-- than org-wide totals - matching what the agent dashboard has always shown.
--
-- Business rules copied verbatim from loadAgentLeads():
--   * production subset only - productionLeads()/isBotTestLead(), the same
--     2026-09-02 cutover rule, so bot-test traffic cannot inflate an agent's
--     own figures.
--   * revenue = approvedAum() = sum(account_balance) where status='converted'.
--   * in_pipeline = status not in ('converted','lost'), the pipeline gauge.
-- Payroll, commission, ownership and the deposit workflow are untouched.

create or replace function public.agent_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select status, account_balance, created_at
    from leads
    where assigned_agent_id = auth.uid()
      and (wa_channel is distinct from '6541' or created_at < timestamptz '2026-09-02T00:00:00Z')
  )
  select jsonb_build_object(
    'total',        count(*),
    'new',          count(*) filter (where status = 'new'),
    'converted',    count(*) filter (where status = 'converted'),
    'approved_aum', coalesce(sum(account_balance) filter (where status = 'converted'), 0),
    -- renderAgentDashboardExtras()'s pipeline gauge: everything still being
    -- worked, i.e. not yet converted and not lost.
    'in_pipeline',  count(*) filter (where status not in ('converted','lost')),
    -- "My Pipeline" bar breakdown: one entry per status, not one row per lead.
    'by_status',    coalesce((select jsonb_object_agg(status, n)
                              from (select status, count(*) n from scoped
                                    where status is not null group by status) b), '{}'::jsonb),
    -- "My 30-day trend": at most 30 pre-grouped daily counts, never one row
    -- per lead. Same UTC day key the admin Dashboard's trend uses.
    'trend',        coalesce((select jsonb_object_agg(d, n)
                              from (select (created_at at time zone 'UTC')::date::text d, count(*) n
                                    from scoped
                                    where created_at >= (now() at time zone 'UTC')::date - interval '29 days'
                                    group by 1) t), '{}'::jsonb)
  )
  from scoped;
$$;

revoke all on function public.agent_summary() from public, anon;
grant execute on function public.agent_summary() to authenticated;

comment on function public.agent_summary() is
  'Per-agent dashboard KPIs. Replaces downloading every assigned lead (1.6 MB for the largest caseload) with one small JSON result. SECURITY INVOKER so leads RLS applies.';
