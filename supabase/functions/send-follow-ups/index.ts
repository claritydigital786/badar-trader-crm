// Badar Trader CRM - send-follow-ups
// Supabase Edge Function (Deno / TypeScript)
//
// Runs on a schedule (pg_cron, every 30 minutes 9am-6pm PKT - see
// supabase/schema.sql Phase 24) and turns follow_up_sequences rules into
// real WhatsApp messages: "when a lead has sat in status X for N+ hours,
// send this." Mirrors nudge-agents' cron/no-JWT shape and getWaCredentials'
// env-first, settings-fallback lookup.
//
// Deploy: supabase functions deploy send-follow-ups --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalRequest } from "../_shared/internal_auth.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const GRAPH_VERSION = "v21.0";

// OFF by default, on purpose. Before ever setting this true: confirm
// WhatChimp isn't also messaging the same leads (the exact double-reply
// risk BOT_REPLIES_ENABLED / KEYWORD_REPLIES_ENABLED exist to avoid in
// whatsapp-webhook), and that Meta's 24h customer-service window won't
// reject sends to leads silent that long - failures land in
// follow_up_sends.status = 'failed' either way, they just won't be retried.
const FOLLOW_UPS_ENABLED = false;

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getWaCredentials(sb: SupabaseClient): Promise<{ token: string; phoneId: string }> {
  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID };
  }
  const { data } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  return { token: WHATSAPP_ACCESS_TOKEN || row("wa_access_token"), phoneId: WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id") };
}

function renderMessage(template: string, lead: { full_name?: string | null }): string {
  const name = (lead.full_name || "there").trim() || "there";
  return template.replace(/\{\{\s*name\s*\}\}/gi, name);
}

async function sendWhatsAppText(token: string, phoneId: string, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const auth = verifyInternalRequest(req, INTERNAL_FUNCTION_SECRET);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ ok: false, error: auth.reason }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!FOLLOW_UPS_ENABLED) {
    return new Response(JSON.stringify({ ok: true, enabled: false, message: "FOLLOW_UPS_ENABLED is false, no-op" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const report: Record<string, any> = {};
  try {
    const sb = makeSupabase();
    const { token, phoneId } = await getWaCredentials(sb);
    if (!token || !phoneId) throw new Error("missing wa credentials in settings");

    const { data: sequences, error: seqError } = await sb
      .from("follow_up_sequences")
      .select("id, name, trigger_status, delay_hours, message")
      .eq("is_active", true);
    if (seqError) throw seqError;

    let attempted = 0;
    for (const seq of sequences || []) {
      const cutoff = new Date(Date.now() - seq.delay_hours * 60 * 60 * 1000).toISOString();

      // Leads that already have a follow_up_sends row for this sequence
      // (sent OR failed) are never retried - see the migration comment for
      // why a failed send should not be hammered every 30 minutes forever.
      const { data: already, error: alreadyError } = await sb
        .from("follow_up_sends")
        .select("lead_id")
        .eq("sequence_id", seq.id);
      if (alreadyError) throw alreadyError;
      const doneLeadIds = new Set((already || []).map((r: any) => r.lead_id));

      const { data: leads, error: leadsError } = await sb
        .from("leads")
        .select("id, full_name, phone, needs_human, status_changed_at")
        .eq("status", seq.trigger_status)
        .lte("status_changed_at", cutoff);
      if (leadsError) throw leadsError;

      const targets = (leads || []).filter((l: any) => !doneLeadIds.has(l.id) && !l.needs_human);
      report[seq.id] = { name: seq.name, trigger_status: seq.trigger_status, candidates: (leads || []).length, targets: targets.length };

      for (const lead of targets) {
        attempted++;
        const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
        if (!phoneDigits) {
          await sb.from("follow_up_sends").insert({ lead_id: lead.id, sequence_id: seq.id, status: "failed", error: "Lead has no phone number" });
          continue;
        }

        const body = renderMessage(seq.message, lead);
        const result = await sendWhatsAppText(token, phoneId, phoneDigits, body);

        await sb.from("follow_up_sends").insert({
          lead_id: lead.id,
          sequence_id: seq.id,
          status: result.ok ? "sent" : "failed",
          error: result.ok ? null : result.error,
        });

        if (result.ok) {
          await sb.from("communications").insert({
            lead_id: lead.id,
            type: "whatsapp",
            direction: "outbound",
            body,
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, enabled: true, attempted, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, enabled: true, report, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
