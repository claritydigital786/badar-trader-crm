// Badar Trader CRM - WhatsApp connection health check
// Supabase Edge Function (Deno / TypeScript)
//
// Why this exists: Meta Integration only ever let an admin see the raw
// credentials they typed in - never whether the number those credentials
// point at is actually alive, verified, and able to send. Modeled on the
// kind of connection-health view a third-party WhatsApp platform shows
// (a phone number's status/quality/messaging tier), but calling Meta's own
// Graph API directly with the CRM's own already-stored token - nothing here
// talks to any third-party platform's servers.
//
// Read-only: this makes exactly one GET call per invocation, sends no
// message, and touches no lead or conversation data.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy whatsapp-status

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
// 3903 (the second, ingest-only line - see whatsapp-webhook's own comment on
// this same secret) shares the WABA and access token with the primary
// number, so the one token above authenticates a status check for either
// phone_number_id. Added 2026-08-31 for the "Connect WhatsApp" sidebar
// section, which shows both real numbers' health, not just the primary one.
const WHATSAPP_PHONE_NUMBER_ID_3903 = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID_3903") ?? "";

const GRAPH_VERSION = "v21.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

// Same env-first, settings-fallback lookup send-wa-message and the webhook
// use, so every WhatsApp-calling function stays configured from one place.
// `which` picks which real number to check: "3903" for the ingest-only line
// (env-only, it has no settings-table fallback since nothing else needs one
// today), anything else for the primary line (6541).
async function getWaCredentials(which: string): Promise<{ token: string; phoneId: string }> {
  if (which === "3903") {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID_3903 };
  }
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
  if (req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

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

  const sb = makeServiceClient();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return json({ ok: false, error: "Only an admin can view WhatsApp connection health" }, 403);
  }

  const which = new URL(req.url).searchParams.get("number") || "primary";
  const { token, phoneId } = await getWaCredentials(which);
  if (!token || !phoneId) {
    return json({
      ok: false,
      error: which === "3903"
        ? "3903's credentials are not configured (WHATSAPP_PHONE_NUMBER_ID_3903 secret is missing)."
        : "WhatsApp credentials not configured - save them in Meta Integration first",
    });
  }

  const fields = "display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier";
  let resp: Response;
  try {
    resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=${fields}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
  } catch (err) {
    return json({ ok: false, error: `Could not reach Meta: ${err instanceof Error ? err.message : String(err)}` });
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ ok: false, error: data?.error?.message || `Meta returned HTTP ${resp.status}` });
  }

  return json({
    ok: true,
    checked_at: new Date().toISOString(),
    phone_number_id: phoneId,
    display_phone_number: data.display_phone_number ?? null,
    verified_name: data.verified_name ?? null,
    code_verification_status: data.code_verification_status ?? null,
    quality_rating: data.quality_rating ?? null,
    messaging_limit_tier: data.messaging_limit_tier ?? null,
  });
});
