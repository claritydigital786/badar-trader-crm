-- Indexes for the three hot paths, each added only because EXPLAIN ANALYZE on
-- the real production tables showed a material win. Nothing speculative.
--
-- Measured on production (leads 7,701 rows / communications 16,005 rows):
--
--   All Leads page 1     select * from leads order by created_at desc, id limit 100
--                        BEFORE  Seq Scan 7,701 rows + top-N heapsort   11.02 ms
--                        AFTER   Index Scan                              0.81 ms   (13x)
--
--   Agent My Leads p1    ... where assigned_agent_id = $1 order by created_at desc limit 100
--                        BEFORE  Seq Scan 1,412 rows + top-N heapsort    3.35 ms
--                        AFTER   Index Scan, 100 rows touched            0.15 ms   (22x)
--
--   Open conversation    select * from communications where lead_id = $1 order by created_at
--                        BEFORE  Seq Scan 16,005 rows                    5.08 ms
--                        AFTER   Index Scan, 6 rows touched              0.97 ms   (5x)
--
-- The multiplier is the smaller half of the point. Every "BEFORE" plan above
-- scans the whole table to return one page, so its cost grows with the table;
-- the index versions touch only the rows in the page and stay flat. At 7,700
-- leads that is milliseconds, which is exactly why this was never noticed -
-- at 50,000 it is not.
--
-- Column order matters: the leading column is the equality filter and the
-- trailing column supplies the ORDER BY, so Postgres can satisfy filter and
-- sort from one index and stop after LIMIT rows.
--
-- Deliberately NOT added: an index for dashboard_summary(). Its aggregate
-- reads every production row by definition ('all' range scans 7,701 of 7,701;
-- '30d' scans 7,588), so an index cannot help it - measured at 4.2 ms and
-- 4.9 ms respectively, which needs no fixing. leads.status / leads.source are
-- also left alone: they are low-cardinality filters that the planner already
-- resolves inside the composite scans above, and no measurement justified them.
-- idx_leads_needs_human and idx_leads_wa_channel already exist and are untouched.
--
-- Written non-concurrently on purpose: these tables are small enough that the
-- build takes milliseconds, and CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction this migration is applied in.

create index if not exists idx_leads_created_at_id
  on public.leads (created_at desc, id);

create index if not exists idx_leads_agent_created_at
  on public.leads (assigned_agent_id, created_at desc);

create index if not exists idx_communications_lead_created_at
  on public.communications (lead_id, created_at);

analyze public.leads;
analyze public.communications;
