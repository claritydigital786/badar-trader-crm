-- Phase 41 - real per-message channel tracking (Muhammad, 2026-09-01)
--
-- Root cause of a real, confusing bug: a reply to a customer failed with
-- WhatsApp's own 131047 ("more than 24 hours since last reply") even though
-- the combined thread showed a message from them minutes earlier - because
-- 6541 and 3903 share one WABA and this CRM merges both numbers' messages
-- into one thread per lead with NO record of which physical number any given
-- message actually came in or went out on. leads.wa_channel is a single,
-- static label on the LEAD, not a per-message truth, so a customer who has
-- ever messaged both numbers looks, in the transcript, like one continuous
-- 24h-eligible conversation even when the two numbers' real windows have
-- diverged.
--
-- This adds the missing per-message fact. Nullable and un-backfilled - every
-- historical row predates this column and there is no reliable way to
-- reconstruct which number carried it after the fact, so it stays NULL for
-- old rows rather than guessing. Every new row going forward is written with
-- a real value by the webhook (see the same-day whatsapp-webhook change).

ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IN ('6541', '3903'));

COMMENT ON COLUMN public.communications.channel IS
  'Which real WhatsApp number (6541 or 3903) this specific message actually went through - NULL for anything logged before 2026-09-01. Distinct from leads.wa_channel, which is one static label per lead, not per message. Added to fix a real bug: a reply could fail WhatsApp''s 24h re-engagement rule on 6541 even though the combined thread showed a recent message that had actually arrived on 3903.';

CREATE INDEX IF NOT EXISTS idx_communications_channel ON public.communications(channel) WHERE channel IS NOT NULL;
