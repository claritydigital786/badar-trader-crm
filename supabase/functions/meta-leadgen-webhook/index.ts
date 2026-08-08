// Badar Trader CRM - Meta Lead Ads Webhook
// Supabase Edge Function (Deno / TypeScript)
//
// Receives Meta's "leadgen" webhook (fires when someone submits a Facebook or
// Instagram Lead Ad form), fetches the actual submitted field data via the
// Leads Retrieval API, and creates a lead in the CRM. That insert alone is
// enough to trigger the existing automation_lead_created Postgres trigger ->
// fire-automation, which sends the WhatsApp message IF an active
// automation_rule exists for trigger_event='lead_created' - no separate send
// logic needed here, this function only has to get the lead into the table.
//
// REQUIRES, none of which this function can verify or set up on its own:
//   1. META_LEADGEN_VERIFY_TOKEN below must match what's entered in
//      Meta App Dashboard -> Webhooks -> Page -> Verify Token, when
//      subscribing this URL to the "leadgen" field.
//   2. settings.meta_token must have the leads_retrieval permission granted
//      - confirmed via debug_token that it currently does NOT (only has
//      ads_management, ads_read, whatsapp_business_management,
//      whatsapp_business_messaging). Every fetchLeadFields() call will fail
//      with a permissions error until this is granted.
//   3. Meta requires App Review approval for leads_retrieval to work with
//      real (non-admin/tester) leads in production - whether Badar's Meta
//      App already has this approved is unknown and outside what an API
//      call can check.
//   4. The webhook subscription itself (Page -> leadgen field -> this URL)
//      has to be done manually in Meta's Developer Console - no API call
//      does this from the outside.
//
// Deploy: supabase functions deploy meta-leadgen-webhook --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_LEADGEN_VERIFY_TOKEN = Deno.env.get("META_LEADGEN_VERIFY_TOKEN") ?? "";
const GRAPH_VERSION = "v21.0";

// ── Meta webhook signature verification (X-Hub-Signature-256) ─────────────
// Same change, same reasoning and same three states as whatsapp-webhook - see
// the long comment there. In short: until 2026-08-08 this endpoint accepted any
// unsigned POST, so anyone who learned the URL could inject fabricated leads
// straight into the CRM (and each insert fires the lead_created automation
// trigger, so a fake lead can also trigger a real outbound message).
//
//   1. META_APP_SECRET unset  -> verification skipped, behaviour unchanged.
//   2. Secret set, not enforced -> checked and logged, request still processed.
//   3. Secret set and META_SIGNATURE_ENFORCED = "true" -> 401 on bad signature.
//
// Both webhooks read the same two variables, because both are subscriptions on
// the same Meta app and therefore share one app secret.
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_SIGNATURE_ENFORCED =
  (Deno.env.get("META_SIGNATURE_ENFORCED") ?? "").trim().toLowerCase() === "true";

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function checkMetaSignature(
  rawBody: string,
  header: string | null,
): Promise<{ allowed: boolean; reason: string }> {
  if (!META_APP_SECRET) {
    return { allowed: true, reason: "META_APP_SECRET not set - verification skipped" };
  }

  let valid = false;
  let detail: string;
  const prefix = "sha256=";

  if (!header) {
    detail = "no X-Hub-Signature-256 header";
  } else if (!header.startsWith(prefix)) {
    detail = "signature header is not sha256=";
  } else {
    const provided = header.slice(prefix.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(provided)) {
      detail = "signature is not a 64-character hex digest";
    } else {
      const expected = await hmacSha256Hex(META_APP_SECRET, rawBody);
      valid = timingSafeEqualHex(provided, expected);
      detail = valid ? "signature valid" : "signature mismatch";
    }
  }

  if (valid) return { allowed: true, reason: detail };
  if (!META_SIGNATURE_ENFORCED) {
    return { allowed: true, reason: `AUDIT ONLY, would have been rejected: ${detail}` };
  }
  return { allowed: false, reason: detail };
}

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getMetaToken(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", "meta_token").maybeSingle();
  return (data?.value || "").trim();
}

type FieldData = { name: string; values: string[] };

function normPhone(p: string): string {
  p = (p || "").trim();
  if (!p) return "";
  return p.startsWith("+") ? p : "+" + p.replace(/\D/g, "");
}

async function fetchLeadFields(leadgenId: string, token: string): Promise<{ ok: true; fields: FieldData[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?access_token=${token}`);
    const json = await res.json();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
    return { ok: true, fields: json.field_data ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function pick(fields: FieldData[], ...names: string[]): string {
  for (const n of names) {
    const f = fields.find((x) => x.name.toLowerCase() === n);
    if (f?.values?.[0]) return f.values[0];
  }
  return "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === META_LEADGEN_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Read the raw body once - the signature is over these exact bytes, so it
  // has to be checked before the JSON is parsed. Wrapped because this read
  // used to sit inside the try below as part of req.json(), and an unreadable
  // body should still produce the same clean error response it always did.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: `could not read request body: ${e instanceof Error ? e.message : String(e)}` }),
      { status: 500 },
    );
  }

  const sig = await checkMetaSignature(rawBody, req.headers.get("x-hub-signature-256"));
  if (!sig.allowed) {
    console.error(`Meta leadgen webhook: rejected unverified request - ${sig.reason}`);
    return new Response("Invalid signature", { status: 401 });
  }
  if (META_APP_SECRET) console.log(`Meta leadgen webhook signature: ${sig.reason}`);

  try {
    const payload = JSON.parse(rawBody);
    const sb = makeSupabase();
    const metaToken = await getMetaToken(sb);
    const report: Record<string, unknown> = {};

    const entries = payload?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        if (!leadgenId) continue;

        if (!metaToken) {
          report[leadgenId] = { ok: false, error: "no meta_token stored in settings" };
          continue;
        }

        const fetched = await fetchLeadFields(leadgenId, metaToken);
        if (!fetched.ok) {
          report[leadgenId] = { ok: false, error: fetched.error };
          continue;
        }

        const fullName = pick(fetched.fields, "full_name", "name");
        const firstName = pick(fetched.fields, "first_name") || fullName.split(" ")[0] || "Unknown";
        const lastName = pick(fetched.fields, "last_name") || fullName.split(" ").slice(1).join(" ");
        const email = pick(fetched.fields, "email");
        const phone = normPhone(pick(fetched.fields, "phone_number", "phone"));

        const { data: lead, error: insErr } = await sb
          .from("leads")
          .insert({
            first_name: firstName,
            last_name: lastName || null,
            full_name: fullName || firstName,
            email: email || null,
            phone: phone || null,
            source: "meta",
            meta_campaign: formId ? `leadgen_form_${formId}` : "leadgen",
            status: "new",
          })
          .select("id")
          .single();

        if (insErr) {
          report[leadgenId] = { ok: false, error: `lead insert failed: ${insErr.message}` };
          continue;
        }

        report[leadgenId] = { ok: true, lead_id: lead.id };
      }
    }

    return new Response(JSON.stringify({ ok: true, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }), { status: 500 });
  }
});
