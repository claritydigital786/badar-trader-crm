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
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- ── DONE ─────────────────────────────────────────────────────
-- Next steps are in the CRM setup panel (index.html).
-- Quick-reference to create the first admin manually:
--
--   UPDATE public.profiles SET role = 'admin'
--   WHERE email = 'your-admin-email@example.com';
--
-- Run that in SQL Editor immediately after creating the user
-- in Authentication → Users (if you don't pass role in metadata).
-- ═════════════════════════════════════════════════════════════
