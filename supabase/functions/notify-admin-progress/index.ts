// Sends Badar a WhatsApp text summarising the CRM Development Progress tab's
// own curated content (recently completed / in progress / upcoming), on
// demand - triggered by an admin clicking "Send Update to Badar" in that tab.
// Not yet on a schedule; that is a deliberate fast-follow (see
// REMAINING_TODOS.md, 2026-08-30) once this manual path is proven.
//
// Re-scoped 2026-08-30: this originally summarised lead/conversion/deposit
// numbers, which was the WRONG content - Muhammad clarified he wants a
// build/changelog view (what's been built, what's underway, what's still
// open), not a sales dashboard. The browser is the single source of truth
// for that curated list (CRM_DEV_PROGRESS in index.html) and passes it in
// the request body; this function only formats it and holds the WhatsApp
// credentials, which never reach the browser.
//
// Reuses the exact patterns already established elsewhere in this repo:
// - env-first / settings-fallback WhatsApp credentials (whatsapp-webhook's
//   getWaCredentials, send-wa-message's getWaCredentials).
// - the existing `admin_whatsapp_number` settings key, already the
//   destination notify-admin-pending-approval sends to.

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

// WhatsApp text messages cap at 4096 chars; kept well under that so a large
// curated list can never silently fail to send.
const MAX_ITEMS_PER_SECTION = 12;
const MAX_ITEM_LENGTH = 280;

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

type ProgressItem = { date?: string; text: string };

function sanitizeItems(raw: unknown): ProgressItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProgressItem[] = [];
  for (const item of raw.slice(0, MAX_ITEMS_PER_SECTION)) {
    if (item && typeof item === "object" && typeof (item as ProgressItem).text === "string") {
      const text = (item as ProgressItem).text.slice(0, MAX_ITEM_LENGTH).trim();
      if (!text) continue;
      const rawDate = (item as ProgressItem).date;
      out.push(typeof rawDate === "string" ? { date: rawDate, text } : { text });
    }
  }
  return out;
}

function formatSection(title: string, items: ProgressItem[]): string {
  if (!items.length) return `${title}\n(nothing right now)`;
  const lines = items.map((item) => `- ${item.date ? `[${item.date}] ` : ""}${item.text}`);
  return `${title}\n${lines.join("\n")}`;
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

  let completed: ProgressItem[] = [];
  let inProgress: ProgressItem[] = [];
  let upcoming: ProgressItem[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const progress = body?.progress ?? {};
    completed = sanitizeItems(progress.completed);
    inProgress = sanitizeItems(progress.inProgress);
    upcoming = sanitizeItems(progress.upcoming);
  } catch {
    return json({ ok: false, error: "Invalid request body" }, 400);
  }
  if (!completed.length && !inProgress.length && !upcoming.length) {
    return json({ ok: false, error: "No progress content was supplied to send" }, 400);
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

  const message = [
    "Badar Trader CRM - Development Progress Update",
    "",
    formatSection("Recently Completed:", completed),
    "",
    formatSection("In Progress:", inProgress),
    "",
    formatSection("Upcoming / Awaiting Decision:", upcoming),
    "",
    "Full detail: CRM Development Progress tab.",
  ].join("\n").slice(0, 4000);

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
