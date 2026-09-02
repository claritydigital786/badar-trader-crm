-- Phase 44 - keep bot-test traffic out of production reporting RPCs
-- (business owner's WhatsApp number hierarchy decision, 2026-09-02)
--
-- The decision: +92 371 5773903 is the ONLY live primary production number.
-- +971 52 558 6541 is a bot-testing number and nothing else. Activity on the
-- test number must not inflate genuine business-performance figures.
--
-- Why this is date-anchored and not a plain `wa_channel <> '6541'`:
--
-- Every one of the 201 leads tagged '6541' in this database today is a REAL
-- Meta-ad customer, acquired while 6541 was the only live number the business
-- had - all 201 of them predate this decision, and 20 of them are the CRM's
-- qualified leads. Measured against live production on 2026-09-02, a blanket
-- exclusion would have dropped Total Leads from 7,654 to 7,453 and Qualified
-- Leads from 21 to 1 - erasing real historical business performance and
-- retroactively relabelling genuine customers as test traffic. That is
-- precisely what the hierarchy decision said not to do ("do NOT delete
-- historical 6541 records", "only positively identified 6541 traffic should
-- be labelled TEST").
--
-- So a lead is bot-test traffic only when it is BOTH on 6541 AND arrived on
-- or after the day 6541 became a test-only number. Today that set is empty,
-- so every figure these two functions return is byte-for-byte unchanged;
-- every future test lead is excluded automatically.
--
-- Nothing here reads, writes, deletes or reclassifies a single row. No lead's
-- wa_channel is modified. Historical NULL/untagged leads are always kept -
-- they are legitimate records from before channel tracking existed and are
-- never attributed to either number.
--
-- Deliberately NOT changed: report_financial_summary(). It sums the
-- transactions ledger and the verified-client count, both of which belong to
-- the approved-deposit workflow. That workflow is out of scope for this
-- change, and a bot-test lead cannot reach an approved deposit anyway.

CREATE OR REPLACE FUNCTION public.is_bot_test_lead(p_wa_channel text, p_created_at timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  -- Strictly boolean: never NULL, in either argument.
  --
  -- The obvious `p_wa_channel = '6541' AND ...` is WRONG here and was caught
  -- against real production data on 2026-09-02 before this ever shipped. For
  -- an untagged lead it evaluates to NULL, and the callers below all filter
  -- with `WHERE NOT is_bot_test_lead(...)` - `NOT NULL` is NULL, so every
  -- historical/untagged lead created on or after the cutover would have been
  -- silently dropped from Total Leads, Agent Performance, Lead Source and the
  -- campaign funnel. One production lead already met that description the day
  -- this was written, and untagged leads keep arriving.
  --
  -- IS NOT DISTINCT FROM is NULL-safe by definition, and the explicit
  -- NULL-date guard makes an unknown created_at fail closed to "production",
  -- never to "test" - the same direction index.html's isBotTestLead() fails.
  SELECT p_wa_channel IS NOT DISTINCT FROM '6541'
     AND p_created_at IS NOT NULL
     AND p_created_at >= TIMESTAMPTZ '2026-09-02 00:00:00+00';
$$;

COMMENT ON FUNCTION public.is_bot_test_lead(text, timestamptz) IS
  'True only for leads conclusively identified as bot-testing traffic: arrived on +971 52 558 6541 on or after 2026-09-02, the day that number became test-only. Leads on 6541 from before that date are genuine customers from when 6541 was the live line, and NULL/untagged leads are historical records - both are production. Mirrors isBotTestLead() in index.html.';

-- Supabase grants EXECUTE on new public functions to anon/authenticated/
-- service_role by default. This one is a pure predicate over values the
-- caller already supplies, so it leaks nothing, but the grants are still made
-- explicit rather than left to a default.
REVOKE ALL ON FUNCTION public.is_bot_test_lead(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bot_test_lead(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_bot_test_lead(text, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_bot_test_lead(text, timestamptz) FROM anon;

-- Agent Performance. The exclusion goes in the LEFT JOIN condition, not a
-- WHERE clause: moving it to WHERE would turn the outer join inner and make
-- agents with no leads at all vanish from the table.
CREATE OR REPLACE FUNCTION public.report_agent_performance()
RETURNS TABLE(agent_id uuid, agent_name text, leads_assigned bigint, converted bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name,
           COUNT(l.id)                                        AS leads_assigned,
           COUNT(l.id) FILTER (WHERE l.status = 'converted')   AS converted
    FROM public.profiles p
    LEFT JOIN public.leads l
      ON l.assigned_agent_id = p.id
     AND NOT public.is_bot_test_lead(l.wa_channel, l.created_at)
    WHERE p.role = 'agent'
       OR EXISTS (SELECT 1 FROM public.leads l2 WHERE l2.assigned_agent_id = p.id)
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name;
END;
$function$;

-- Lead Source Breakdown.
CREATE OR REPLACE FUNCTION public.report_source_performance()
RETURNS TABLE(source text, total_leads bigint, converted bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT l.source,
           COUNT(*)                                        AS total_leads,
           COUNT(*) FILTER (WHERE l.status = 'converted')   AS converted
    FROM public.leads l
    WHERE NOT public.is_bot_test_lead(l.wa_channel, l.created_at)
    GROUP BY l.source
    ORDER BY total_leads DESC;
END;
$function$;
