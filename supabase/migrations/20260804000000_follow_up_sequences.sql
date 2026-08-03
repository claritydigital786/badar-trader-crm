-- Part 3: Follow-up Sequences (August 2026)
--
-- Backs the admin-only "Follow-ups" tab. A sequence says: when a lead has sat
-- in a given status for N hours without moving, send them this message.
--
-- Storage + UI only, same as ai_knowledge_base and keyword_replies. Nothing
-- sends these yet; wiring them to an actual scheduled send is a separate
-- decision, and deliberately not made here. Idempotent.

CREATE TABLE IF NOT EXISTS public.follow_up_sequences (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  trigger_status TEXT        NOT NULL
                               CHECK (trigger_status IN ('new','contacted','qualified','proposal_sent','pending_approval','converted','lost')),
  delay_hours    INTEGER     NOT NULL DEFAULT 24 CHECK (delay_hours > 0),
  message        TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_by     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- trigger_status deliberately mirrors the leads_status_check constraint added
-- in Phase 18, so a sequence can never target a status a lead cannot hold.

DROP TRIGGER IF EXISTS follow_up_sequences_updated_at ON public.follow_up_sequences;
CREATE TRIGGER follow_up_sequences_updated_at
  BEFORE UPDATE ON public.follow_up_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Admin only, matching the other Part 3 tables and the User Permission tab.
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_up_sequences: admin full access" ON public.follow_up_sequences;
CREATE POLICY "follow_up_sequences: admin full access" ON public.follow_up_sequences
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS follow_up_sequences_active_idx
  ON public.follow_up_sequences (is_active, trigger_status);
