-- Phase 44 - backfill the old "[unsupported message type: image]" label
-- (Muhammad, 2026-09-02)
--
-- describeUnsupportedMessage() never had a dedicated case for images (every
-- sibling type - audio, video, document, sticker, location, contacts,
-- button - did), so every image ingested through 3903's ingestOnlyMessage()
-- fell into the generic default branch and got the literal, technical-
-- sounding "[unsupported message type: image]" as its body, even when the
-- image itself downloaded and displayed just fine right below that text.
-- Fixed going forward in the same-day whatsapp-webhook deploy (a real
-- "image" case now returns "[image]"). This is the one-time backfill for
-- the 586 existing rows already written with the old wording - checked
-- first that all of them share the exact same plain text with nothing
-- appended (no caption, no store-failure note), so a straight replace is
-- safe with no risk of losing real content.

UPDATE public.communications
SET body = '[image]'
WHERE body = '[unsupported message type: image]';
