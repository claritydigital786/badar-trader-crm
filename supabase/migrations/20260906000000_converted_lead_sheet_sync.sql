-- Converted-lead -> Google Sheet sync: the outbox half.
--
-- The approval flow itself is NOT touched. approve_deposit_and_convert() stays
-- exactly as it is; this hangs off the state change it already makes, so the
-- sync can never alter, delay or fail a conversion.
--
-- AUDITED SOURCE OF TRUTH (production, 2026-09-06). Approval is
-- approve_deposit_and_convert(p_document_id), SECURITY DEFINER and gated on
-- is_admin(). In one transaction it:
--   * leads      -> status='converted', converted_at=now(), balance_locked=true,
--                   account_balance = leads.deposit_amount
--   * kyc_documents -> status='verified', reviewed_by=auth.uid(), reviewed_at=now()
--   * transactions  -> INSERT (client_id, 'deposit', amount, 'USD', notes,
--                      recorded_by, deposit_document_id)
-- and it is already idempotent: a document that is already 'verified' returns
-- already_approved and inserts nothing.
--
-- The enqueue point is the kyc_documents status transition to 'verified' for a
-- deposit_screenshot. That is precisely "an admin approved this deposit", it is
-- inside the approval transaction (so a conversion can never be missed), and it
-- requires no change to the function itself. The insert is a single row with
-- ON CONFLICT DO NOTHING, which is about as close to unfailable as a statement
-- gets - the transactional-outbox pattern, deliberately, so that queueing
-- cannot roll back an approval.
--
-- ONE ROW PER CONVERTED LEAD: lead_id is UNIQUE. A lead can receive further
-- approved deposits later (nothing stops a second deposit_screenshot), and the
-- agreed model is one customer row, so a repeat approval re-queues the SAME row
-- rather than creating a second one. The sheet write upserts on Lead ID for the
-- same reason.

create table if not exists public.converted_lead_sheet_sync (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null unique references public.leads(id) on delete cascade,
  deposit_document_id uuid references public.kyc_documents(id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending','processing','synced','failed')),
  attempt_count       int  not null default 0,
  last_error          text,
  next_attempt_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  synced_at           timestamptz
);

comment on table public.converted_lead_sheet_sync is
  'Outbox for the admin Converted Leads Google Sheet. One row per converted lead (lead_id unique). Holds no customer PII - the worker reads it by lead_id at send time.';

-- Deliberately no customer columns here. Name, email, phone and amount are read
-- from leads/transactions when the row is processed, so this table cannot
-- become a second, staler copy of customer data to protect.

create index if not exists idx_cls_sync_due
  on public.converted_lead_sheet_sync (status, next_attempt_at)
  where status in ('pending','failed');

-- ── enqueue on the approval transition ─────────────────────────
create or replace function public.enqueue_converted_lead_sheet_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exactly the approval event: a deposit submission moving INTO 'verified'.
  -- Re-approving something already verified does not re-fire, and no other
  -- document type or status change reaches this.
  if new.document_type is distinct from 'deposit_screenshot' then return new; end if;
  if new.status is distinct from 'verified' then return new; end if;
  if old.status is not distinct from 'verified' then return new; end if;

  insert into public.converted_lead_sheet_sync (lead_id, deposit_document_id)
  values (new.client_id, new.id)
  on conflict (lead_id) do update
    set status              = 'pending',
        next_attempt_at     = now(),
        attempt_count       = 0,
        last_error          = null,
        deposit_document_id = excluded.deposit_document_id,
        updated_at          = now();
  return new;
end;
$$;

drop trigger if exists trg_enqueue_converted_lead_sheet_sync on public.kyc_documents;
create trigger trg_enqueue_converted_lead_sheet_sync
  after update of status on public.kyc_documents
  for each row execute function public.enqueue_converted_lead_sheet_sync();

-- ── RLS: admin/super-admin read only; nobody writes from a browser ──
alter table public.converted_lead_sheet_sync enable row level security;

drop policy if exists "cls sync: admin read" on public.converted_lead_sheet_sync;
create policy "cls sync: admin read"
  on public.converted_lead_sheet_sync
  for select
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy exists on purpose. The trigger writes as its
-- definer and the worker uses the service role, both of which bypass RLS; every
-- browser session - agent OR admin - is therefore unable to create, edit or
-- delete a sync job. An agent cannot queue a fake conversion, and an admin
-- cannot hand-edit sync state into lying about what was sent.

-- ── admin-only controls ────────────────────────────────────────
-- Status summary for the admin panel. SECURITY INVOKER, so the RLS policy above
-- is what decides whether the caller sees anything at all.
create or replace function public.converted_lead_sheet_sync_status()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'pending',    count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'synced',     count(*) filter (where status = 'synced'),
    'failed',     count(*) filter (where status = 'failed'),
    'total',      count(*),
    'last_synced_at', max(synced_at),
    'last_error',  (select last_error from converted_lead_sheet_sync
                     where status = 'failed' order by updated_at desc limit 1)
  )
  from converted_lead_sheet_sync;
$$;

revoke all on function public.converted_lead_sheet_sync_status() from public, anon;
grant execute on function public.converted_lead_sheet_sync_status() to authenticated;

-- Re-queue failed rows. Admin only, and it only ever resets scheduling state -
-- it cannot invent a sync for a lead that was never approved.
create or replace function public.retry_converted_lead_sheet_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not is_admin() then
    raise exception 'Only an admin can retry the converted-leads sheet sync'
      using errcode = '42501';
  end if;
  update converted_lead_sheet_sync
     set status = 'pending', next_attempt_at = now(), attempt_count = 0,
         last_error = null, updated_at = now()
   where status = 'failed';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.retry_converted_lead_sheet_sync() from public, anon;
grant execute on function public.retry_converted_lead_sheet_sync() to authenticated;

-- Backfill of leads converted BEFORE this shipped. Admin only, and NOT run
-- automatically anywhere - it exists so the decision to populate history can be
-- taken deliberately, and it only enqueues; the worker still does the sending.
create or replace function public.backfill_converted_lead_sheet_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not is_admin() then
    raise exception 'Only an admin can backfill the converted-leads sheet sync'
      using errcode = '42501';
  end if;
  insert into converted_lead_sheet_sync (lead_id, deposit_document_id)
  select l.id,
         (select k.id from kyc_documents k
           where k.client_id = l.id and k.document_type = 'deposit_screenshot'
             and k.status = 'verified'
           order by k.reviewed_at desc nulls last limit 1)
    from leads l
   where l.status = 'converted'
  on conflict (lead_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.backfill_converted_lead_sheet_sync() from public, anon;
grant execute on function public.backfill_converted_lead_sheet_sync() to authenticated;
