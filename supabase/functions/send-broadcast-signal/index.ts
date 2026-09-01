// Badar Trader CRM - send-broadcast-signal
// Supabase Edge Function (Deno / TypeScript)
//
// Real send path behind the admin Broadcast Signal tab. WhatsApp's Cloud
// API cannot post into WhatsApp Communities at all (documented repeatedly
// in HANDOFF.md), so "broadcast" here means individual DMs to each active
// subscriber in the target community - the same Graph API call send-wa-message
// makes to a lead, looped over subscribers instead.
//
// Deploy with JWT verification ON (admin-only, like send-wa-message):
//   supabase functions deploy send-broadcast-signal

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const GRAPH_VERSION = "v21.0";

// OFF by default, on purpose - matches BOT_REPLIES_ENABLED / KEYWORD_REPLIES_ENABLED
// / FOLLOW_UPS_ENABLED in the other functions. Before ever setting this true:
// most subscribers will be outside Meta's 24h customer-service window (they
// signed up via a form, not an active WhatsApp conversation), so free-form
// text sends will likely be rejected - an approved message template
// (see the Message Templates tab) is very likely required first.
const SIGNAL_BROADCAST_ENABLED = false;

// Real bug found 2026-08-04: the send loop below had zero pacing between
// Graph API calls and no cap on recipient count. This number's WhatsApp
// Manager tier (checked live 2026-07-20) allows only 250 business-initiated
// conversations per rolling 24h. Subscribers is a real table of ~4,000 rows,
// so an unpaced, uncapped broadcast would fire past that limit almost
// immediately - every send past it fails, which is what "a mess" means in
// practice. MAX_RECIPIENTS_PER_RUN sits below the known 250 cap to leave
// headroom for any other business-initiated conversations the same day
// (agent-initiated follow-ups, etc). Re-check the live tier in WhatsApp
// Manager before raising this if the account has since been upgraded.
const MAX_RECIPIENTS_PER_RUN = 200;
// Spacing between individual sends, purely to avoid tripping Meta's
// per-second throughput limit on top of the 24h conversation cap above.
const SEND_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function makeServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getWaCredentials(sb: ReturnType<typeof makeServiceClient>): Promise<{ token: string; phoneId: string }> {
  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID };
  }
  const { data } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  return { token: WHATSAPP_ACCESS_TOKEN || row("wa_access_token"), phoneId: WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id") };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  if (!SIGNAL_BROADCAST_ENABLED) {
    return json({ ok: false, error: "Broadcast is disabled (SIGNAL_BROADCAST_ENABLED = false). Nothing was sent, nothing was recorded." });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ ok: false, error: "Not signed in" }, 401);

  const sb = makeServiceClient();
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  // super_admin added 2026-09-01 (Badar's new role, above admin) - treated as
  // admin-or-above everywhere, same as public.is_admin() does for RLS.
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return json({ ok: false, error: "Admin only" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request body" });
  }
  const community: string = String(body?.community ?? "all").trim();
  const signalType: string = String(body?.signal_type ?? "custom").trim();
  const instrument: string = String(body?.instrument ?? "").trim();
  const entry: string = String(body?.entry ?? "").trim();
  const tp: string = String(body?.tp ?? "").trim();
  const sl: string = String(body?.sl ?? "").trim();
  const message: string = String(body?.message ?? "").trim();
  if (!message) return json({ ok: false, error: "message is required" });

  let subQuery = sb.from("subscribers").select("id, phone").eq("status", "active");
  if (community && community !== "all") subQuery = subQuery.eq("community", community);
  const { data: subscribers, error: subError } = await subQuery;
  if (subError) return json({ ok: false, error: subError.message });
  if (!subscribers || !subscribers.length) {
    return json({ ok: false, error: "No active subscribers in that target - nothing to send to." });
  }
  if (subscribers.length > MAX_RECIPIENTS_PER_RUN) {
    return json({
      ok: false,
      error: `Refusing to send: ${subscribers.length} active subscribers in this target exceeds the safe per-run cap of ${MAX_RECIPIENTS_PER_RUN}. ` +
        `This number's WhatsApp tier allows only 250 business-initiated conversations per 24h - sending to all of them in one run will fail past that ` +
        `limit and nothing was designed to retry or resume. Narrow the target (pick a single community) or split this into multiple runs across ` +
        `different days, and re-check the live tier limit in WhatsApp Manager if this cap needs to change.`,
    });
  }

  const { token, phoneId } = await getWaCredentials(sb);
  if (!token || !phoneId) return json({ ok: false, error: "WhatsApp credentials not configured - admin must save them in Meta Integration" });

  const results: Array<{ subscriber_id: string; ok: boolean; error?: string }> = [];
  for (let i = 0; i < subscribers.length; i++) {
    const s = subscribers[i];
    const phoneDigits = (s.phone ?? "").replace(/\D/g, "");
    if (!phoneDigits) {
      results.push({ subscriber_id: s.id, ok: false, error: "No phone number" });
      continue;
    }
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phoneDigits, type: "text", text: { body: message } }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        results.push({ subscriber_id: s.id, ok: false, error: errBody?.error?.message || `HTTP ${res.status}` });
      } else {
        results.push({ subscriber_id: s.id, ok: true });
      }
    } catch (err) {
      results.push({ subscriber_id: s.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    // Pace sends so we never fire faster than Meta's per-second throughput
    // limit - skip the wait after the very last recipient.
    if (i < subscribers.length - 1) await sleep(SEND_DELAY_MS);
  }

  const successCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - successCount;

  const { data: inserted, error: insertError } = await sb.from("signal_broadcasts").insert({
    sent_by: user.id,
    community: community === "all" ? null : community,
    signal_type: signalType,
    instrument: instrument || null,
    entry_price: entry || null,
    take_profit: tp || null,
    stop_loss: sl || null,
    message,
    recipient_count: results.length,
    success_count: successCount,
    failed_count: failedCount,
    results,
  }).select("id").maybeSingle();

  return json({
    ok: true,
    broadcast_id: inserted?.id ?? null,
    recipient_count: results.length,
    success_count: successCount,
    failed_count: failedCount,
    log_warning: insertError ? `Sent, but failed to log history: ${insertError.message}` : undefined,
  });
});
