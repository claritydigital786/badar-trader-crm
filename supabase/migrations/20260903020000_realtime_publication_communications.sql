-- Omnichannel Inbox realtime: publish public.communications.
--
-- Root cause this fixes (confirmed against production vfskqzgphrunjxquqpks,
-- 2026-09-03): the frontend has subscribed to postgres_changes on
-- public.communications since the Inbox was built, but the `supabase_realtime`
-- publication had `puballtables = false` and ZERO tables attached, and no
-- migration in this repo's entire history has ever touched the publication.
-- The database half of realtime was never authored - not drift, an omission.
-- Postgres therefore never emitted these rows to the logical stream, the
-- browser channel subscribed to a permanently silent feed, and every inbound
-- WhatsApp message required a manual page refresh to become visible.
--
-- Scope is deliberately ONE table. The Inbox has exactly two subscriptions,
-- both on communications (INSERT and UPDATE, filter type=eq.whatsapp).
-- Nothing in the client subscribes to `leads` (the sidebar is re-queried by
-- renderConversations() instead) or to `communication_customer_reactions`
-- (loadCustomerReactions() batch-fetches on conversation open). Publishing
-- either would add WAL traffic no listener consumes, so they are left out.
--
-- REPLICA IDENTITY is intentionally left at DEFAULT. The two handlers read
-- only payload.new, so DEFAULT carries everything they need for INSERT and
-- UPDATE; FULL would write every old row version into the WAL - more volume
-- and more customer message content on the wire for no functional gain.
--
-- RLS is NOT touched. Realtime evaluates the table's existing SELECT policies
-- per subscriber, so "communications: agent select own" keeps each agent to
-- their own assigned leads and "communications: admin full access" keeps
-- admin/super_admin scope as-is. Enabling publication changes what Postgres
-- broadcasts, never who is allowed to receive it.
--
-- Idempotent: safe to re-run, and safe if a Dashboard toggle already added
-- the table by hand before this migration lands.

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
      and tablename  = 'communications'
  ) then
    raise notice 'public.communications already published to supabase_realtime - nothing to do';
    return;
  end if;

  alter publication supabase_realtime add table public.communications;
  raise notice 'added public.communications to supabase_realtime';
end
$$;
