-- "Action Items With Badar" (Muhammad, 2026-08-30): a lightweight daily
-- to-do tracker between Muhammad Shoaib and Badar Tanveer, with a
-- performance view for both. Deliberately NOT tied to profiles - neither
-- "assigned_to" party needs to be a CRM login (Muhammad isn't one at all;
-- both of Badar's own logins share the name "Badar Tanveer") - a plain text
-- label is simpler and correct here.
--
-- An item only counts as a negative miss in the performance view when it is
-- past due, not done, AND has no reason on file - Muhammad's explicit
-- request: "leave a leverage for both... so it could not be given negative
-- marking" when a reasonable factor is given. Giving a reason is itself an
-- action either party can take at any time, not just the assignee.
CREATE TABLE IF NOT EXISTS public.action_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  assigned_to  TEXT        NOT NULL CHECK (assigned_to IN ('Badar', 'Muhammad Shoaib')),
  due_date     DATE        NOT NULL,
  done         BOOLEAN     NOT NULL DEFAULT false,
  done_at      TIMESTAMPTZ,
  reason       TEXT,
  reason_by    TEXT        CHECK (reason_by IS NULL OR reason_by IN ('Badar', 'Muhammad Shoaib')),
  reason_at    TIMESTAMPTZ,
  created_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_items: admin full access" ON public.action_items;
CREATE POLICY "action_items: admin full access" ON public.action_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
