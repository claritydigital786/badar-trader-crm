// Badar Trader CRM — nudge-agents
// Supabase Edge Function (Deno / TypeScript)
//
// Runs every 5 minutes (see the pg_cron job "nudge-agents-every-5-min" in
// supabase/schema.sql). Repeats the round-robin "new lead assigned" ping to
// whichever agent hasn't acknowledged it yet (leads.agent_acknowledged_at),
// and after 3 unanswered pings (15 minutes) broadcasts the overdue lead to
// the rest of the team so it never falls through silently.
//
// Deploy: supabase functions deploy nudge-agents --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GRAPH_VERSION = "v21.0";

// Kept in sync with AGENT_ROTATION in supabase/functions/whatsapp-webhook/index.ts.
const AGENT_ROTATION = [
  { id: "9bfb2f92-658b-4868-90b9-dd041515d111", name: "Ehsan Wazir", phone: "923342224925" },
  { id: "2bc20292-76bb-467b-a2a1-7bfa0cad4421", name: "Muhammad Hanzala", phone: "923235163874" },
];

const PING_INTERVAL_MINUTES = 5;
const ESCALATE_AFTER_PINGS = 3;

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getWaCredentials(sb: SupabaseClient): Promise<{ token: string; phoneId: string }> {
  const { data } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  return { token: row("wa_access_token"), phoneId: row("wa_phone_number_id") };
}

type SendResult = { ok: boolean; error?: string };

async function callGraphApi(token: string, phoneId: string, payload: unknown): Promise<SendResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${errBody.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function sendAckButton(token: string, phoneId: string, to: string, bodyText: string, leadId: string): Promise<SendResult> {
  return await callGraphApi(token, phoneId, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: [{ type: "reply", reply: { id: `ack_${leadId}`, title: "✅ I've got this" } }] },
    },
  });
}

async function sendText(token: string, phoneId: string, to: string, body: string): Promise<SendResult> {
  return await callGraphApi(token, phoneId, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}

async function logComm(sb: SupabaseClient, leadId: string, body: string): Promise<void> {
  await sb.from("communications").insert({
    lead_id: leadId, type: "whatsapp", direction: "outbound", body, created_at: new Date().toISOString(),
  });
}

Deno.serve(async (): Promise<Response> => {
  const report: Record<string, any> = {};
  try {
    const sb = makeSupabase();
    const { token, phoneId } = await getWaCredentials(sb);
    if (!token || !phoneId) throw new Error("missing wa credentials in settings");

    const cutoff = new Date(Date.now() - PING_INTERVAL_MINUTES * 60_000).toISOString();
    const { data: leads, error } = await sb
      .from("leads")
      .select("id, assigned_agent_id, agent_ping_count, agent_escalated")
      .not("assigned_agent_id", "is", null)
      .is("agent_acknowledged_at", null)
      .lte("agent_last_pinged_at", cutoff);
    if (error) throw error;

    for (const lead of leads || []) {
      const agent = AGENT_ROTATION.find((a) => a.id === lead.assigned_agent_id);
      if (!agent) continue;

      const nextCount = (lead.agent_ping_count ?? 0) + 1;

      if (!lead.agent_escalated && lead.agent_ping_count >= ESCALATE_AFTER_PINGS) {
        // First cycle past the threshold: broadcast to the rest of the team once.
        const others = AGENT_ROTATION.filter((a) => a.id !== agent.id);
        const { data: adminRow } = await sb.from("settings").select("value").eq("key", "admin_whatsapp_number").maybeSingle();
        const adminPhone = adminRow?.value?.trim();
        const targets = [...others.map((a) => a.phone), adminPhone].filter(Boolean) as string[];
        for (const phone of targets) {
          await sendText(
            token, phoneId, phone,
            `🚨 A lead assigned to ${agent.name} has gone unacknowledged for ${PING_INTERVAL_MINUTES * ESCALATE_AFTER_PINGS}+ minutes. Please check the CRM.`,
          );
        }
        await sb.from("leads").update({
          agent_escalated: true, agent_ping_count: nextCount, agent_last_pinged_at: new Date().toISOString(),
        }).eq("id", lead.id);
        await logComm(sb, lead.id, `[escalated to team: ${agent.name} unresponsive after ${lead.agent_ping_count} ping(s)]`);
        report[lead.id] = { escalated: true, targets };
        continue;
      }

      const r = await sendAckButton(
        token, phoneId, agent.phone,
        `⏰ Reminder: a lead in the CRM is still waiting on you.`,
        lead.id,
      );
      if (r.ok) {
        await sb.from("leads").update({
          agent_ping_count: nextCount, agent_last_pinged_at: new Date().toISOString(),
        }).eq("id", lead.id);
        await logComm(sb, lead.id, `[reminder #${nextCount} sent to ${agent.name}]`);
      }
      report[lead.id] = { ok: r.ok, error: r.error };
    }

    return new Response(JSON.stringify({ ok: true, count: (leads || []).length, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, report, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
