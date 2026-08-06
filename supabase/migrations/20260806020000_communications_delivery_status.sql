-- Delivery ticks: per-message delivery state (catalog B3/B4, August 2026)
--
-- WhatsApp reports what happened to an outbound message through the same
-- webhook that carries inbound messages, in change.value.statuses. Each entry
-- names the message by Meta's own id (wamid) and a state: sent, delivered,
-- read, or failed. The webhook already receives these and logs them, but
-- until now there was nowhere to record them, so the information was thrown
-- away on every message.
--
-- The correlation key already exists: communications.wa_message_id has been
-- captured on inbound and outbound since Phase 13. This adds only the state.
--
-- Idempotent - safe to run more than once.

ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS delivery_status TEXT;

-- Deliberately NO check constraint. Meta can introduce a status value we have
-- not seen (it already added "deleted" after this feature set was designed),
-- and a rejected UPDATE here would fail silently in the webhook's logs while
-- looking like working software - the exact failure mode this project keeps
-- getting bitten by. The webhook ignores statuses it does not recognise
-- rather than writing them, so an unknown value can never overwrite a real
-- "read"; the constraint would add nothing except a way to break the write.
COMMENT ON COLUMN public.communications.delivery_status IS
  'WhatsApp delivery state for an outbound message: sent, delivered, read or failed. NULL means no status callback has arrived yet. Advanced only forwards - see the rank guard in whatsapp-webhook, since Meta does not guarantee callback order.';

-- The status handler updates by wa_message_id on every callback, which is
-- several per outbound message. communications grows with every message ever
-- sent or received, so without this index that is a repeated full scan.
-- Partial: only rows that actually have a wamid are ever looked up this way.
CREATE INDEX IF NOT EXISTS communications_wa_message_id_idx
  ON public.communications (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
