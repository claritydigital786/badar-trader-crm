-- Phase 39 - deterministic, database-backed idempotency for deposit-confirmation
-- submissions (Muhammad, 2026-08-31)
--
-- The deposit flow calls conversion-hook MORE THAN ONCE for a single real
-- submission, and always has - this is not a rare refresh edge case, it is the
-- normal path. join.html posts the form, then redirects to thankyou.html, whose
-- own script calls the same hook again on load. Every later refresh or revisit
-- of thankyou.html calls it once more. Each call re-ran the entire side effect
-- set: a leads UPDATE, a communication_logs row, and now an admin alert. One
-- customer, one deposit, one submission produced a duplicate activity line on
-- every reload.
--
-- Worse, the redirect from join.html forwards lead_id, phone, platform and
-- amount but NOT account, so the follow-up call reached the hook with an empty
-- broker account ref and wrote deposit_account_ref = NULL over the value the
-- customer had just typed. The evidence an admin needs to check the IB portal
-- was being destroyed seconds after it was captured. join.html and thankyou.html
-- now forward account as well, so every call for one claim carries an identical
-- payload, and the guard below stops the repeat call regardless.
--
-- The rule: one accepted deposit claim is processed exactly once. A claim is
-- identified by its CONTENT, not by a timer and not by an in-memory cooldown -
-- an Edge Function is stateless and may cold start per request, so anything
-- held in process memory is worthless here. The key is a SHA-256 digest of the
-- lead plus the normalised claim fields, so it is deterministic across
-- instances, restarts and regions: the same claim always produces the same key,
-- and a genuinely different claim (a different amount, platform, or broker
-- account) produces a different key and is processed normally.
--
-- This deliberately does NOT dedupe the admin notification itself. That already
-- has its own mechanism - pending_approval_notifications, keyed
-- (lead_id, status_changed_at) - and a second competing notification ledger is
-- exactly what must not be built here. See the note in conversion-hook.

CREATE TABLE IF NOT EXISTS public.deposit_submissions (
  submission_key TEXT PRIMARY KEY CHECK (length(submission_key) = 64),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  account_ref TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0)
);

COMMENT ON TABLE public.deposit_submissions IS
  'One row per distinct accepted deposit-confirmation claim. Insert wins the right to process; a conflict is a replay. replay_count records how many times the thank-you page re-fired the same claim.';

CREATE INDEX IF NOT EXISTS deposit_submissions_lead_id_idx
  ON public.deposit_submissions (lead_id, first_seen_at DESC);

ALTER TABLE public.deposit_submissions ENABLE ROW LEVEL SECURITY;

-- Same posture as pending_approval_notifications and public_form_rate_limits:
-- service role only. conversion-hook runs on the service role key. No browser,
-- signed in or anonymous, has any reason to read or write this ledger, and the
-- public form endpoint must not be able to forge or clear its own dedup state.
REVOKE ALL ON TABLE public.deposit_submissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deposit_submissions TO service_role;

-- Atomic claim. Returns TRUE exactly once per submission_key, to exactly one
-- caller, even if two requests race - the uniqueness is enforced by the primary
-- key inside a single statement, not by a read-then-write in the function.
-- xmax = 0 is true only on a genuine INSERT, false when ON CONFLICT took the
-- UPDATE path, which is what separates a first submission from a replay.
CREATE OR REPLACE FUNCTION public.claim_deposit_submission(
  p_submission_key TEXT,
  p_lead_id UUID,
  p_platform TEXT,
  p_amount NUMERIC,
  p_account_ref TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  IF p_submission_key IS NULL OR length(p_submission_key) <> 64 THEN
    RAISE EXCEPTION 'p_submission_key must be a SHA-256 hex digest';
  END IF;

  INSERT INTO public.deposit_submissions AS d (
    submission_key, lead_id, platform, amount, account_ref
  )
  VALUES (p_submission_key, p_lead_id, p_platform, COALESCE(p_amount, 0), p_account_ref)
  ON CONFLICT (submission_key) DO UPDATE
    SET last_seen_at = now(),
        replay_count = d.replay_count + 1
  RETURNING (xmax = 0) INTO v_inserted;

  RETURN COALESCE(v_inserted, FALSE);
END;
$$;

-- Release a claim that was won but could not be completed, so the customer can
-- retry. Only ever removes a key that has never been replayed, so it cannot
-- reopen a claim that has already been processed and re-fired.
CREATE OR REPLACE FUNCTION public.release_deposit_submission(p_submission_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.deposit_submissions
   WHERE submission_key = p_submission_key
     AND replay_count = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_deposit_submission(TEXT, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deposit_submission(TEXT, UUID, TEXT, NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.release_deposit_submission(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_deposit_submission(TEXT) TO service_role;
