// Badar Trader CRM — server-side WhatsApp send proxy
// Supabase Edge Function (Deno / TypeScript)
//
// Why this exists: agents send replies from the Conversations tab. The
// original implementation read wa_access_token from public.settings in the
// agent's own browser session, which required exposing the raw token to
// every agent (schema.sql §30). This function keeps the token server-side:
// the browser sends { lead_id, text } with the agent's JWT, and the token
// never leaves the backend. Once this is deployed and the frontend switch
// is live, drop the §30 policy again.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy send-wa-message
//
// Contract: always responds 200 with JSON { ok: boolean, error?: string }
// for application-level outcomes. Non-200 means auth/infra problems only —
// the frontend treats 404 as "not deployed yet" and falls back to the
// legacy in-browser send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

const GRAPH_VERSION = "v21.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function makeServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Same env-first, settings-fallback lookup the webhook uses (whatsapp-webhook
// getWaCredentials) so both send paths stay configured from one place.
async function getWaCredentials(): Promise<{ token: string; phoneId: string }> {
  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID };
  }
  const sb = makeServiceClient();
  const { data } = await sb.from("settings").select("key, value")
    .in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: { key: string; value: string }) => r.key === key)?.value?.trim() ?? "";
  return {
    token: WHATSAPP_ACCESS_TOKEN || row("wa_access_token"),
    phoneId: WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id"),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Identify the caller from their JWT. verify_jwt already rejected requests
  // without a valid token, but we still need to know WHO is asking.
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ ok: false, error: "Not signed in" }, 401);
  }

  let leadId = "";
  let text = "";
  try {
    const body = await req.json();
    leadId = String(body?.lead_id ?? "").trim();
    text = String(body?.text ?? "").trim();
  } catch {
    return json({ ok: false, error: "Invalid request body" });
  }
  if (!leadId || !text) {
    return json({ ok: false, error: "lead_id and text are required" });
  }

  const sb = makeServiceClient();

  // Caller must be an admin or the agent this lead is assigned to — the same
  // rule the communications RLS policies enforce for logging.
  const [{ data: profile }, { data: lead, error: leadError }] = await Promise.all([
    sb.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    sb.from("leads").select("id, phone, assigned_agent_id").eq("id", leadId).maybeSingle(),
  ]);
  if (leadError || !lead) {
    return json({ ok: false, error: "Lead not found" });
  }
  const isAdmin = profile?.role === "admin";
  if (!isAdmin && lead.assigned_agent_id !== user.id) {
    return json({ ok: false, error: "This lead is not assigned to you" }, 403);
  }

  const { token, phoneId } = await getWaCredentials();
  if (!token || !phoneId) {
    return json({ ok: false, error: "WhatsApp credentials not configured — admin must save them in Meta Integration" });
  }

  const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
  if (!phoneDigits) {
    return json({ ok: false, error: "Lead has no phone number on record" });
  }

  const waResp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneDigits,
      type: "text",
      text: { body: text },
    }),
  });

  if (!waResp.ok) {
    const errData = await waResp.json().catch(() => ({}));
    const message = errData?.error?.message || `WhatsApp API error ${waResp.status}`;
    // Persist the failure the same way the frontend does, so it stays
    // diagnosable after the fact (see sendConvMessage in index.html).
    await sb.from("communication_logs").insert({
      lead_id: leadId,
      type: "whatsapp",
      message: `[SEND FAILED] ${message}`,
      created_by: user.id,
    }).then(() => {}, () => {});
    return json({ ok: false, error: message });
  }

  const { error: insertError } = await sb.from("communications").insert({
    lead_id: leadId,
    type: "whatsapp",
    direction: "outbound",
    body: text,
    logged_by: user.id,
  });
  if (insertError) {
    // Message DID go out — surface the logging failure rather than pretending
    // the send failed (a retry would double-message the lead).
    return json({ ok: true, warning: `Sent, but failed to log in CRM: ${insertError.message}` });
  }

  return json({ ok: true });
});
