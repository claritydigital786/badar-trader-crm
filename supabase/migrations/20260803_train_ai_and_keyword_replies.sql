-- Part 3 items 1 and 2: Train AI storage + Create Flow keyword replies (August 2026)
--
-- Two new admin-only tables backing the "Train AI" and "Create Flow" tabs.
-- Neither changes bot behaviour on its own. These are storage + UI only; wiring
-- whatsapp-webhook to actually read them is a separate, later decision.
-- Idempotent - safe to run more than once.

-- ── 1. AI knowledge base (Train AI tab) ──────────────────────
-- Mirrors WhatChimp's AI Knowledge Base: a named campaign holding a system
-- prompt plus free-text knowledge notes, scoped to a bot/WhatsApp number.
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name   TEXT        NOT NULL,
  bot_number      TEXT,
  system_prompt   TEXT        NOT NULL,
  knowledge_notes TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Keyword replies (Create Flow tab) ─────────────────────
-- Mirrors WhatChimp's Automation -> Keyword Replies: a trigger keyword and the
-- reply to send. Deliberately NOT a visual flow builder; that is a later phase.
CREATE TABLE IF NOT EXISTS public.keyword_replies (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword       TEXT        NOT NULL,
  match_type    TEXT        NOT NULL DEFAULT 'contains'
                              CHECK (match_type IN ('exact','contains','starts_with')),
  reply_message TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Keep updated_at current on both ───────────────────────
-- public.set_updated_at() already exists (schema.sql section 7).
DROP TRIGGER IF EXISTS ai_knowledge_base_updated_at ON public.ai_knowledge_base;
CREATE TRIGGER ai_knowledge_base_updated_at
  BEFORE UPDATE ON public.ai_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS keyword_replies_updated_at ON public.keyword_replies;
CREATE TRIGGER keyword_replies_updated_at
  BEFORE UPDATE ON public.keyword_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS: admin only, both tables ──────────────────────────
-- Matches the User Permission reference tab: these are admin-only surfaces.
-- Agents get no access at all, not even SELECT.
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_replies   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_knowledge_base: admin full access" ON public.ai_knowledge_base;
CREATE POLICY "ai_knowledge_base: admin full access" ON public.ai_knowledge_base
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "keyword_replies: admin full access" ON public.keyword_replies;
CREATE POLICY "keyword_replies: admin full access" ON public.keyword_replies
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 5. Lookup indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ai_knowledge_base_active_idx
  ON public.ai_knowledge_base (is_active);
CREATE INDEX IF NOT EXISTS keyword_replies_active_idx
  ON public.keyword_replies (is_active);
