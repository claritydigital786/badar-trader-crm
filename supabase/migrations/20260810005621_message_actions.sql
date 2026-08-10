-- Per-user controls behind the WhatsApp-style message menu. These are CRM
-- preferences only: hiding a row here never deletes or unsends a WhatsApp
-- message. Reactions are recorded after Meta accepts the reaction request.
CREATE TABLE public.communication_message_actions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID        NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_pinned         BOOLEAN     NOT NULL DEFAULT false,
  is_starred        BOOLEAN     NOT NULL DEFAULT false,
  is_hidden         BOOLEAN     NOT NULL DEFAULT false,
  reaction          TEXT        CHECK (reaction IS NULL OR char_length(reaction) <= 16),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (communication_id, user_id)
);

CREATE INDEX communication_message_actions_user_idx
  ON public.communication_message_actions (user_id, communication_id);

ALTER TABLE public.communication_message_actions ENABLE ROW LEVEL SECURITY;

-- A preference row belongs to one signed-in user and is only accessible while
-- that user can still read the parent communication. The communications RLS
-- policy supplies the admin/assigned-agent boundary, so reassignment removes
-- access here at the same time it removes access to the message.
CREATE POLICY "message actions: owner select accessible message"
  ON public.communication_message_actions
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  );

CREATE POLICY "message actions: owner insert accessible message"
  ON public.communication_message_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  );

CREATE POLICY "message actions: owner update accessible message"
  ON public.communication_message_actions
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  );

CREATE POLICY "message actions: owner delete accessible message"
  ON public.communication_message_actions
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  );

-- New projects no longer expose public-schema tables to the Data API by
-- default. Grant authenticated explicitly; RLS above remains the row gate.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.communication_message_actions TO authenticated;

COMMENT ON TABLE public.communication_message_actions IS
  'Per-user CRM preferences for WhatsApp communication rows; does not delete or mutate messages at Meta.';
