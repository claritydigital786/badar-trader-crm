-- Keep the WhatsApp access token on the server. The secure send proxy is
-- already the primary Inbox path; this migration removes the old Agent
-- browser fallback and adds a private deduplication ledger for the server-side
-- pending-approval notification.

DROP POLICY IF EXISTS "settings: agents read wa send creds" ON public.settings;

CREATE TABLE IF NOT EXISTS public.pending_approval_notifications (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status_changed_at timestamptz NOT NULL,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'sent', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  PRIMARY KEY (lead_id, status_changed_at)
);

ALTER TABLE public.pending_approval_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pending_approval_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pending_approval_notifications TO service_role;

CREATE INDEX IF NOT EXISTS pending_approval_notifications_state_idx
  ON public.pending_approval_notifications (state, claimed_at);

CREATE INDEX IF NOT EXISTS pending_approval_notifications_requested_by_idx
  ON public.pending_approval_notifications (requested_by)
  WHERE requested_by IS NOT NULL;
