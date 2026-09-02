-- Phase 45 - inbound CUSTOMER WhatsApp reactions (Hanzala's report, 2026-09-02)
--
-- Agents were seeing "[unsupported message type: reaction]" as a standalone
-- bubble every time a customer reacted to a message. 137 such rows exist in
-- production across 102 leads. The webhook had NO reaction handling at all:
-- a reaction fell through extractUserInput() to the generic default branch of
-- describeUnsupportedMessage().
--
-- Why a new table rather than communication_message_actions:
--
-- That table is inherently STAFF-specific and cannot represent a customer.
-- Its user_id is NOT NULL REFERENCES public.profiles(id) - a customer has no
-- profiles row, so a customer reaction could only be stored there by
-- attributing it to a staff member, which would be a fabrication. Its UNIQUE
-- constraint is (communication_id, user_id) and every one of its RLS policies
-- is user_id = auth.uid(), so a customer row would either be invisible to
-- everyone or would have to impersonate an agent. It also mixes per-user CRM
-- preferences (pinned/starred/hidden) with reactions. Forcing customer data
-- into it would corrupt all three meanings at once.
--
-- This table is the smallest correct alternative: one row per reacted-to
-- message, holding only what Meta actually sends.

CREATE TABLE IF NOT EXISTS public.communication_customer_reactions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The CRM message the customer reacted TO, resolved from the reaction
  -- payload's target wa_message_id. Never guessed.
  communication_id      UUID        NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  lead_id               UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  emoji                 TEXT        NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  -- Meta's own ids, kept verbatim for audit and for idempotency.
  target_wa_message_id  TEXT        NOT NULL,
  wa_message_id         TEXT,
  channel               TEXT        CHECK (channel IS NULL OR channel IN ('6541', '3903')),
  -- The reaction event's own timestamp, from Meta. Used to resolve ordering
  -- when webhook events arrive out of order or are redelivered.
  reacted_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- WhatsApp allows one reaction per person per message, and in a 1:1 thread
  -- the customer is that one person. A newer reaction REPLACES the old one,
  -- which this constraint turns into an upsert rather than a duplicate row.
  UNIQUE (communication_id)
);

CREATE INDEX IF NOT EXISTS communication_customer_reactions_lead_idx
  ON public.communication_customer_reactions (lead_id);
CREATE INDEX IF NOT EXISTS communication_customer_reactions_target_idx
  ON public.communication_customer_reactions (target_wa_message_id);

ALTER TABLE public.communication_customer_reactions ENABLE ROW LEVEL SECURITY;

-- Staff READ only, and only for a message they can already read. The EXISTS
-- subquery runs as the caller, so public.communications' own RLS supplies the
-- boundary: admin/super_admin see everything via is_admin(), an agent sees
-- only their own assigned leads via is_active_staff() + assigned_agent_id.
-- Reassignment removes access here at the same moment it removes access to
-- the message. This is the identical pattern communication_message_actions
-- already uses, so agent isolation cannot drift between the two.
CREATE POLICY "customer reactions: staff read accessible message"
  ON public.communication_customer_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communications c
      WHERE c.id = communication_id
    )
  );

-- Deliberately NO insert/update/delete policy for authenticated. These rows
-- record what a CUSTOMER did; only the webhook (service_role, which bypasses
-- RLS) may write them. A staff member must never be able to invent, edit or
-- erase a customer's reaction.

REVOKE ALL ON public.communication_customer_reactions FROM anon, authenticated;
GRANT SELECT ON public.communication_customer_reactions TO authenticated;

COMMENT ON TABLE public.communication_customer_reactions IS
  'Inbound WhatsApp reactions sent BY a customer against a CRM message. Written only by the whatsapp-webhook on the service role; staff read-only, scoped by the parent communication''s own RLS. Distinct from communication_message_actions, which is per-staff-user CRM preferences and cannot represent a customer (its user_id references profiles).';
