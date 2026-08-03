-- Appointments (August 2026)
--
-- Scheduling calls and meetings with prospects. Agents work this daily, so
-- unlike the admin-only Part 3 tables this uses is_active_staff(), matching
-- how leads and communications already behave since Phase 15: any active
-- staff member sees everything, suspended accounts see nothing.
--
-- Scope note, deliberate: contact name and phone are plain text here and
-- there is NO foreign key into public.leads. Appointments are completely
-- decoupled from live lead and conversation data, so nothing in this
-- feature can read, lock or modify anything the running ad campaigns
-- produce. Idempotent.

CREATE TABLE IF NOT EXISTS public.appointments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_mins INTEGER     NOT NULL DEFAULT 30 CHECK (duration_mins > 0),
  -- Which staff member the appointment belongs to. SET NULL rather than
  -- CASCADE so removing a profile never silently deletes calendar history.
  agent_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes         TEXT,
  created_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointments_when_idx   ON public.appointments (scheduled_at);
CREATE INDEX IF NOT EXISTS appointments_agent_idx  ON public.appointments (agent_id, status);

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments: staff full access" ON public.appointments;
CREATE POLICY "appointments: staff full access" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());
