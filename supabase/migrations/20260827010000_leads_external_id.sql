-- Facebook Messenger and Instagram DMs identify a person by an opaque
-- platform-scoped ID (PSID / IGSID), never a phone number - leads.phone stays
-- exactly what it's always been (a real WhatsApp-dialable number, used for
-- click-to-call and reply composition throughout the app), so overloading it
-- with a non-phone identifier would be dishonest data and would break every
-- place that already assumes phone is a real number.
--
-- external_id is the parallel identity column for these channels: nullable
-- (every existing WhatsApp lead has none), used only by messenger-webhook to
-- find-or-create a lead by platform ID instead of by phone.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS leads_external_id_idx ON public.leads (external_id) WHERE external_id IS NOT NULL;
