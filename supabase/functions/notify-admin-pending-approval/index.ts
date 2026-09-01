// Authenticated server-side notification for a lead entering Pending Approval.
// The browser supplies only the lead id. Recipient, message copy, credentials,
// caller identity, assignment, and deduplication are all decided server-side.
//
// 2026-08-31 (Phase 39): this is now reached two ways, and stays ONE mechanism
// with one ledger and one dedup rule rather than growing a parallel notifier.
//   * A signed-in agent or admin in the Inbox, as before: JWT, permission check,
//     "<agent> marked <lead> as closed and awaiting approval".
//   * conversion-hook, when a customer's deposit-confirmation form is accepted.
//     That is a public endpoint with no user, so it authenticates over the
//     repo's existing server-to-server secret instead of a JWT, and the alert
//     says the customer submitted it rather than naming an agent who did not.
// Everything after the caller is identified is deliberately shared: the same
// pending_approval_notifications claim, the same credentials, the same send,
// the same failure handling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalRequest } from "../_shared/internal_auth.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const GRAPH_VERSION = "v21.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-internal-function-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function cleanPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function safeError(value: unknown): string {
  return value instanceof Error ? value.message : String(value ?? "Unknown error");
}

async function markFailed(
  sb: ReturnType<typeof serviceClient>,
  leadId: string,
  statusChangedAt: string,
  error: string,
): Promise<void> {
  await sb.from("pending_approval_notifications")
    .update({ state: "failed", last_error: error.slice(0, 500) })
    .eq("lead_id", leadId)
    .eq("status_changed_at", statusChangedAt)
    .then(() => {}, () => {});
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Two accepted callers. The internal one is checked first and only counts
  // when the shared secret is both configured and correct, so a browser that
  // simply omits its JWT can never fall through into the internal path.
  const internalAttempt = req.headers.get("x-internal-function-secret") !== null;
  let isInternalCaller = false;
  if (internalAttempt) {
    const internalAuth = verifyInternalRequest(req, INTERNAL_FUNCTION_SECRET);
    if (!internalAuth.authorized) {
      return json({ ok: false, error: internalAuth.reason }, internalAuth.status);
    }
    isInternalCaller = true;
  }

  let user: { id: string } | null = null;
  if (!isInternalCaller) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ ok: false, error: "Not signed in" }, 401);
    }
    user = userData.user;
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return json({ ok: false, error: "Request body is too large" }, 413);
  }

  let leadId = "";
  try {
    const rawBody = await req.text();
    if (rawBody.length > 2048) {
      return json({ ok: false, error: "Request body is too large" }, 413);
    }
    const body = JSON.parse(rawBody);
    leadId = String(body?.lead_id ?? "").trim();
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)) {
    return json({ ok: false, error: "A valid lead_id is required" }, 400);
  }

  const sb = serviceClient();
  const [profileResult, { data: lead, error: leadError }] = await Promise.all([
    user
      ? sb.from("profiles").select("full_name, email, role, is_suspended").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("leads")
      .select("id, full_name, status, status_changed_at, assigned_agent_id")
      .eq("id", leadId)
      .maybeSingle(),
  ]);
  const profile = profileResult?.data ?? null;
  if (leadError || !lead) {
    return json({ ok: false, error: "Lead not found" }, 404);
  }

  // The internal caller is trusted server code that has already decided this
  // lead belongs in Pending Approval, so there is no per-user permission to
  // check. The browser path is unchanged.
  if (!isInternalCaller) {
    // super_admin added 2026-09-01 (Badar's new role, above admin) - treated
    // as admin-or-above everywhere, same as public.is_admin() does for RLS.
    const isAdmin = (profile?.role === "admin" || profile?.role === "super_admin") && !profile?.is_suspended;
    const isAssignedAgent = profile?.role === "agent" && !profile?.is_suspended
      && lead.assigned_agent_id === user?.id;
    if (!isAdmin && !isAssignedAgent) {
      return json({ ok: false, error: "Your account cannot notify for this lead" }, 403);
    }
  }
  if (lead.status !== "pending_approval" || !lead.status_changed_at) {
    return json({ ok: false, error: "The lead is not awaiting approval" }, 409);
  }

  const statusChangedAt = String(lead.status_changed_at);
  const claim = {
    lead_id: leadId,
    status_changed_at: statusChangedAt,
    requested_by: user?.id ?? null,
    state: "pending",
    claimed_at: new Date().toISOString(),
    sent_at: null,
    last_error: null,
  };
  const { error: claimError } = await sb.from("pending_approval_notifications").insert(claim);
  if (claimError?.code === "23505") {
    const { data: existing } = await sb.from("pending_approval_notifications")
      .select("state, claimed_at")
      .eq("lead_id", leadId)
      .eq("status_changed_at", statusChangedAt)
      .maybeSingle();
    if (existing?.state === "sent") {
      return json({ ok: true, already_notified: true });
    }
    const claimedAt = new Date(existing?.claimed_at ?? 0).getTime();
    const isFreshClaim = existing?.state === "pending" && Date.now() - claimedAt < 5 * 60 * 1000;
    if (isFreshClaim) {
      return json({ ok: true, notification_pending: true });
    }
    const { data: reclaimed, error: reclaimError } = await sb.from("pending_approval_notifications")
      .update({
        requested_by: user?.id ?? null,
        state: "pending",
        claimed_at: new Date().toISOString(),
        sent_at: null,
        last_error: null,
      })
      .eq("lead_id", leadId)
      .eq("status_changed_at", statusChangedAt)
      .eq("state", existing?.state ?? "")
      .eq("claimed_at", existing?.claimed_at ?? "")
      .select("lead_id")
      .maybeSingle();
    if (reclaimError || !reclaimed) {
      return json({ ok: false, error: "Could not safely claim this notification" }, 409);
    }
  } else if (claimError) {
    return json({ ok: false, error: "Could not record the notification request" }, 500);
  }

  const { data: settings } = await sb.from("settings").select("key, value")
    .in("key", ["wa_access_token", "wa_phone_number_id", "admin_whatsapp_number"]);
  const setting = (key: string) => settings?.find((row: { key: string; value: string }) => row.key === key)?.value?.trim() ?? "";
  const token = WHATSAPP_ACCESS_TOKEN || setting("wa_access_token");
  const phoneId = WHATSAPP_PHONE_NUMBER_ID || setting("wa_phone_number_id");
  const adminPhone = cleanPhone(setting("admin_whatsapp_number"));
  if (!token || !phoneId || !adminPhone) {
    const error = "Admin WhatsApp notification is not configured";
    await markFailed(sb, leadId, statusChangedAt, error);
    return json({ ok: false, error }, 503);
  }

  const leadName = lead.full_name || "Unknown lead";
  // The internal caller is the customer's own deposit-confirmation form, so the
  // alert must not claim an agent did this. Naming a real person for something
  // they did not do is how an admin loses trust in the alert.
  const message = isInternalCaller
    ? `Pending approval\n\n${leadName} submitted a deposit confirmation and is awaiting approval.\n\nReview it at crm.badartrader.com`
    : `Pending approval\n\n${profile?.full_name || profile?.email || "An agent"} marked ${leadName} as closed and awaiting approval.\n\nReview it at crm.badartrader.com`;

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: adminPhone,
        type: "text",
        text: { body: message },
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = payload?.error?.message || `WhatsApp API error ${response.status}`;
      await markFailed(sb, leadId, statusChangedAt, error);
      console.error("Admin pending-approval notification failed:", error);
      return json({ ok: false, error: "Admin notification could not be sent" }, 502);
    }
  } catch (error) {
    const message = safeError(error);
    await markFailed(sb, leadId, statusChangedAt, message);
    console.error("Admin pending-approval notification failed:", message);
    return json({ ok: false, error: "Admin notification could not be sent" }, 502);
  }

  const { error: sentError } = await sb.from("pending_approval_notifications")
    .update({ state: "sent", sent_at: new Date().toISOString(), last_error: null })
    .eq("lead_id", leadId)
    .eq("status_changed_at", statusChangedAt);
  if (sentError) {
    return json({ ok: true, warning: "Notification sent, but its delivery record could not be updated" });
  }
  return json({ ok: true });
});
