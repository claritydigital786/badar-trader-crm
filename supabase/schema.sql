-- ============================================================
-- Badar Trader CRM — Phase 1 Schema
-- Paste this entire file into: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run (uses IF NOT EXISTS + DROP IF EXISTS on policies).
-- ============================================================

-- ── 1. PROFILES (one row per auth user) ──────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  role       TEXT        NOT NULL DEFAULT 'agent'
                           CHECK (role IN ('admin', 'agent')),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  is_suspended BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. LEADS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  source            TEXT        NOT NULL DEFAULT 'meta'
                                CHECK (source IN ('manual','meta','referral','website','other')),
  meta_ad_id        TEXT,
  meta_campaign     TEXT,
  instrument_type   TEXT,        -- forex / crypto / stocks etc. — free text
  status            TEXT        NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','contacted','qualified','proposal_sent','converted','lost')),
  notes             TEXT,
  assigned_agent_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. LEAD ACTIVITY (communication log per lead) ────────────
CREATE TABLE IF NOT EXISTS public.lead_activity (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel        TEXT        NOT NULL CHECK (channel IN ('call','whatsapp','email','note')),
  summary        TEXT        NOT NULL,
  follow_up_date DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. AUDIT LOG (compliance default — not legal advice) ─────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  table_name  TEXT        NOT NULL,
  record_id   UUID,
  action      TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. SETTINGS (key/value store for Meta Integration etc.) ──
CREATE TABLE IF NOT EXISTS public.settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT,
  updated_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. HELPER: role lookup (SECURITY DEFINER bypasses RLS) ───
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 7. TRIGGER: keep leads.updated_at current ────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 8. TRIGGER: auto-create profile row on signup ─────────────
-- Default role is 'agent'.  To create an admin account pass:
--   User Metadata → {"full_name": "Badar Tanveer", "role": "admin"}
-- in the Supabase Dashboard "Add User" dialog.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'agent')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 9. TRIGGER: audit log for leads table ────────────────────
CREATE OR REPLACE FUNCTION public.audit_leads()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data)
    VALUES (auth.uid(), 'leads', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS leads_audit ON public.leads;
CREATE TRIGGER leads_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_leads();

-- ── 10. ROW-LEVEL SECURITY ───────────────────────────────────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings      ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "profiles: admin full access" ON public.profiles;
CREATE POLICY "profiles: admin full access" ON public.profiles
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "profiles: self read" ON public.profiles;
CREATE POLICY "profiles: self read" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- LEADS: admins full access
DROP POLICY IF EXISTS "leads: admin full access" ON public.leads;
CREATE POLICY "leads: admin full access" ON public.leads
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- LEADS: agents SELECT only their assigned leads
DROP POLICY IF EXISTS "leads: agent select own" ON public.leads;
CREATE POLICY "leads: agent select own" ON public.leads
  FOR SELECT USING (assigned_agent_id = auth.uid());

-- LEADS: agents UPDATE status/notes on their own leads only
DROP POLICY IF EXISTS "leads: agent update own" ON public.leads;
CREATE POLICY "leads: agent update own" ON public.leads
  FOR UPDATE
  USING     (assigned_agent_id = auth.uid())
  WITH CHECK(assigned_agent_id = auth.uid());

-- LEAD_ACTIVITY: admins full access
DROP POLICY IF EXISTS "activity: admin full access" ON public.lead_activity;
CREATE POLICY "activity: admin full access" ON public.lead_activity
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- LEAD_ACTIVITY: agents see activity on their leads
DROP POLICY IF EXISTS "activity: agent select" ON public.lead_activity;
CREATE POLICY "activity: agent select" ON public.lead_activity
  FOR SELECT USING (
    actor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- LEAD_ACTIVITY: agents can log activity on their assigned leads
DROP POLICY IF EXISTS "activity: agent insert" ON public.lead_activity;
CREATE POLICY "activity: agent insert" ON public.lead_activity
  FOR INSERT WITH CHECK (
    actor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- AUDIT_LOG: admins read-only; writes go through SECURITY DEFINER trigger
DROP POLICY IF EXISTS "audit: admin read" ON public.audit_log;
CREATE POLICY "audit: admin read" ON public.audit_log
  FOR SELECT USING (public.is_admin());

-- SETTINGS: admin only
DROP POLICY IF EXISTS "settings: admin only" ON public.settings;
CREATE POLICY "settings: admin only" ON public.settings
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── DONE (Phase 1) ────────────────────────────────────────────
-- Next steps are in the CRM setup panel (index.html).
-- Quick-reference to create the first admin manually:
--
--   UPDATE public.profiles SET role = 'admin'
--   WHERE email = 'your-admin-email@example.com';
--
-- Run that in SQL Editor immediately after creating the user
-- in Authentication → Users (if you don't pass role in metadata).
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 2 Schema (Financial Ledger + KYC)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- Run AFTER the Phase 1 schema above. Safe to re-run.
-- ============================================================

-- ── 11. LEADS: Phase 2 columns (client profile fields) ───────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS account_balance NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS risk_profile TEXT
                                CHECK (risk_profile IN ('low','medium','high'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trading_plan TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS signal_group TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending'
                                CHECK (kyc_status IN ('pending','verified','rejected','not_started'));

-- ── 12. TRANSACTIONS (financial ledger — record-keeping only) ─
-- client_id references leads(id): in this schema "leads" holds every
-- client record (there is no separate clients table).
CREATE TABLE IF NOT EXISTS public.transactions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID          NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount      NUMERIC(15,2) NOT NULL,
  currency    TEXT          NOT NULL DEFAULT 'USD'
                               CHECK (currency IN ('USD','EUR','GBP','USDT','BTC')),
  notes       TEXT,
  recorded_by UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── 13. KYC_DOCUMENTS (compliance tracking — not legal advice) ─
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  document_type TEXT        NOT NULL
                               CHECK (document_type IN ('passport','national_id','utility_bill','other')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','verified','rejected')),
  notes         TEXT,
  reviewed_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);

-- ── 14. GUARD: only admins may change leads.account_balance / kyc_status ─
-- RLS is row-level, not column-level — the "leads: agent update own" policy
-- lets an agent UPDATE any column of their assigned lead. This trigger
-- closes that gap for the two admin-only fields.
CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_guard_admin_columns ON public.leads;
CREATE TRIGGER leads_guard_admin_columns
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_leads_admin_only_columns();

-- ── 15. ROW-LEVEL SECURITY: Phase 2 tables ────────────────────
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- TRANSACTIONS: admins full access
DROP POLICY IF EXISTS "transactions: admin full access" ON public.transactions;
CREATE POLICY "transactions: admin full access" ON public.transactions
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- TRANSACTIONS: agents SELECT only transactions for their own clients
DROP POLICY IF EXISTS "transactions: agent select own clients" ON public.transactions;
CREATE POLICY "transactions: agent select own clients" ON public.transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = client_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- KYC_DOCUMENTS: admins full access
DROP POLICY IF EXISTS "kyc: admin full access" ON public.kyc_documents;
CREATE POLICY "kyc: admin full access" ON public.kyc_documents
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- KYC_DOCUMENTS: agents SELECT only documents for their own clients
DROP POLICY IF EXISTS "kyc: agent select own clients" ON public.kyc_documents;
CREATE POLICY "kyc: agent select own clients" ON public.kyc_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = client_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- ── DONE (Phase 2) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 3 Schema (Communications + Automation + Reporting)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- Run AFTER the Phase 1 and Phase 2 schema above. Safe to re-run.
-- ============================================================

-- ── 16. COMMUNICATIONS (per-lead communication log) ───────────
CREATE TABLE IF NOT EXISTS public.communications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('email','whatsapp','call','sms')),
  direction  TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject    TEXT,
  body       TEXT        NOT NULL,
  logged_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 17. AUTOMATION_RULES (admin-only; stub — no sending happens yet) ─
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  trigger_event    TEXT        NOT NULL
                                  CHECK (trigger_event IN ('lead_created','status_changed','kyc_verified','deposit_recorded')),
  channel          TEXT        NOT NULL CHECK (channel IN ('email','sms')),
  template_subject TEXT,
  template_body    TEXT        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 18. ROW-LEVEL SECURITY: Phase 3 tables ────────────────────
ALTER TABLE public.communications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- COMMUNICATIONS: admins full access
DROP POLICY IF EXISTS "communications: admin full access" ON public.communications;
CREATE POLICY "communications: admin full access" ON public.communications
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- COMMUNICATIONS: agents SELECT comms for their own assigned leads
DROP POLICY IF EXISTS "communications: agent select own" ON public.communications;
CREATE POLICY "communications: agent select own" ON public.communications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- COMMUNICATIONS: agents can log comms on their own assigned leads
DROP POLICY IF EXISTS "communications: agent insert own" ON public.communications;
CREATE POLICY "communications: agent insert own" ON public.communications
  FOR INSERT WITH CHECK (
    logged_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- AUTOMATION_RULES: admin only (read + write)
DROP POLICY IF EXISTS "automation_rules: admin only" ON public.automation_rules;
CREATE POLICY "automation_rules: admin only" ON public.automation_rules
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 19. REPORTING: SECURITY DEFINER aggregate functions (admin-gated) ─
-- These run SECURITY DEFINER so an admin's report can aggregate across all
-- agents/leads/transactions despite per-row RLS, but each checks is_admin()
-- first so a non-admin calling the RPC directly still gets rejected.

CREATE OR REPLACE FUNCTION public.report_agent_performance()
RETURNS TABLE(agent_id UUID, agent_name TEXT, leads_assigned BIGINT, converted BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    GROUP BY p.id, p.full_name
    ORDER BY p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_source_performance()
RETURNS TABLE(source TEXT, total_leads BIGINT, converted BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
    SELECT l.source,
           COUNT(*)                                        AS total_leads,
           COUNT(*) FILTER (WHERE l.status = 'converted')   AS converted
    FROM public.leads l
    GROUP BY l.source
    ORDER BY total_leads DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_financial_summary()
RETURNS TABLE(total_deposits NUMERIC, total_withdrawals NUMERIC, net_aum NUMERIC, verified_clients BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  deposits    NUMERIC;
  withdrawals NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO deposits    FROM public.transactions WHERE type = 'deposit';
  SELECT COALESCE(SUM(amount), 0) INTO withdrawals FROM public.transactions WHERE type = 'withdrawal';
  RETURN QUERY
    SELECT deposits, withdrawals, (deposits - withdrawals),
           (SELECT COUNT(*) FROM public.leads WHERE kyc_status = 'verified');
END;
$$;

-- ── PENDING SQL (run these if not already applied) ───────────
-- 1. Agent suspend column (if table was created before this was added):
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- 2. Allow anonymous inserts to leads (for landing page / Lovable form):
DROP POLICY IF EXISTS "leads: anon insert" ON public.leads;
CREATE POLICY "leads: anon insert"
  ON public.leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── DONE ─────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════

-- ── SIGNALS (broadcast history + public track record) ─────────
-- Public can READ (powers track-record.html); only logged-in
-- agents can INSERT/UPDATE. Paste this whole file (or just this
-- section) into Supabase Dashboard → SQL Editor → Run.
CREATE TABLE IF NOT EXISTS public.signals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type        TEXT        NOT NULL,
  instrument  TEXT        NOT NULL,
  entry       NUMERIC,
  tp          NUMERIC,
  sl          NUMERIC,
  message     TEXT,
  recipients  INTEGER     NOT NULL DEFAULT 0,
  outcome     TEXT        NOT NULL DEFAULT 'pending'
                CHECK (outcome IN ('pending','tp_hit','sl_hit','be','cancelled')),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signals_public_read ON public.signals;
CREATE POLICY signals_public_read ON public.signals
  FOR SELECT USING (true);

DROP POLICY IF EXISTS signals_auth_insert ON public.signals;
CREATE POLICY signals_auth_insert ON public.signals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS signals_auth_update ON public.signals;
CREATE POLICY signals_auth_update ON public.signals
  FOR UPDATE TO authenticated USING (true);

-- ── DONE ─────────────────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 4 Schema (WhatsApp lead-qualification bot)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- Run AFTER Phase 1-3 schema above. Safe to re-run.
-- ============================================================

-- ── 20. LEADS: bot conversation state columns ─────────────────
-- Tracks each lead's position in the WhatsApp qualification flow
-- (see supabase/functions/whatsapp-webhook/index.ts).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_stage TEXT NOT NULL DEFAULT 'awaiting_language'
  CHECK (bot_stage IN ('awaiting_language','awaiting_menu','awaiting_broker','awaiting_experience','awaiting_traded_before','awaiting_deposit_confirm','qualified','declined'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('en','ur'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS broker_choice TEXT CHECK (broker_choice IN ('exness','doprime'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trader_experience TEXT CHECK (trader_experience IN ('new','experienced'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ready_to_deposit BOOLEAN;

-- ── 21. LEADS: bot→human handoff + unread tracking ─────────────
-- needs_human/handoff_reason are set by escalate() when the bot hands a
-- conversation to a person; retry_count tracks consecutive unmatched replies
-- (see handleUnmatched()); is_unread flags leads with a new inbound message
-- for the CRM conversation list (see index.html).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS handoff_reason TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_unread BOOLEAN NOT NULL DEFAULT false;

-- ── PENDING SQL (Phase 4 — run this on the live DB before deploying the
--    language/main-menu bot update) ─────────────────────────────────────
-- The original Phase 4 migration above already ran against the live `leads`
-- table (see ACTION_NEEDED.md), so ADD COLUMN IF NOT EXISTS is a no-op for
-- bot_stage/language and won't widen its existing CHECK constraint. The new
-- bot flow adds an `awaiting_language` / `awaiting_menu` step before
-- `awaiting_broker`, so the live constraint + default need updating, and the
-- handoff/unread columns need adding for the first time.
--
-- The DROP CONSTRAINT below assumes Postgres's default auto-generated name
-- (<table>_<column>_check). If it doesn't match, find the real name first:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.leads'::regclass AND contype = 'c' AND conname LIKE '%bot_stage%';
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_bot_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_bot_stage_check
  CHECK (bot_stage IN ('awaiting_language','awaiting_menu','awaiting_broker','awaiting_experience','awaiting_traded_before','awaiting_deposit_confirm','qualified','declined'));
ALTER TABLE public.leads ALTER COLUMN bot_stage SET DEFAULT 'awaiting_language';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('en','ur'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS handoff_reason TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_unread BOOLEAN NOT NULL DEFAULT false;

-- ── 22. LEADS: agent round-robin ping tracking (Phase 5) ────────
-- Tracks the repeat-until-acknowledged reminder loop for the round-robin
-- "new lead assigned" ping (see supabase/functions/whatsapp-webhook/index.ts
-- and supabase/functions/nudge-agents/index.ts). agent_acknowledged_at is
-- set when the assigned agent taps the "I've got this" button; until then,
-- nudge-agents re-pings every 5 minutes and escalates to the rest of the
-- team after 3 unanswered pings.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_ping_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_last_pinged_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_acknowledged_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_escalated BOOLEAN NOT NULL DEFAULT false;

-- ── 23. Cron: fire nudge-agents every 15 minutes, 9am-6pm PKT ───
-- nudge-agents is deployed with --no-verify-jwt (same as whatsapp-webhook),
-- so this plain POST needs no auth header. cron.schedule upserts by job
-- name, so this is safe to re-run.
--
-- pg_cron runs in UTC. PKT is UTC+5 (no DST), so 9:00am-6:00pm PKT is
-- 4:00am-1:00pm UTC. Two jobs: one every 15 min across 4:00-12:45 UTC
-- (9:00am-5:45pm PKT), plus a single tick at exactly 13:00 UTC (6:00pm
-- PKT) so the window's closing edge is covered without running into 6:15pm+.
--
-- IMPORTANT: this job name was previously 'nudge-agents-every-5-min'. If
-- you're re-running this against a project that still has that old job
-- (or any other rogue nudge-agents cron entries — check with
-- `SELECT jobname FROM cron.job;`), unschedule it explicitly first:
--   SELECT cron.unschedule('nudge-agents-every-5-min');
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('nudge-agents-every-5-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nudge-agents-every-5-min');

SELECT cron.schedule(
  'nudge-agents-every-15-min-business-hours',
  '*/15 4-12 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/nudge-agents',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'nudge-agents-6pm-pkt-close',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/nudge-agents',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ── DONE (Phase 4) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 6 Schema (KYC document file upload)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 24. KYC document storage ────────────────────────────────
-- Private bucket; objects are stored at {client_id}/{doc_id}_{filename} so
-- the agent-select policy can join back to leads.assigned_agent_id without
-- a denormalized column. Matches the existing kyc_documents RLS: admins
-- full access, agents read-only for their own clients' files.
ALTER TABLE public.kyc_documents ADD COLUMN IF NOT EXISTS file_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kyc-documents: admin full access" ON storage.objects;
CREATE POLICY "kyc-documents: admin full access" ON storage.objects
  FOR ALL USING (bucket_id = 'kyc-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'kyc-documents' AND public.is_admin());

DROP POLICY IF EXISTS "kyc-documents: agent select own clients" ON storage.objects;
CREATE POLICY "kyc-documents: agent select own clients" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents' AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id::text = (storage.foldername(name))[1]
      AND l.assigned_agent_id = auth.uid()
    )
  );

-- ── DONE (Phase 6) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 7 Schema (deposit screenshot capture)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 25. Deposit screenshot storage ──────────────────────────
-- The bot previously had no handling at all for image messages — a
-- customer's deposit screenshot (which the bot explicitly asks for) was
-- silently dropped. Now stored at {lead_id}/{timestamp}.{ext}, same
-- admin-full / agent-own-client pattern as kyc-documents.
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS attachment_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('deposit-screenshots', 'deposit-screenshots', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "deposit-screenshots: admin full access" ON storage.objects;
CREATE POLICY "deposit-screenshots: admin full access" ON storage.objects
  FOR ALL USING (bucket_id = 'deposit-screenshots' AND public.is_admin())
  WITH CHECK (bucket_id = 'deposit-screenshots' AND public.is_admin());

DROP POLICY IF EXISTS "deposit-screenshots: agent select own clients" ON storage.objects;
CREATE POLICY "deposit-screenshots: agent select own clients" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deposit-screenshots' AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id::text = (storage.foldername(name))[1]
      AND l.assigned_agent_id = auth.uid()
    )
  );

-- ── DONE (Phase 7) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 8 Schema (real automation rule firing)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 26. Automation: real triggers, WhatsApp + assign-agent only ─
-- automation_rules were previously pure CRUD — nothing fired them. These
-- triggers call the fire-automation Edge Function (via pg_net, same
-- pattern as nudge-agents) whenever the real event happens. Email/SMS
-- channels are deliberately NOT sent for real yet — no Twilio/SendGrid
-- account exists — fire-automation logs those as skipped instead of
-- silently doing nothing, so it's easy to tell when that's ready to flip on.
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS assign_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- The original constraint only ever allowed channel IN ('email','sms'), even
-- though the CRM form has offered 'whatsapp' and 'assign_agent' as options
-- since it was built — every attempt to save one of those two would have been
-- rejected by the database. template_body was also NOT NULL, which would
-- reject assign_agent rules too (they have no message template).
ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_channel_check;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_channel_check
  CHECK (channel IN ('whatsapp','email','sms','assign_agent'));
ALTER TABLE public.automation_rules ALTER COLUMN template_body DROP NOT NULL;

-- condition_filter was never a real column at all, despite the CRM form
-- (submitAutomationRule) always including it in the save payload — meaning
-- every single "Save Rule" click, for any channel, has always failed outright
-- with a PostgREST "column not found" error. This is why the table was empty.
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS condition_filter TEXT;

CREATE OR REPLACE FUNCTION public.fire_automation_event(p_trigger_event TEXT, p_lead_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/fire-automation',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('trigger_event', p_trigger_event, 'lead_id', p_lead_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_leads_created()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fire_automation_event('lead_created', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS automation_lead_created ON public.leads;
CREATE TRIGGER automation_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_created();

CREATE OR REPLACE FUNCTION public.trg_leads_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.fire_automation_event('status_changed', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS automation_status_changed ON public.leads;
CREATE TRIGGER automation_status_changed
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_status_changed();

CREATE OR REPLACE FUNCTION public.trg_leads_kyc_verified()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kyc_status = 'verified' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    PERFORM public.fire_automation_event('kyc_verified', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS automation_kyc_verified ON public.leads;
CREATE TRIGGER automation_kyc_verified
  AFTER UPDATE OF kyc_status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_kyc_verified();

CREATE OR REPLACE FUNCTION public.trg_transactions_deposit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM public.fire_automation_event('deposit_recorded', NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS automation_deposit_recorded ON public.transactions;
CREATE TRIGGER automation_deposit_recorded
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_transactions_deposit();

-- ── DONE (Phase 8) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 9 Schema (public form submissions)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 27. Public lead-capture forms (signals-form.html, course-form.html) ─
-- Badar wants first/last name tracked separately (rest of the CRM keeps
-- using leads.full_name, kept in sync by the submit-lead-form Edge
-- Function). deposit_account_ref already covers "Broker ID". Screenshots
-- are stored as kyc_documents rows (document_type='deposit_screenshot')
-- in the existing deposit-screenshots bucket, reusing the existing
-- Verify/Reject review workflow instead of building a new one.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE public.kyc_documents DROP CONSTRAINT IF EXISTS kyc_documents_document_type_check;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_document_type_check
  CHECK (document_type = ANY (ARRAY['passport','national_id','utility_bill','deposit_screenshot','other']));

-- ── DONE (Phase 9) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 10 Schema (fix conversion-hook)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 28. Let service-role Edge Functions past the admin-only guard ──
-- guard_leads_admin_only_columns() blocked ALL writes to account_balance/
-- kyc_status unless is_admin() (auth.uid() in profiles with role='admin').
-- Service-role connections (Edge Functions like conversion-hook) have no
-- auth.uid() at all, so this was blocking every single deposit
-- confirmation through join.html — silently, since join.html swallowed
-- the error and redirected to thankyou.html regardless of success.
-- Confirmed by reproducing it directly against a real test lead before
-- this fix, and confirming it succeeds after.
CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.is_admin() AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── DONE (Phase 10) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 11 Schema (Meta Lead Ads automation)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 29. Meta Lead Ads → CRM record + WhatsApp welcome message ──
-- Feeds supabase/functions/meta-leadgen-webhook/index.ts. A lead insert
-- alone triggers automation_lead_created -> fire-automation, which is
-- the part that actually sends the WhatsApp message — this rule is what
-- fire-automation looks up. Verified end-to-end with a real test lead
-- (deleted after): trigger fired, rule matched, template rendered, and
-- a real WhatsApp API call was attempted. Left INACTIVE — the wording
-- is a draft, not reviewed/approved by Badar yet. Edit and activate from
-- the CRM's own Automation tab once the message is approved.
INSERT INTO automation_rules (name, trigger_event, channel, template_body, is_active)
SELECT
  'Meta Lead Ads — welcome message',
  'lead_created',
  'whatsapp',
  'Hi {{name}}! 👋 Thanks for your interest in Badar Trader. A member of our team will be in touch with you shortly on this number.',
  false
WHERE NOT EXISTS (
  SELECT 1 FROM automation_rules WHERE name = 'Meta Lead Ads — welcome message'
);

-- ── DONE (Phase 11) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 12 Schema (agents can send WhatsApp replies)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 30. Let agents read the two WhatsApp send credentials ──────
-- Incident (2026-07-14): every agent hitting Send in Conversations got
-- "WhatsApp token not set" even though the credentials WERE saved.
-- sendConvMessage (index.html) reads wa_phone_number_id/wa_access_token
-- from public.settings in the agent's own browser session, but §"settings:
-- admin only" RLS hides all settings rows from non-admins — the select
-- returns zero rows (not an error), so agents saw the misleading toast
-- while admin sends worked fine.
-- This policy exposes ONLY those two keys to logged-in users; every other
-- settings row stays admin-only. Trade-off, accepted for now: any agent's
-- browser can technically read the raw access token. The cleaner design is
-- an Edge Function proxy that keeps the token server-side — see HANDOFF.md.
DROP POLICY IF EXISTS "settings: agents read wa send creds" ON public.settings;
CREATE POLICY "settings: agents read wa send creds" ON public.settings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND key IN ('wa_phone_number_id', 'wa_access_token')
  );

-- ── DONE (Phase 12) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════


-- ============================================================
-- Badar Trader CRM — Phase 13 Schema (quote-reply to a specific message)
-- Paste this entire section into: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── 31. Store WhatsApp's own message ID per communication ──────
-- Needed for Meta's "context.message_id" quote-reply field — without the
-- original wamid there's nothing to reply to. Captured on inbound in
-- whatsapp-webhook (message.id) and on outbound in send-wa-message /
-- the legacy browser send path (Meta's own response.messages[0].id).
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS wa_message_id TEXT;

-- ── DONE (Phase 13) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════
