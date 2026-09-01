-- Phase 43 - Agent Performance keeps anyone who still carries real leads
-- (Muhammad, 2026-09-01)
--
-- Direct side effect of today's hierarchy change, caught and confirmed by
-- Muhammad: report_agent_performance() only ever counted profiles with
-- role = 'agent'. The moment Ehsan moved to role = 'admin', he vanished from
-- this report entirely - even though he keeps working as a real sales agent
-- day to day (Muhammad's explicit call: "Ehsan will also fulfill his
-- responsibilities as a Sales agent... Keep Ehsan into the loop. Don't
-- expel him.").
--
-- Fix: include a profile if it's role = 'agent' (unchanged - shows every
-- agent even at zero leads, same as before) OR it actually has at least one
-- real lead assigned to it, regardless of role. This is deliberately
-- role-agnostic rather than hardcoding Ehsan by name or adding 'admin' to
-- the role filter outright - either of those would silently include every
-- other admin too (Badar included) whether or not they do real sales work.
-- Counting by real assignment instead means anyone who actually works leads
-- shows up here, and anyone who doesn't (a pure admin/owner) doesn't clutter
-- a sales performance report - matching "every person in the office who
-- does this work should be part of it," not "every admin automatically is."

CREATE OR REPLACE FUNCTION public.report_agent_performance()
RETURNS TABLE(agent_id UUID, agent_name TEXT, leads_assigned BIGINT, converted BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name,
           COUNT(l.id)                                        AS leads_assigned,
           COUNT(l.id) FILTER (WHERE l.status = 'converted')   AS converted
    FROM public.profiles p
    LEFT JOIN public.leads l ON l.assigned_agent_id = p.id
    WHERE p.role = 'agent'
       OR EXISTS (SELECT 1 FROM public.leads l2 WHERE l2.assigned_agent_id = p.id)
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name;
END;
$$;
