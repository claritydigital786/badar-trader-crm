-- Production KPI separation: bot-test traffic must not inflate business
-- figures, and no genuine historical lead may be reclassified to get there.
-- Runs against the real migration, on a throwaway local Postgres.
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

CREATE OR REPLACE FUNCTION t(label text, got anyelement, want anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS NOT DISTINCT FROM want THEN RAISE NOTICE 'PASS %', label;
  ELSE RAISE NOTICE 'FAIL % - got %, want %', label, got, want; END IF;
END; $$;

-- ── Seed: the real production shape, in miniature ──────────────
INSERT INTO profiles (id, full_name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ehsan Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Muhammad Hanzala', 'agent'),
  ('33333333-3333-3333-3333-333333333333', 'Idle Agent', 'agent');

INSERT INTO leads (id, full_name, status, source, wa_channel, created_at, assigned_agent_id) VALUES
  -- Historical, untagged: the bulk of production. Never attributed anywhere.
  ('a0000000-0000-0000-0000-000000000001', 'Historical A', 'new',       'meta', NULL,   '2026-07-15Z', '22222222-2222-2222-2222-222222222222'),
  ('a0000000-0000-0000-0000-000000000002', 'Historical B', 'converted', 'meta', NULL,   '2026-07-20Z', '22222222-2222-2222-2222-222222222222'),
  -- 6541 while 6541 WAS the live line: genuine customers, one of them qualified.
  ('a0000000-0000-0000-0000-000000000003', 'Early 6541',   'qualified', 'meta', '6541', '2026-08-12Z', '22222222-2222-2222-2222-222222222222'),
  ('a0000000-0000-0000-0000-000000000004', 'Late 6541',    'new',       'meta', '6541', '2026-08-31T08:39:02Z', '22222222-2222-2222-2222-222222222222'),
  -- The live primary line.
  ('a0000000-0000-0000-0000-000000000005', 'Live 3903',    'new',       'meta', '3903', '2026-08-28Z', '22222222-2222-2222-2222-222222222222'),
  -- Bot-test traffic: on 6541, after the cutover. The only excludable row.
  ('a0000000-0000-0000-0000-000000000006', 'Bot Test',     'converted', 'meta', '6541', '2026-09-02T09:00:00Z', '22222222-2222-2222-2222-222222222222');

-- The exact row that exposed the NULL defect: untagged, created after the
-- cutover. It is a legitimate production lead and must be counted.
INSERT INTO leads (id, full_name, status, source, wa_channel, created_at, assigned_agent_id) VALUES
  ('a0000000-0000-0000-0000-000000000007', 'Untagged After Cutover', 'new', 'meta', NULL, '2026-09-02T10:00:00Z', '22222222-2222-2222-2222-222222222222');

SET test.uid = '11111111-1111-1111-1111-111111111111';

-- ── The predicate itself ───────────────────────────────────────
SELECT t('untagged historical is production',        public.is_bot_test_lead(NULL,   '2026-07-15Z'::timestamptz), false);
SELECT t('3903 is production',                       public.is_bot_test_lead('3903', '2026-09-05Z'::timestamptz), false);
SELECT t('6541 before the cutover is production',    public.is_bot_test_lead('6541', '2026-08-12Z'::timestamptz), false);
SELECT t('6541 the day before is production',        public.is_bot_test_lead('6541', '2026-09-01T23:59:59Z'::timestamptz), false);
SELECT t('6541 at the cutover instant is test',      public.is_bot_test_lead('6541', '2026-09-02T00:00:00Z'::timestamptz), true);
SELECT t('6541 after the cutover is test',           public.is_bot_test_lead('6541', '2026-09-09Z'::timestamptz), true);
-- These four are the regression guard for the NULL-propagation defect found
-- on 2026-09-02: the predicate must return a strict boolean in every case,
-- because every caller filters with `WHERE NOT is_bot_test_lead(...)` and
-- `NOT NULL` is NULL, which silently DROPS the row instead of keeping it.
SELECT t('a NULL date is never test, and is not NULL either',
  public.is_bot_test_lead('6541', NULL), false);
SELECT t('an untagged lead created after the cutover is production, not NULL',
  public.is_bot_test_lead(NULL, '2026-09-05Z'::timestamptz), false);
SELECT t('both arguments NULL is still a strict false',
  public.is_bot_test_lead(NULL, NULL), false);
SELECT t('the predicate is never NULL for any input combination',
  (SELECT bool_and(public.is_bot_test_lead(c, d) IS NOT NULL)
   FROM unnest(ARRAY[NULL, '3903', '6541', 'other']::text[]) c
   CROSS JOIN unnest(ARRAY[NULL, '2026-07-01Z', '2026-09-02Z', '2026-12-01Z']::timestamptz[]) d), true);

-- ── Agent Performance ──────────────────────────────────────────
SELECT t('Hanzala counts 6 of his 7 leads, excluding only the bot test',
  (SELECT leads_assigned FROM public.report_agent_performance()
   WHERE agent_id = '22222222-2222-2222-2222-222222222222'), 6::bigint);
SELECT t('the untagged post-cutover lead is counted, not dropped by NULL',
  (SELECT leads_assigned FROM public.report_agent_performance()
   WHERE agent_id = '22222222-2222-2222-2222-222222222222')
  - (SELECT leads_assigned FROM public.report_agent_performance()
     WHERE agent_id = '33333333-3333-3333-3333-333333333333'), 6::bigint);
SELECT t('the bot-test conversion does not count towards his converted total',
  (SELECT converted FROM public.report_agent_performance()
   WHERE agent_id = '22222222-2222-2222-2222-222222222222'), 1::bigint);
SELECT t('the qualified 6541 customer is still his - a blanket exclusion would have dropped it',
  (SELECT count(*) FROM public.leads
   WHERE assigned_agent_id = '22222222-2222-2222-2222-222222222222'
     AND status = 'qualified' AND NOT public.is_bot_test_lead(wa_channel, created_at)), 1::bigint);
SELECT t('an agent with no leads still appears (LEFT JOIN preserved)',
  (SELECT leads_assigned FROM public.report_agent_performance()
   WHERE agent_id = '33333333-3333-3333-3333-333333333333'), 0::bigint);
-- Both agents, and no one else: the admin owns no leads, and the WHERE clause
-- (p.role = 'agent' OR the profile owns leads) is unchanged by this migration.
SELECT t('both agent rows are still returned, admin still excluded',
  (SELECT count(*) FROM public.report_agent_performance()), 2::bigint);

-- ── Lead Source Breakdown ──────────────────────────────────────
SELECT t('source totals exclude only the bot-test lead',
  (SELECT total_leads FROM public.report_source_performance() WHERE source = 'meta'), 6::bigint);
SELECT t('source conversions exclude only the bot-test conversion',
  (SELECT converted FROM public.report_source_performance() WHERE source = 'meta'), 1::bigint);

-- ── Nothing was read, written or reclassified ──────────────────
SELECT t('all seven leads still exist', (SELECT count(*) FROM public.leads), 7::bigint);
SELECT t('no wa_channel was changed',
  (SELECT string_agg(coalesce(wa_channel,'NULL'), ',' ORDER BY id) FROM public.leads),
  'NULL,NULL,6541,6541,3903,6541,NULL');
SELECT t('the bot-test lead is still present and still converted',
  (SELECT status FROM public.leads WHERE id = 'a0000000-0000-0000-0000-000000000006'), 'converted');
SELECT t('no transaction was created', (SELECT count(*) FROM public.transactions), 0::bigint);
SELECT t('no balance moved', (SELECT sum(account_balance) FROM public.leads), 0::numeric);

-- ── Admin gate is intact on both RPCs ──────────────────────────
SET test.uid = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM * FROM public.report_agent_performance();
  RAISE NOTICE 'FAIL an agent must not be able to call report_agent_performance';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS report_agent_performance still requires admin'; END $$;
DO $$ BEGIN
  PERFORM * FROM public.report_source_performance();
  RAISE NOTICE 'FAIL an agent must not be able to call report_source_performance';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS report_source_performance still requires admin'; END $$;

-- ── Grants on the new predicate ────────────────────────────────
SELECT t('anon may not execute is_bot_test_lead',
  has_function_privilege('anon', 'public.is_bot_test_lead(text, timestamptz)', 'EXECUTE'), false);
SELECT t('authenticated may execute is_bot_test_lead',
  has_function_privilege('authenticated', 'public.is_bot_test_lead(text, timestamptz)', 'EXECUTE'), true);
