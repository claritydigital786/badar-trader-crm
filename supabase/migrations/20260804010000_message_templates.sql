-- Part 3: Message Templates (August 2026)
--
-- Backs the admin-only "Templates" tab. WhatsApp only allows free-form
-- replies within 24 hours of a customer's last message; after that only a
-- Meta-approved template can be sent. This repo has flagged the absence of
-- such a template as a real blocker since 14 July (stale conversations that
-- cannot be reopened), and both Follow-ups and Broadcast Signal need one
-- before they can send anything useful.
--
-- This table is the CRM's own record of template copy and where each one is
-- in Meta's approval process. It does NOT submit anything to Meta; that has
-- to happen in WhatsApp Manager, and the status here is maintained by hand
-- until someone wires up the Message Templates API. Idempotent.

CREATE TABLE IF NOT EXISTS public.message_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  -- Meta's own template name (lowercase, underscores) once it has been
  -- created there. Null while the copy is still being drafted here.
  meta_name     TEXT,
  language      TEXT        NOT NULL DEFAULT 'en'
                              CHECK (language IN ('en','ur','en_US')),
  category      TEXT        NOT NULL DEFAULT 'UTILITY'
                              CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  body          TEXT        NOT NULL,
  -- Mirrors Meta's own review states, plus 'draft' for copy that has not
  -- been submitted yet.
  status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','submitted','approved','rejected','paused')),
  notes         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS message_templates_updated_at ON public.message_templates;
CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_templates: admin full access" ON public.message_templates;
CREATE POLICY "message_templates: admin full access" ON public.message_templates
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS message_templates_status_idx
  ON public.message_templates (status, is_active);
