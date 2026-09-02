-- Phase 44 - agents could never actually view their own sent attachments
-- (Muhammad, 2026-09-02)
--
-- Found live: Hanzala sent a PDF form to a real customer (Taha Khan), and it
-- showed "Attachment (failed to load - tap to retry)" on his own screen.
-- Root cause: the storage RLS policy for reading the deposit-screenshots
-- bucket checks (storage.foldername(name))[1] against the lead's id -
-- correct for INBOUND attachments (path "<leadId>/file.ext") but wrong for
-- OUTBOUND ones (path "outbound/<leadId>/file.ext", added when voice-note/
-- document sending was built), where the lead id sits at position [2], not
-- [1]. The policy has never matched a single outbound attachment, for any
-- agent, on any lead, ever - proven live via JWT simulation as Hanzala's own
-- account against the real Taha Khan object: 0 rows, even on his own
-- assigned lead.
--
-- Fix: match the lead id against ANY element of the folder path, not just
-- the first - correct for both the inbound and outbound layouts, and for
-- any future prefix without another migration.

DROP POLICY IF EXISTS "deposit-screenshots: agent select own clients" ON storage.objects;
CREATE POLICY "deposit-screenshots: agent select own clients" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'deposit-screenshots' AND
    (SELECT public.is_active_staff()) AND
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id::text = ANY(storage.foldername(name))
      AND l.assigned_agent_id = (SELECT auth.uid())
    )
  );
