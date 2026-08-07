-- In-app notifications (August 2026)
--
-- Why this exists: the internal forward ("send this customer message to a
-- teammate") had nowhere to deliver to. It wrote a note onto the lead and the
-- teammate only saw it if they happened to open that lead, which is not what
-- "forward it to someone" means. There was no per-user unread anywhere in the
-- schema to hang an alert on - leads.is_unread is a single global boolean
-- meaning "the customer sent something new", so reusing it would both claim a
-- customer message that never happened and light up for the whole team.
--
-- Deliberately generic rather than forward-specific: one row per thing a
-- specific person should look at. Anything else that needs to reach an
-- individual (an escalation, a mention, an assignment) can reuse this instead
-- of inventing its own mechanism.
--
-- Idempotent - safe to run more than once.

CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who should see it. CASCADE because a notification for a deleted account
  -- is unreachable by definition.
  recipient_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Who caused it. SET NULL, not CASCADE: deleting the sender must never
  -- delete the recipient's notification.
  actor_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind          TEXT        NOT NULL DEFAULT 'forward'
                              CHECK (kind IN ('forward','mention','assignment','escalation','system')),
  title         TEXT        NOT NULL,
  body          TEXT,
  -- Optional jump target, so clicking a notification can open the right
  -- conversation. SET NULL keeps the notification readable after the lead is
  -- gone rather than deleting history the person has not seen yet.
  lead_id       UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- A notification is personal: you read and update only your own, regardless of
-- role. Admins are NOT given blanket read access here - being an admin is not
-- a reason to read someone else's alerts.
DROP POLICY IF EXISTS "notifications: read own" ON public.notifications;
CREATE POLICY "notifications: read own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Only for marking read. Recipient stays fixed via WITH CHECK so a row can
-- never be reassigned to somebody else.
DROP POLICY IF EXISTS "notifications: update own" ON public.notifications;
CREATE POLICY "notifications: update own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Any active staff member can notify a colleague, which is the whole point.
-- actor_id must be the sender, so a notification cannot be forged as coming
-- from someone else.
DROP POLICY IF EXISTS "notifications: staff insert" ON public.notifications;
CREATE POLICY "notifications: staff insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_active_staff() AND actor_id = auth.uid());

-- The bell polls "my unread, newest first" on every load, which is the only
-- access pattern this table has.
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, is_read, created_at DESC);
