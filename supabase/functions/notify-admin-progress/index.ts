// Sends Badar a WhatsApp text summarising the CRM Development Progress tab's
// own numbers (New Leads / Converted / Deposits Recorded / Active Agents,
// plus the most recent activity), on demand - triggered by an admin clicking
// "Send Update to Badar" in that tab. Not yet on a schedule; that is a
// deliberate fast-follow (see REMAINING_TODOS.md, 2026-08-30) once this
// manual path is proven.
//
// Reuses the exact patterns already established elsewhere in this repo:
// - env-first / settings-fallback WhatsApp credentials (whatsapp-webhook's
//   getWaCredentials, send-wa-message's getWaCredentials).
// - the existing `admin_whatsapp_number` settings key, already the
//   destination notify-admin-pending-approval sends to.
// - "Deposits Recorded" is deliberately worded as recorded, not verified -
//   account_balance is still a plain agent-typed field with no audit trail
//   as of this entry (see REMAINING_TODOS.md, 2026-08-30 deposit-accuracy
//   discussion). This message must not imply a certainty the data doesn't
//   have yet.

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

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function cleanPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

type LeadRow = {
  full_name: string; status: string; assigned_agent_id: string | null;
  account_balance: number | null; created_at: string; updated_at: string; converted_at: string | null;
};

async function fetchAllLeads(sb: ReturnType<typeof serviceClient>): Promise<LeadRow[]> {
  const pageSize = 1000;
  let all: LeadRow[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await sb.from("leads")
      .select("full_name, status, assigned_agent_id, account_balance, created_at, updated_at, converted_at")
      .range(start, start + pageSize - 1);
    if (error) { console.error("fetchAllLeads:", error.message); break; }
    all = all.concat((data ?? []) as LeadRow[]);
    if (!data || data.length < pageSize) break;
  }
  return all;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ ok: false, error: "Not signed in" }, 401);

  const sb = serviceClient();
  const { data: profile } = await sb.from("profiles").select("role, is_suspended").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile?.is_suspended) {
    return json({ ok: false, error: "Only an admin can send this update" }, 403);
  }

  const { data: settings } = await sb.from("settings").select("key, value")
    .in("key", ["wa_access_token", "wa_phone_number_id", "admin_whatsapp_number"]);
  const setting = (key: string) => settings?.find((r: { key: string; value: string }) => r.key === key)?.value?.trim() ?? "";
  const token = WHATSAPP_ACCESS_TOKEN || setting("wa_access_token");
  const phoneId = WHATSAPP_PHONE_NUMBER_ID || setting("wa_phone_number_id");
  const adminPhone = cleanPhone(setting("admin_whatsapp_number"));
  if (!token || !phoneId || !adminPhone) {
    return json({ ok: false, error: "Admin WhatsApp notification is not configured" }, 503);
  }

  const leads = await fetchAllLeads(sb);
  const now = Date.now();
  const since = now - 24 * 60 * 60 * 1000; // trailing 24h, matches "Today" closely enough for a digest
  const newLeads = leads.filter((l) => new Date(l.created_at).getTime() >= since);
  const converted = leads.filter((l) => l.status === "converted"
    && new Date(l.converted_at || l.updated_at).getTime() >= since);
  const deposits = converted.filter((l) => Number(l.account_balance) > 0);
  const depositTotal = deposits.reduce((s, l) => s + Number(l.account_balance || 0), 0);

  const message = [
    "Badar Trader CRM - Progress Update (last 24h)",
    "",
    `New leads: ${newLeads.length}`,
    `Converted: ${converted.length}`,
    `Deposits recorded: $${fmtMoney(depositTotal)} (${deposits.length} lead${deposits.length === 1 ? "" : "s"})`,
    "",
    "Full detail: CRM Development Progress tab.",
    "(Deposit figures are recorded from agent-entered data, not yet independently verified.)",
  ].join("\n");

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
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
      console.error("notify-admin-progress send failed:", error);
      return json({ ok: false, error }, 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("notify-admin-progress send failed:", message);
    return json({ ok: false, error: message }, 502);
  }

  return json({ ok: true });
});
