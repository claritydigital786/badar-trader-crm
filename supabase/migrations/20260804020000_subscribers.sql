-- Part 3: real Subscribers table (August 2026)
--
-- Replaces the placeholder list the Subscribers tab generated in the browser
-- on every page load (invented names, Math.random() phone numbers, wiped on
-- refresh, CSV imports that went nowhere).
--
-- Scope note: this is its own table and touches nothing else. It does not
-- read, join to, or modify public.leads, communications, or anything the
-- live ad campaigns produce.
--
-- "Subscriber" here follows Muhammad's 2026-07-20 definition: a member of one
-- of the signalling communities. Signups from signals-form.html create pending
-- entries; actual community membership is what makes someone a subscriber, so
-- status starts at 'pending' and is confirmed separately. Idempotent.

CREATE TABLE IF NOT EXISTS public.subscribers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  phone         TEXT        NOT NULL,
  email         TEXT,
  -- Which of the signalling communities this person belongs to. Free text
  -- rather than a fixed list, because the community names are Badar's to
  -- decide and have changed once already.
  community     TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','active','inactive','removed')),
  source        TEXT        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual','signals_form','csv_import')),
  notes         TEXT,
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per phone number. Re-importing the same CSV updates rather than
-- duplicating, which the old in-browser list had no concept of.
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_phone_key
  ON public.subscribers (phone);

CREATE INDEX IF NOT EXISTS subscribers_status_idx
  ON public.subscribers (status, community);

DROP TRIGGER IF EXISTS subscribers_updated_at ON public.subscribers;
CREATE TRIGGER subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscribers: admin full access" ON public.subscribers;
CREATE POLICY "subscribers: admin full access" ON public.subscribers
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
