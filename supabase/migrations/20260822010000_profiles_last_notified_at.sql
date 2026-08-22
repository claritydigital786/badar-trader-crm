-- Remembers when each agent was last sent a WhatsApp notification, so the
-- per-agent cooldown in _shared/agent_notify_policy.mjs has something to
-- measure against. Without it, ten leads arriving at once means ten pings -
-- the July 2026 flood that got notifications switched off in the first place.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_notified_at IS
  'When this person was last sent an agent notification. Drives the per-agent notification cooldown.';
