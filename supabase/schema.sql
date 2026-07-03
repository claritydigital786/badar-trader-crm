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

-- ── DONE (Phase 3) ───────────────────────────────────────────
-- ═════════════════════════════════════════════════════════════
