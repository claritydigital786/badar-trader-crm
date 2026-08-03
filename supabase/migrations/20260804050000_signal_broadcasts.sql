-- Part 3: Broadcast Signal send path + history (August 2026)
--
-- The Broadcast Signal tab's UI existed but had no working "Send" behind
-- it - initBroadcastTab(), broadcastSignal() and bcAutoFill() were called
-- from index.html but never defined anywhere in the file, so opening the
-- tab or pressing Send threw a ReferenceError in the console. This table
-- backs the real send path (send-broadcast-signal edge function) and the
-- "Signal History" list on that tab.
--
-- One row per broadcast attempt (not per recipient) - recipient-level detail
-- is kept in the results JSONB column rather than a second table, since the
-- realistic subscriber counts here don't need per-row indexing.
--
-- Idempotent. Does not touch leads, communications, or anything the live ad
-- campaigns produce - subscribers are a separate opted-in audience.

CREATE TABLE IF NOT EXISTS public.signal_broadcasts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  community       TEXT,        -- NULL/'all' = every active subscriber across all communities
  signal_type     TEXT         NOT NULL DEFAULT 'custom'
                                CHECK (signal_type IN ('buy','sell','update','close','custom')),
  instrument      TEXT,
  entry_price     TEXT,
  take_profit     TEXT,
  stop_loss       TEXT,
  message         TEXT         NOT NULL,
  recipient_count INTEGER      NOT NULL DEFAULT 0,
  success_count   INTEGER      NOT NULL DEFAULT 0,
  failed_count    INTEGER      NOT NULL DEFAULT 0,
  results         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signal_broadcasts_created_idx
  ON public.signal_broadcasts (created_at DESC);

ALTER TABLE public.signal_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_broadcasts: admin full access" ON public.signal_broadcasts;
CREATE POLICY "signal_broadcasts: admin full access" ON public.signal_broadcasts
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
