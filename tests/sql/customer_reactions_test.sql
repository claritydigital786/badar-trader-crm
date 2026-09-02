-- Inbound customer reactions: schema, replacement, removal and RLS, run
-- against the real migration on a throwaway Postgres.
\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

CREATE OR REPLACE FUNCTION t(label text, got anyelement, want anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS NOT DISTINCT FROM want THEN RAISE NOTICE 'PASS %', label;
  ELSE RAISE NOTICE 'FAIL % - got %, want %', label, got, want; END IF;
END; $$;

INSERT INTO profiles (id, full_name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ehsan Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Muhammad Hanzala', 'agent'),
  ('33333333-3333-3333-3333-333333333333', 'Farwa Qazi', 'agent');

INSERT INTO leads (id, full_name, status, assigned_agent_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Hanzala Customer', 'new', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Farwa Customer',   'new', '33333333-3333-3333-3333-333333333333');

INSERT INTO communications (id, lead_id, type, direction, body, wa_message_id, channel) VALUES
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','whatsapp','inbound','Hello','wamid.IN','3903'),
  ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','whatsapp','outbound','Hi there','wamid.OUT','3903'),
  ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','whatsapp','inbound','Salam','wamid.OTHER','3903');

-- ── Reaction on an inbound message ─────────────────────────────
INSERT INTO public.communication_customer_reactions
  (communication_id, lead_id, emoji, target_wa_message_id, wa_message_id, channel, reacted_at)
VALUES ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','👍','wamid.IN','wamid.R1','3903','2026-09-03T10:00:00Z');
SELECT t('a reaction is stored', (SELECT emoji FROM public.communication_customer_reactions
  WHERE communication_id='cccccccc-0000-0000-0000-000000000001'), '👍');

-- ── Replacement is a constraint, not an app convention ─────────
INSERT INTO public.communication_customer_reactions
  (communication_id, lead_id, emoji, target_wa_message_id, wa_message_id, channel, reacted_at)
VALUES ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','❤️','wamid.IN','wamid.R2','3903','2026-09-03T10:05:00Z')
ON CONFLICT (communication_id) DO UPDATE SET emoji = excluded.emoji, wa_message_id = excluded.wa_message_id, reacted_at = excluded.reacted_at;
SELECT t('a newer emoji replaces the old one', (SELECT emoji FROM public.communication_customer_reactions
  WHERE communication_id='cccccccc-0000-0000-0000-000000000001'), '❤️');
SELECT t('still exactly one row for that message',
  (SELECT count(*) FROM public.communication_customer_reactions
   WHERE communication_id='cccccccc-0000-0000-0000-000000000001'), 1::bigint);

DO $$ BEGIN
  INSERT INTO public.communication_customer_reactions
    (communication_id, lead_id, emoji, target_wa_message_id, reacted_at)
  VALUES ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','🙏','wamid.IN','2026-09-03T11:00:00Z');
  RAISE NOTICE 'FAIL a second row for the same message must be impossible';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS the database refuses a second reaction on one message'; END $$;

-- ── A reaction on an OUTBOUND (agent) message is allowed ───────
INSERT INTO public.communication_customer_reactions
  (communication_id, lead_id, emoji, target_wa_message_id, reacted_at)
VALUES ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','😂','wamid.OUT','2026-09-03T10:10:00Z');
SELECT t('a customer may react to an agent message',
  (SELECT emoji FROM public.communication_customer_reactions
   WHERE communication_id='cccccccc-0000-0000-0000-000000000002'), '😂');

-- ── Constraints ────────────────────────────────────────────────
DO $$ BEGIN
  INSERT INTO public.communication_customer_reactions
    (communication_id, lead_id, emoji, target_wa_message_id, reacted_at)
  VALUES ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','','wamid.OTHER','2026-09-03T10:00:00Z');
  RAISE NOTICE 'FAIL an empty emoji must never be stored (it is a REMOVAL signal, not a value)';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS an empty emoji cannot be stored'; END $$;

DO $$ BEGIN
  INSERT INTO public.communication_customer_reactions
    (communication_id, lead_id, emoji, target_wa_message_id, channel, reacted_at)
  VALUES ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','👍','wamid.OTHER','9999','2026-09-03T10:00:00Z');
  RAISE NOTICE 'FAIL an unknown channel must be refused';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS channel is restricted to the two real numbers'; END $$;

-- ── Deleting a message removes its reaction, never the reverse ─
INSERT INTO public.communication_customer_reactions
  (communication_id, lead_id, emoji, target_wa_message_id, reacted_at)
VALUES ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000002','👍','wamid.OTHER','2026-09-03T10:00:00Z');
DELETE FROM communications WHERE id = 'cccccccc-0000-0000-0000-000000000003';
SELECT t('a reaction is cascade-removed with its message',
  (SELECT count(*) FROM public.communication_customer_reactions
   WHERE communication_id='cccccccc-0000-0000-0000-000000000003'), 0::bigint);

-- ── RLS: agent isolation, inherited from communications ────────
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY comms_admin ON communications FOR ALL USING (public.is_admin());
CREATE POLICY comms_agent ON communications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = communications.lead_id
                   AND l.assigned_agent_id = (SELECT auth.uid())));
