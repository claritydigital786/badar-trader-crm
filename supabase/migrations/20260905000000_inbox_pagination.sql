-- Omnichannel Inbox: server-side filtering, sorting and counts.
--
-- The Inbox fetched inbox_conversation_list with .limit(5000) - 2,873 rows /
-- 1.10 MB for Badar and Ehsan - rendered every one of them into the DOM in a
-- single innerHTML write, and then implemented BOTH search and every filter by
-- walking those DOM nodes and setting el.style.display. So the browser paid for
-- 2,873 conversations to show roughly a dozen, and each keystroke re-walked all
-- of them.
--
-- Pagination alone could not fix the filters: tier ('New'/'Engaged'/'Deposit
-- Ready'/'Qualified'/'Converted') and the priority sort order were computed in
-- JavaScript from columns the view already returns, so filtering or sorting a
-- page server-side was impossible without that logic in SQL. This adds exactly
-- two derived columns so PostgREST can do it, and adds nothing else.
--
-- MEASURED, so the read shape is not changed on a hunch: DISTINCT ON must scan
-- all 16,045 communications rows and materialise all 2,873 groups before the
-- outer ORDER BY/LIMIT can apply. Execution time is therefore flat in both the
-- limit and the offset - 42.0 ms at limit 5000, 41.1 ms at limit 75, and
-- 41.1 / 44.0 / 42.0 ms at offsets 0 / 1200 / 2700. Two consequences:
--   * OFFSET paging is NOT progressively more expensive here, so plain
--     .range() is used rather than keyset. Keyset would add a compound cursor
--     (priority, created_at) for zero measured gain.
--   * No new index is added. The scan already uses idx_communications_lead_created_at
--     (added 2026-09-04) and the remaining cost is the Unique, which no index
--     removes. Nothing is duplicated.
-- The view is left as a view: no materialised view, so nothing can go stale.
--
-- security_invoker = true is preserved, so every query still runs under the
-- caller's own RLS - an agent's Inbox, counts included, stays scoped to their
-- own leads by the existing communications/leads policies.
--
-- The two derived columns are transcriptions of computeLeadTier() and
-- convPriority() in index.html, not new rules. tests/inbox-pagination-test.mjs
-- runs the JavaScript and this SQL over the same rows and asserts they agree,
-- so the two cannot drift apart silently.

create or replace view public.inbox_conversation_list
with (security_invoker = true) as
select
  b.lead_id, b.type, b.body, b.direction, b.created_at,
  b.full_name, b.phone, b.status, b.is_unread, b.bot_stage,
  b.needs_human, b.handoff_reason, b.manual_tier, b.language, b.wa_channel,
  b.tier,
  -- convPriority(): tier weight, then the escalation BAND (1000) so anything
  -- handed to a human outranks anything that was not, then the finer signals.
  (case b.tier when 'qualified' then 45 when 'hot' then 40 when 'warm' then 15
               when 'new' then 10 when 'closed' then -100 else 0 end)
  + (case when coalesce(b.needs_human, false) then 1000 + (
        -- CONV_PRIORITY_REASONS, matched in the same order .find() uses.
        case when coalesce(b.handoff_reason,'') ~* 'deposit|screenshot|payment|paid|transfer|receipt' then 40
             when coalesce(b.handoff_reason,'') ~* 'complain|angry|upset|refund|scam|objection'       then 30
             when coalesce(b.handoff_reason,'') ~* 'human|agent|person|talk|speak|call me'            then 25
             else 0 end)
     else 0 end)
  + (case when coalesce(b.is_unread, false) then 20 else 0 end)
  + (case when b.direction = 'inbound' then 15 + (
        -- hoursWaiting is null for a future timestamp, and a null contributes
        -- neither the capped wait bonus nor the 24h window bonus.
        case when b.hours_waiting is null then 0
             else least(15, b.hours_waiting) + (case when b.hours_waiting >= 24 then 5 else 0 end)
        end)
     else 0 end) as priority
from (
  select distinct on (c.lead_id)
    c.lead_id, c.type, c.body, c.direction, c.created_at,
    l.full_name, l.phone, l.status, l.is_unread, l.bot_stage,
    l.needs_human, l.handoff_reason, l.manual_tier, l.language, l.wa_channel,
    -- computeLeadTier(): converted is a verified outcome and is checked FIRST,
    -- so no manual_tier can ever claim a conversion the approval flow withheld.
    -- A stored manual_tier of 'closed' is deliberately ignored for the same reason.
    case
      when coalesce(l.status,'new') = 'converted' then 'closed'
      when l.manual_tier is not null and l.manual_tier <> '' and l.manual_tier <> 'closed'
        then l.manual_tier
      when coalesce(l.status,'new') in ('qualified','pending_approval') then 'qualified'
      when coalesce(l.bot_stage,'awaiting_language') = 'awaiting_deposit_confirm'
        or (coalesce(l.needs_human,false) and coalesce(l.handoff_reason,'') ~* 'deposit') then 'hot'
      when coalesce(l.bot_stage,'awaiting_language') in ('awaiting_language','awaiting_menu') then 'new'
      else 'warm'
    end as tier,
    case when extract(epoch from (now() - c.created_at)) / 3600.0 >= 0
         then extract(epoch from (now() - c.created_at)) / 3600.0
    end as hours_waiting
  from communications c
  join leads l on l.id = c.lead_id
  where c.type = any (array['whatsapp','messenger','instagram'])
    and (c.subject is null or c.subject <> 'Qualified lead summary')
  order by c.lead_id, c.created_at desc
) b;

comment on view public.inbox_conversation_list is
  'One row per conversation (latest message per lead), plus tier and priority derived in SQL so the Inbox can filter, sort and page server-side. security_invoker: every read is scoped by the caller''s own RLS.';


-- Exact counts for the filter pills and the WhatsApp number dropdown, over the
-- caller's ENTIRE authorised set rather than whichever page is loaded.
--
-- SECURITY INVOKER on purpose: it reads the security_invoker view, so the
-- caller's RLS decides what is counted. There is no privilege escalation here
-- and no role check to get wrong - an agent counting their own conversations
-- gets their own numbers, an admin gets the org's.
create or replace function public.inbox_conversation_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'all',         count(*),
    'new',         count(*) filter (where tier = 'new'),
    'warm',        count(*) filter (where tier = 'warm'),
    'hot',         count(*) filter (where tier = 'hot'),
    'qualified',   count(*) filter (where tier = 'qualified'),
    'closed',      count(*) filter (where tier = 'closed'),
    'unread',      count(*) filter (where is_unread),
    'awaiting',    count(*) filter (where direction = 'inbound'),
    'needshuman',  count(*) filter (where needs_human),
    -- Channel pills. convChannelOf(): non-WhatsApp rows are 'other' and a
    -- WhatsApp lead with no wa_channel is 'unattributed' - neither is guessed
    -- into one of the two real numbers.
    'chan_all',    count(*),
    'chan_3903',   count(*) filter (where type = 'whatsapp' and wa_channel = '3903'),
    'chan_6541',   count(*) filter (where type = 'whatsapp' and wa_channel = '6541'),
    'chan_untagged', count(*) filter (where type = 'whatsapp' and wa_channel is null),
    'chan_other',  count(*) filter (where type <> 'whatsapp')
  )
  from inbox_conversation_list;
$$;

revoke all on function public.inbox_conversation_counts() from public, anon;
grant execute on function public.inbox_conversation_counts() to authenticated;

comment on function public.inbox_conversation_counts() is
  'Exact Inbox filter and channel counts over the caller''s authorised conversations. SECURITY INVOKER so RLS scopes it.';
