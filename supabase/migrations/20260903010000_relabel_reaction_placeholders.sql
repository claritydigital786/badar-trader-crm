-- Phase 45 (part 2) - retire the technical reaction placeholder text
--
-- 137 rows across 102 leads read "[unsupported message type: reaction]" in
-- the agent's Inbox, written between 2026-08-26 and 2026-09-02 by the generic
-- default branch of describeUnsupportedMessage() before inbound reactions were
-- handled at all.
--
-- What is NOT done here, deliberately:
--
-- The original emoji and the target message id are GONE, and that was proven
-- before writing this rather than assumed. public.communications has no raw
-- payload column (its columns are id, lead_id, type, direction, subject, body,
-- logged_by, created_at, attachment_path, wa_message_id, delivery_status,
-- channel), and a search of both audit_log (24,011 rows) and
-- communication_logs (78 rows) for any trace of "reaction" returns zero hits.
-- So no emoji is invented and no message is attributed a reaction it may not
-- have received. These rows keep saying only what is actually known: that the
-- customer reacted to something, at that time.
--
-- No row is deleted. Only the label changes - lead_id, direction, created_at,
-- wa_message_id and channel are all untouched, so the communication history
-- itself is fully preserved. Verified safe before running: all 137 rows are
-- byte-identical to the exact string below, none has extra text appended
-- (a media store-failure note, say) and none carries an attachment. This is
-- the same lossless-relabel pattern already used for the 586
-- "[unsupported message type: image]" rows on 2026-09-02.

UPDATE public.communications
SET body = 'Customer reacted to a message'
WHERE body = '[unsupported message type: reaction]';
