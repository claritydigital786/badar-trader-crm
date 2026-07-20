// Badar Trader CRM — nudge-agents
// Supabase Edge Function (Deno / TypeScript)
//
// Runs every 15 minutes, 9:00am-6:00pm PKT only (see the pg_cron jobs
// "nudge-agents-every-15-min-business-hours" and "nudge-agents-6pm-pkt-close"
// in supabase/schema.sql). Repeats the round-robin "new lead assigned" ping
// to whichever agent hasn't acknowledged it yet (leads.agent_acknowledged_at),
// and after 3 unanswered pings (45 minutes) broadcasts the overdue lead to
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

const PING_INTERVAL_MINUTES = 15;
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
    // or() re-includes leads whose agent_last_pinged_at is NULL (assignment
    // notify failed before ever stamping it) — .lte() alone drops NULLs and
    // those leads were never reminded at all.
    const { data: leads, error } = await sb
      .from("leads")
      .select("id, full_name, phone, assigned_agent_id, agent_ping_count, agent_escalated")
      .not("assigned_agent_id", "is", null)
      .is("agent_acknowledged_at", null)
      .or(`agent_last_pinged_at.is.null,agent_last_pinged_at.lte.${cutoff}`);
    if (error) throw error;

    // ONE message per agent per run, whatever the lead count. The old
    // per-lead loop sent N identical "a lead is still waiting" texts when an
    // agent had N waiting leads — Badar read that as duplicate spam
    // (2026-07-14, Hanzala's screenshots) and the whole cron got unscheduled.
    const byAgent = new Map<string, { agent: typeof AGENT_ROTATION[number]; leads: any[] }>();
    for (const lead of leads || []) {
      const agent = AGENT_ROTATION.find((a) => a.id === lead.assigned_agent_id);
      if (!agent) continue;
      if (!byAgent.has(agent.id)) byAgent.set(agent.id, { agent, leads: [] });
      byAgent.get(agent.id)!.leads.push(lead);
    }

    for (const { agent, leads: agentLeads } of byAgent.values()) {
      const now = new Date().toISOString();
      const leadLabel = (l: any) => l.full_name && l.full_name !== l.phone ? `${l.full_name} (${l.phone})` : l.phone;

      const toEscalate = agentLeads.filter((l) => !l.agent_escalated && (l.agent_ping_count ?? 0) >= ESCALATE_AFTER_PINGS);
      if (toEscalate.length) {
        // First cycle past the threshold: broadcast the overdue leads to the
        // rest of the team once — one combined message per recipient, and
        // targets deduped so admin_whatsapp_number matching an agent's own
        // number can't double-send.
        const others = AGENT_ROTATION.filter((a) => a.id !== agent.id);
        const { data: adminRow } = await sb.from("settings").select("value").eq("key", "admin_whatsapp_number").maybeSingle();
        const adminPhone = adminRow?.value?.trim();
        const targets = [...new Set([...others.map((a) => a.phone), adminPhone].filter(Boolean))] as string[];
        const listText = toEscalate.map(leadLabel).join(", ");
        for (const phone of targets) {
          await sendText(
            token, phoneId, phone,
            `🚨 ${toEscalate.length === 1 ? "A lead" : `${toEscalate.length} leads`} assigned to ${agent.name} ${toEscalate.length === 1 ? "has" : "have"} gone unacknowledged for ${PING_INTERVAL_MINUTES * ESCALATE_AFTER_PINGS}+ minutes: ${listText}. Please check the CRM.`,
          );
        }
        for (const l of toEscalate) {
          await sb.from("leads").update({
            agent_escalated: true, agent_ping_count: (l.agent_ping_count ?? 0) + 1, agent_last_pinged_at: now,
          }).eq("id", l.id);
          await logComm(sb, l.id, `[escalated to team: ${agent.name} unresponsive after ${l.agent_ping_count} ping(s)]`);
          report[l.id] = { escalated: true, targets };
        }
      }

      const toRemind = agentLeads.filter((l) => !toEscalate.includes(l));
      if (!toRemind.length) continue;
      const names = toRemind.map(leadLabel).join(", ");
      const bodyText = toRemind.length === 1
        ? `⏰ Reminder: a lead in the CRM is still waiting on you: ${names}.`
        : `⏰ Reminder: ${toRemind.length} leads in the CRM are still waiting on you: ${names}. Tap below to acknowledge the oldest — the CRM has the rest.`;
      // The single ack button acknowledges the oldest lead; the next run
      // re-lists whatever is still waiting (WhatsApp allows max 3 buttons,
      // so one-summary-message + one-button is the spam-proof shape).
      const r = await sendAckButton(token, phoneId, agent.phone, bodyText, toRemind[0].id);
      if (r.ok) {
        for (const l of toRemind) {
          await sb.from("leads").update({
            agent_ping_count: (l.agent_ping_count ?? 0) + 1, agent_last_pinged_at: now,
          }).eq("id", l.id);
          await logComm(sb, l.id, `[reminder #${(l.agent_ping_count ?? 0) + 1} sent to ${agent.name} (batched, ${toRemind.length} lead(s) in one message)]`);
        }
      }
      report[agent.id] = { ok: r.ok, error: r.error, reminded: toRemind.length };
    }

    return new Response(JSON.stringify({ ok: true, count: (leads || []).length, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, report, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
