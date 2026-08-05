-- Bot Manager: AI Agents (August 2026)
--
-- Backs the Bot Manager -> AI -> Agents tab. Mirrors WhatChimp's own Agents
-- screen: a named agent with its own system prompt, optionally pointed at a
-- training campaign in ai_knowledge_base.
--
-- This changes no bot behaviour on its own. Whether a real customer ever gets
-- an AI reply is still decided by AI_REPLIES_ENABLED inside the deployed
-- whatsapp-webhook function, which is a code constant and is false.
-- Idempotent - safe to run more than once.

CREATE TABLE IF NOT EXISTS public.ai_agents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    TEXT        NOT NULL,
  kb_id         UUID        REFERENCES public.ai_knowledge_base(id) ON DELETE SET NULL,
  system_prompt TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT false,
  created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- public.set_updated_at() already exists (schema.sql section 7).
DROP TRIGGER IF EXISTS ai_agents_updated_at ON public.ai_agents;
CREATE TRIGGER ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: admin only, matching ai_knowledge_base and keyword_replies.
-- Agents get no access at all, not even SELECT.
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_agents: admin full access" ON public.ai_agents;
CREATE POLICY "ai_agents: admin full access" ON public.ai_agents
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS ai_agents_active_idx ON public.ai_agents (is_active);
