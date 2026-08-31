-- Phase 38: bounded, un-paginated conversation list for the Omnichannel Inbox.
--
-- The Inbox's conversation list was querying `communications` directly,
-- one row per MESSAGE (13,870+ rows and growing with every reply), with no
-- explicit .limit() - so it silently hit PostgREST's default 1,000-row cap.
-- That cap was already being exceeded in production (verified 2026-08-31:
-- 13,870 real rows match the type filter against the 1,000-row default),
-- which is why the 3903/6541 pill counts were wrong and why some real
-- conversations could go missing from the list entirely.
--
-- The fix: bound the query by CONVERSATION (one row per lead_id, its most
-- recent matching message), not by message. Conversations grow with the
-- lead count (~2,024 today), far slower than messages do. A view using
-- DISTINCT ON (lead_id) ordered by created_at DESC gives exactly that,
-- so a single fetch with a generous .limit() (e.g. 5000) reliably covers
-- every real conversation without needing pagination UI.
--
-- The lead fields the Inbox needs are flattened straight into this view
-- (rather than left for PostgREST to embed via leads(...)) because
-- PostgREST embedding through a plain view needs an explicit foreign-key
-- relationship it can discover, which a view doesn't expose the way a
-- table does. Joining here and returning flat columns avoids that
-- altogether - the frontend does one flat select, no embedding needed.

CREATE OR REPLACE VIEW public.inbox_conversation_list AS
SELECT DISTINCT ON (c.lead_id)
  c.lead_id,
  c.type,
  c.body,
  c.direction,
  c.created_at,
  l.full_name,
  l.phone,
  l.status,
  l.is_unread,
  l.bot_stage,
  l.needs_human,
  l.handoff_reason,
  l.manual_tier,
  l.language,
  l.wa_channel
FROM public.communications c
JOIN public.leads l ON l.id = c.lead_id
WHERE c.type IN ('whatsapp', 'messenger', 'instagram')
  -- Same null-safe exclusion the old query used: keep a row if its subject
  -- is null OR it's some other real value (excludes the internal
  -- "Qualified lead summary" note from being picked as a lead's latest row).
  AND (c.subject IS NULL OR c.subject <> 'Qualified lead summary')
ORDER BY c.lead_id, c.created_at DESC;

-- Views run with the querying role's own RLS on the underlying tables
-- (security_invoker is the default from PG 15 on non-materialized views
-- created this way, but pin it explicitly so this never silently becomes
-- security_definer under a future Postgres default change), so agents
-- still only see what their existing communications/leads RLS already
-- allows - this view is a shape change, not a permission change.
ALTER VIEW public.inbox_conversation_list SET (security_invoker = true);

GRANT SELECT ON public.inbox_conversation_list TO authenticated;

COMMENT ON VIEW public.inbox_conversation_list IS
  'One row per lead (its most recent whatsapp/messenger/instagram message, joined with the lead fields the Inbox needs), for the Omnichannel Inbox conversation list. Added 2026-08-31 to avoid the 1000-row default cap that under-counted the 3903/6541 pills and could drop real conversations - see Phase 38 in schema.sql.';
