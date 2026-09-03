-- Customer reactions realtime: publish public.communication_customer_reactions.
--
-- Found live during a full Omnichannel Inbox audit, 2026-09-03: reactions
-- load once via loadCustomerReactions() when a conversation opens, with no
-- realtime channel behind them - a customer's reaction sent while an agent
-- already has that conversation open never appeared until they closed and
-- reopened it. Muhammad's explicit go-ahead to fix this.
--
-- REPLICA IDENTITY FULL (not DEFAULT, unlike the communications table's own
-- realtime migration) is deliberate: a customer removing their reaction is a
-- real DELETE (handleReactionMessage() in whatsapp-webhook), and DEFAULT
-- only carries primary-key columns in a DELETE's old row - communication_id,
-- what the frontend actually needs to find the right message bubble, would
-- be missing from that payload. This table's volume is far lower than
-- communications (one row per reacted-to message, not per message, and only
-- ever written by the webhook), so the extra WAL cost of FULL is negligible.
--
-- RLS is unaffected - the existing "customer reactions: staff read
-- accessible message" SELECT policy applies to realtime subscribers the same
-- way it already applies to loadCustomerReactions()'s own query.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.communication_customer_reactions REPLICA IDENTITY FULL;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found - skipping (managed by Supabase)';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'communication_customer_reactions'
  ) then
    raise notice 'public.communication_customer_reactions already published to supabase_realtime - nothing to do';
    return;
  end if;

  alter publication supabase_realtime add table public.communication_customer_reactions;
  raise notice 'added public.communication_customer_reactions to supabase_realtime';
end
$$;
