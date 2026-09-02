-- Dashboard KPIs computed in SQL instead of in the browser.
--
-- Before this, the admin/super-admin Dashboard could not paint a single KPI
-- until the browser had downloaded the whole leads table twice: once via
-- loadAdminLeads() (select * -> 8.8 MB of JSON, 7,701 rows, paged 1,000 at a
-- time) which the bootstrap awaited before anything else ran, and again via
-- fetchAllLeadsForDashboard() (1.1 MB) inside renderDashboardStats(). ~9.9 MB
-- and two full table reads to render numbers that are eight integers and a
-- sum. That is the 8-10 second "Loading... - -" the Dashboard showed on every
-- hard refresh, and it grows with the table.
--
-- This returns exactly those aggregates - tens of bytes - and nothing else.
-- No lead rows ever leave the database for the Dashboard again.
--
-- BUSINESS RULES ARE COPIED, NOT REDESIGNED. Each one below mirrors the
-- existing JavaScript one-for-one:
--   * production set   = productionLeads()/isBotTestLead(): a lead is excluded
--                        only when it is BOTH wa_channel '6541' AND created on
--                        or after the 2026-09-02 TEST cutover. Historical 6541
--                        and untagged leads stay in, exactly as today.
--   * approved AUM     = approvedAum()/isApprovedDeposit(): status='converted'
--                        only. Pending/returned/unverified contribute 0.
--   * range filter     = filterLeadsByDashRange(): 'today' is a calendar day in
--                        the workspace timezone; 7d/30d/90d are rolling windows
--                        measured from now, not calendar boundaries.
--   * gauge rates      = count / total of the SAME range-filtered production
--                        set, so the denominators cannot drift from the cards.
--   * trend            = last 30 UTC days, counted from the range-filtered set
--                        (matching renderDashboardCharts, which builds its
--                        30-day axis from whatever range is selected).
-- Nothing here touches deposit workflow, payroll, agent ownership, the number
-- hierarchy or historical attribution.
--
-- SECURITY: SECURITY DEFINER so it can aggregate across all leads, but gated on
-- the project's existing is_admin() (admin + super_admin) and granted only to
-- authenticated. An agent calling it is refused - agents have their own scoped
-- dashboard and must never receive org-wide totals.

create or replace function public.dashboard_summary(
  p_range text default 'all',
  p_tz    text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cutover constant timestamptz := '2026-09-02T00:00:00Z';
  v_since   timestamptz;
  v_today   boolean := (p_range = 'today');
  v_out     jsonb;
begin
  if not is_admin() then
    raise exception 'dashboard_summary is restricted to admin and super_admin'
      using errcode = '42501';
  end if;

  -- Rolling windows measured from now(), matching the JS exactly.
  v_since := case p_range
               when '7d'  then now() - interval '7 days'
               when '30d' then now() - interval '30 days'
               when '90d' then now() - interval '90 days'
               else null
             end;

  with scoped as (
    select l.status, l.needs_human, l.account_balance, l.deposit_platform, l.created_at
    from leads l
    where
      -- production set: exclude ONLY post-cutover 6541 bot-test traffic
      (l.wa_channel is distinct from '6541' or l.created_at < v_cutover)
      and (v_since is null or l.created_at >= v_since)
      and (not v_today
           or (l.created_at at time zone p_tz)::date = (now() at time zone p_tz)::date)
  ),
  totals as (
    select
      count(*)                                                   as total,
      count(*) filter (where status = 'new')                     as new,
      count(*) filter (where status = 'qualified')               as qualified,
      count(*) filter (where status = 'converted')               as converted,
      count(*) filter (where needs_human)                        as needs_human,
      coalesce(sum(account_balance) filter (where status = 'converted'), 0) as approved_aum
    from scoped
  ),
  by_status as (
    select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) j
    from (select status, count(*) n from scoped where status is not null group by status) s
  ),
  by_platform as (
    -- Mirrors the dash-rev-platform line: approved deposits with a real
    -- platform and a non-zero balance.
    select coalesce(jsonb_object_agg(deposit_platform, amt), '{}'::jsonb) j
    from (
      select deposit_platform, sum(account_balance) amt
      from scoped
      where status = 'converted' and deposit_platform is not null
        and coalesce(account_balance, 0) <> 0
      group by deposit_platform
    ) p
  ),
  trend as (
    -- One row per day, 30 rows maximum - never the underlying leads.
    select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) j
    from (
      select (created_at at time zone 'UTC')::date::text d, count(*) n
      from scoped
      where created_at >= (now() at time zone 'UTC')::date - interval '29 days'
      group by 1
    ) t
  ),
  agents as (
    select count(*) n from profiles
    where role = 'agent' and coalesce(is_suspended, false) = false
  )
  select jsonb_build_object(
    'total',        t.total,
    'new',          t.new,
    'qualified',    t.qualified,
    'converted',    t.converted,
    'needs_human',  t.needs_human,
    'approved_aum', t.approved_aum,
    'by_status',    s.j,
    'by_platform',  p.j,
    'trend',        r.j,
    'active_agents', a.n,
    'range',        p_range,
    'generated_at', now()
  )
  into v_out
  from totals t, by_status s, by_platform p, trend r, agents a;

  return v_out;
end;
$$;

revoke all on function public.dashboard_summary(text, text) from public, anon;
grant execute on function public.dashboard_summary(text, text) to authenticated;

comment on function public.dashboard_summary(text, text) is
  'Admin/super-admin Dashboard KPI aggregates. Replaces two full leads-table downloads (~9.9 MB) with one small JSON result. Business rules mirror productionLeads(), approvedAum() and filterLeadsByDashRange() exactly.';