GRANT SELECT ON communications TO authenticated;
-- The agent policy's own subquery reads leads, so the role needs SELECT on it
-- too. Production grants this already; the fixture did not, and without it
-- every isolation assertion below errors with "permission denied for table
-- leads" instead of running - which is exactly how it silently skipped the
-- first time this suite was written.
GRANT SELECT ON leads TO authenticated;

SET ROLE authenticated;
SET test.uid = '22222222-2222-2222-2222-222222222222';
SELECT t('Hanzala sees the reactions on HIS lead''s messages',
  (SELECT count(*) FROM public.communication_customer_reactions), 2::bigint);

SET test.uid = '33333333-3333-3333-3333-333333333333';
SELECT t('Farwa sees NONE of Hanzala''s lead reactions',
  (SELECT count(*) FROM public.communication_customer_reactions), 0::bigint);

SET test.uid = '11111111-1111-1111-1111-111111111111';
SELECT t('the admin sees every reaction',
  (SELECT count(*) FROM public.communication_customer_reactions), 2::bigint);

-- ── Staff may never write a customer reaction ──────────────────
SET test.uid = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  INSERT INTO public.communication_customer_reactions
    (communication_id, lead_id, emoji, target_wa_message_id, reacted_at)
  VALUES ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','🎉','wamid.OUT','2026-09-03T12:00:00Z');
  RAISE NOTICE 'FAIL even an admin must not be able to invent a customer reaction';
EXCEPTION WHEN insufficient_privilege OR unique_violation THEN RAISE NOTICE 'PASS staff cannot INSERT a customer reaction';
END $$;
DO $$ BEGIN
  UPDATE public.communication_customer_reactions SET emoji = '🎉';
  IF (SELECT count(*) FROM public.communication_customer_reactions WHERE emoji = '🎉') > 0 THEN
    RAISE NOTICE 'FAIL staff must not be able to edit a customer reaction';
  ELSE RAISE NOTICE 'PASS staff cannot UPDATE a customer reaction'; END IF;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS staff cannot UPDATE a customer reaction'; END $$;
DO $$ BEGIN
  DELETE FROM public.communication_customer_reactions;
  IF (SELECT count(*) FROM public.communication_customer_reactions) = 0 THEN
    RAISE NOTICE 'FAIL staff must not be able to erase a customer reaction';
  ELSE RAISE NOTICE 'PASS staff cannot DELETE a customer reaction'; END IF;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS staff cannot DELETE a customer reaction'; END $$;
RESET ROLE;

-- ── The historical relabel is lossless ─────────────────────────
INSERT INTO communications (id, lead_id, type, direction, body, wa_message_id, channel, created_at) VALUES
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','whatsapp','inbound','[unsupported message type: reaction]','wamid.OLD1','3903','2026-08-27T09:00:00Z'),
  ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','whatsapp','inbound','[unsupported message type: unsupported]','wamid.OLD2','3903','2026-08-27T09:01:00Z');

UPDATE public.communications SET body = 'Customer reacted to a message'
WHERE body = '[unsupported message type: reaction]';

SELECT t('the reaction placeholder is relabelled',
  (SELECT body FROM communications WHERE id='dddddddd-0000-0000-0000-000000000001'), 'Customer reacted to a message');
SELECT t('a DIFFERENT unsupported type is left alone',
  (SELECT body FROM communications WHERE id='dddddddd-0000-0000-0000-000000000002'), '[unsupported message type: unsupported]');
SELECT t('the relabelled row keeps its lead',
  (SELECT lead_id FROM communications WHERE id='dddddddd-0000-0000-0000-000000000001'), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
SELECT t('the relabelled row keeps its timestamp',
  (SELECT created_at FROM communications WHERE id='dddddddd-0000-0000-0000-000000000001'), '2026-08-27T09:00:00Z'::timestamptz);
SELECT t('the relabelled row keeps its wa_message_id',
  (SELECT wa_message_id FROM communications WHERE id='dddddddd-0000-0000-0000-000000000001'), 'wamid.OLD1');
SELECT t('the relabelled row keeps its channel and direction',
  (SELECT channel || '/' || direction FROM communications WHERE id='dddddddd-0000-0000-0000-000000000001'), '3903/inbound');
SELECT t('no row was deleted by the relabel',
  (SELECT count(*) FROM communications WHERE id IN
     ('dddddddd-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002')), 2::bigint);
