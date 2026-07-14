// Badar Trader CRM — fire-automation
// Supabase Edge Function (Deno / TypeScript)
//
// Called by Postgres triggers (see supabase/schema.sql Phase 8) whenever a real
// event happens: a lead is created, a lead's status changes, KYC gets verified,
// or a deposit is recorded. Looks up matching active automation_rules and
// actually executes them — WhatsApp sends for real (reusing the bot's Cloud API
// credentials, same as whatsapp-webhook), agent assignment updates the lead for
// real. Email/SMS rules are logged as skipped rather than silently doing
// nothing, since no Twilio/SendGrid account exists yet.
//
// Deploy: supabase functions deploy fire-automation --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GRAPH_VERSION = "v21.0";

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getWaCredentials(sb: SupabaseClient): Promise<{ token: string; phoneId: string }> {
  const { data } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  return { token: row("wa_access_token"), phoneId: row("wa_phone_number_id") };
}

async function sendWhatsAppText(token: string, phoneId: string, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function logComm(sb: SupabaseClient, leadId: string, body: string): Promise<void> {
  await sb.from("communications").insert({
    lead_id: leadId, type: "whatsapp", direction: "outbound", body, created_at: new Date().toISOString(),
  });
}

function renderTemplate(template: string, lead: any): string {
  return template
    .replace(/\{\{name\}\}/g, lead.full_name ?? "")
    .replace(/\{\{phone\}\}/g, lead.phone ?? "")
    .replace(/\{\{status\}\}/g, lead.status ?? "");
}

// Only supports simple "column = value" equality (matches the placeholder text
// already in the CRM's rule form, e.g. "status = converted") — not a full
// expression language. Empty/unparseable filters are treated as "always match".
function conditionMatches(conditionFilter: string | null, lead: any): boolean {
  if (!conditionFilter) return true;
  const parts = conditionFilter.split("=");
  if (parts.length !== 2) return true;
  const key = parts[0].trim();
  const expected = parts[1].trim();
  return String(lead[key] ?? "") === expected;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const { trigger_event, lead_id } = await req.json();
    if (!trigger_event || !lead_id) {
      return new Response(JSON.stringify({ ok: false, error: "trigger_event and lead_id are required" }), { status: 400 });
    }

    const sb = makeSupabase();

    const { data: lead, error: leadError } = await sb.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (leadError || !lead) {
      return new Response(JSON.stringify({ ok: false, error: `lead not found: ${leadError?.message ?? lead_id}` }), { status: 404 });
    }

    const { data: rules, error: rulesError } = await sb
      .from("automation_rules")
      .select("*")
      .eq("trigger_event", trigger_event)
      .eq("is_active", true);
    if (rulesError) throw rulesError;

    const results: Record<string, any> = {};

    for (const rule of rules || []) {
      if (!conditionMatches(rule.condition_filter, lead)) {
        results[rule.id] = { skipped: "condition did not match" };
        continue;
      }

      if (rule.channel === "whatsapp") {
        const { token, phoneId } = await getWaCredentials(sb);
        if (!token || !phoneId) {
          await logComm(sb, lead.id, `[automation "${rule.name}" FAILED: no WhatsApp credentials configured]`);
          results[rule.id] = { ok: false, error: "no WhatsApp credentials" };
          continue;
        }
        const to = (lead.phone ?? "").replace(/^\+/, "");
        const body = renderTemplate(rule.template_body ?? "", lead);
        const sendResult = await sendWhatsAppText(token, phoneId, to, body);
        await logComm(
          sb, lead.id,
          sendResult.ok
            ? `[automation "${rule.name}" sent via WhatsApp]`
            : `[automation "${rule.name}" SEND FAILED: ${sendResult.error}]`,
        );
        results[rule.id] = sendResult;
      } else if (rule.channel === "assign_agent") {
        if (!rule.assign_agent_id) {
          results[rule.id] = { ok: false, error: "no agent configured on this rule" };
          continue;
        }
        const { error: updateError } = await sb.from("leads").update({ assigned_agent_id: rule.assign_agent_id }).eq("id", lead.id);
        await logComm(
          sb, lead.id,
          updateError
            ? `[automation "${rule.name}" FAILED to assign agent: ${updateError.message}]`
            : `[automation "${rule.name}" assigned lead to agent]`,
        );
        results[rule.id] = { ok: !updateError };
      } else {
        // email / sms — no provider configured yet. Logged, not silently dropped.
        await logComm(sb, lead.id, `[automation "${rule.name}" SKIPPED: ${rule.channel} provider not configured]`);
        results[rule.id] = { skipped: `${rule.channel} provider not configured` };
      }
    }

    return new Response(JSON.stringify({ ok: true, rulesMatched: (rules || []).length, results }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
