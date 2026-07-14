// Badar Trader CRM — Meta Lead Ads Webhook
// Supabase Edge Function (Deno / TypeScript)
//
// Receives Meta's "leadgen" webhook (fires when someone submits a Facebook or
// Instagram Lead Ad form), fetches the actual submitted field data via the
// Leads Retrieval API, and creates a lead in the CRM. That insert alone is
// enough to trigger the existing automation_lead_created Postgres trigger ->
// fire-automation, which sends the WhatsApp message IF an active
// automation_rule exists for trigger_event='lead_created' — no separate send
// logic needed here, this function only has to get the lead into the table.
//
// REQUIRES, none of which this function can verify or set up on its own:
//   1. META_LEADGEN_VERIFY_TOKEN below must match what's entered in
//      Meta App Dashboard -> Webhooks -> Page -> Verify Token, when
//      subscribing this URL to the "leadgen" field.
//   2. settings.meta_token must have the leads_retrieval permission granted
//      — confirmed via debug_token that it currently does NOT (only has
//      ads_management, ads_read, whatsapp_business_management,
//      whatsapp_business_messaging). Every fetchLeadFields() call will fail
//      with a permissions error until this is granted.
//   3. Meta requires App Review approval for leads_retrieval to work with
//      real (non-admin/tester) leads in production — whether Badar's Meta
//      App already has this approved is unknown and outside what an API
//      call can check.
//   4. The webhook subscription itself (Page -> leadgen field -> this URL)
//      has to be done manually in Meta's Developer Console — no API call
//      does this from the outside.
//
// Deploy: supabase functions deploy meta-leadgen-webhook --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_LEADGEN_VERIFY_TOKEN = Deno.env.get("META_LEADGEN_VERIFY_TOKEN") ?? "";
const GRAPH_VERSION = "v21.0";

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

  try {
    const payload = await req.json();
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
