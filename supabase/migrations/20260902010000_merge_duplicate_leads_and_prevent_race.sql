-- Phase 45 - merge existing duplicate leads, then close the race that
-- creates them (Muhammad, 2026-09-02)
--
-- Found live while monitoring round-robin: two leads for the same real
-- customer (+923379177860), same timestamp to the second, same assigned
-- agent, one holding "Hi" and the other holding "Trading sikhna hai" - two
-- messages the customer sent in immediate succession, each processed by a
-- separate concurrent webhook invocation. upsertLead() does a plain
-- SELECT-then-INSERT with no locking: both invocations' SELECT ran before
-- either INSERT committed, so both found "no existing lead" and both
-- inserted one. Checking the whole table found this is not a one-off - 18
-- real phone numbers have exactly this pattern, all sharing the same
-- signature (same phone, same assigned agent, timestamps within a second
-- of each other, zero rows in lead_activity/transactions/kyc_documents on
-- either side) - safe to merge uniformly rather than judgment-call each one.
--
-- Part 1: merge each pair. The chronologically first row (tie-broken by id)
-- survives; the other's real messages move onto it, its own duplicate
-- "[assigned to X, notified]" log line is dropped (the survivor already has
-- its own identical one), then the now-empty duplicate lead row is deleted.
DO $$
DECLARE
  dupes CURSOR FOR
    SELECT phone,
           (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS survivor_id,
           (array_agg(id ORDER BY created_at ASC, id ASC))[2] AS loser_id
    FROM public.leads
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING count(*) = 2;
  r RECORD;
BEGIN
  FOR r IN dupes LOOP
    DELETE FROM public.communications
      WHERE lead_id = r.loser_id AND body LIKE '[assigned to %, notified]';
    UPDATE public.communications
      SET lead_id = r.survivor_id
      WHERE lead_id = r.loser_id;
    DELETE FROM public.leads WHERE id = r.loser_id;
  END LOOP;
END $$;

-- Part 2: close the actual race, not just this batch of symptoms. A unique
-- index makes the two concurrent inserts genuinely impossible instead of
-- merely unlikely - the second INSERT now fails at the database level
-- rather than silently succeeding as a duplicate. Partial (WHERE phone IS
-- NOT NULL) because Messenger/Instagram leads legitimately have phone NULL
-- and are identified by external_id instead - multiple NULLs must stay
-- allowed.
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique_idx
  ON public.leads (phone) WHERE phone IS NOT NULL;
