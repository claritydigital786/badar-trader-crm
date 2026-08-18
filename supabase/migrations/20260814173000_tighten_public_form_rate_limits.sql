-- Follow-up hardening for an environment where the base rate-limit migration
-- may already be present. Add bounded cleanup and its supporting index.

CREATE INDEX IF NOT EXISTS public_form_rate_limits_updated_at_idx
ON public.public_form_rate_limits (updated_at);

CREATE OR REPLACE FUNCTION public.consume_public_form_rate_limit(
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_started_at TIMESTAMPTZ;
  v_submission_count INTEGER;
BEGIN
  IF p_key_hash IS NULL OR length(p_key_hash) <> 64 THEN
    RAISE EXCEPTION 'p_key_hash must be a SHA-256 hex digest';
  END IF;
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate limit and window must be positive';
  END IF;

  DELETE FROM public.public_form_rate_limits
  WHERE updated_at < v_now - make_interval(secs => GREATEST(p_window_seconds * 4, 86400));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_key_hash, 0));

  SELECT window_started_at, submission_count
  INTO v_window_started_at, v_submission_count
  FROM public.public_form_rate_limits
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.public_form_rate_limits (key_hash, window_started_at, submission_count, updated_at)
    VALUES (p_key_hash, v_now, 1, v_now);
    RETURN true;
  END IF;

  IF v_window_started_at <= v_now - make_interval(secs => p_window_seconds) THEN
    UPDATE public.public_form_rate_limits
    SET window_started_at = v_now, submission_count = 1, updated_at = v_now
    WHERE key_hash = p_key_hash;
    RETURN true;
  END IF;

  IF v_submission_count >= p_limit THEN
    RETURN false;
  END IF;

  UPDATE public.public_form_rate_limits
  SET submission_count = submission_count + 1, updated_at = v_now
  WHERE key_hash = p_key_hash;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_form_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_form_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
