-- Widen communications.type to allow 'messenger' and 'instagram', so a
-- Facebook Messenger or Instagram DM can be logged honestly instead of being
-- mislabeled 'whatsapp' just to satisfy the existing check constraint.
-- Needed for the new ingest-only messenger-webhook function (2026-08-27,
-- staged connection - same pattern as 3903's WhatsApp ingest-only path):
-- real leads, real messages, visible in the Omnichannel Inbox with a channel
-- badge, but no automated reply on either channel yet.
--
-- Existing rows are untouched - this only widens the allowed set, it never
-- narrows or rewrites anything.
ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_type_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_type_check
  CHECK (type IN ('email', 'whatsapp', 'call', 'sms', 'messenger', 'instagram'));
