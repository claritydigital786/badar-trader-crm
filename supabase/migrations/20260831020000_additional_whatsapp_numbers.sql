-- Phase 36 - Additional WhatsApp numbers, reference-only (Muhammad, 2026-08-31)
--
-- Backs the "Connect WhatsApp" page's "Add Phone Number" / "Connect Another
-- WhatsApp Business Account" actions. This table is deliberately just a
-- reference list - it does NOT wire a new number into the live bot. Making a
-- new number actually receive or send real messages still needs its own
-- Graph API credentials set as a real Supabase secret and, if it should run
-- the automated funnel, a matching code change - both real steps that need
-- Muhammad's own laptop, the same way 6541 and 3903 were each really
-- connected. This table only stops that intent from being lost between here
-- and there.

CREATE TABLE IF NOT EXISTS public.additional_whatsapp_numbers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT        NOT NULL,
  phone_number_id TEXT        NOT NULL,
  notes           TEXT,
  added_by        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.additional_whatsapp_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "additional_whatsapp_numbers: admin full access" ON public.additional_whatsapp_numbers;
CREATE POLICY "additional_whatsapp_numbers: admin full access" ON public.additional_whatsapp_numbers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
