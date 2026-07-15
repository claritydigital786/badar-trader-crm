// Badar Trader CRM — Conversion Hook (deposit-into-own-account model)
// Called by the deposit-confirmation form / thank-you page on load. Marks the lead
// converted but UNVERIFIED (verified=false) — agents flip verified=true after
// checking the broker IB portal. Stores platform, amount, broker account ref, and
// stamps revenue (leads.account_balance, summed for Dashboard Total Revenue).
//
// Query params: lead_id (UUID) OR phone ; platform ; amount ; account (broker acct ref)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };

function norm(p: string): string { p = (p || "").trim(); if (!p) return ""; return p.startsWith("+") ? p : "+" + p; }
const PLATFORMS = ["exness", "dooprime", "course_only", "other"];

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const q = new URL(req.url).searchParams;
    const leadId = (q.get("lead_id") || "").trim();
    const phone = norm(q.get("phone") || "");
    let platform = (q.get("platform") || "other").trim().toLowerCase();
    if (!PLATFORMS.includes(platform)) platform = "other";
    const amount = Number(q.get("amount") || "0") || 0;
    const acct = (q.get("account") || "").trim().slice(0, 60);
    if (!leadId && !phone) return new Response(JSON.stringify({ ok: false, error: "lead_id or phone required" }), { status: 400, headers: CORS });

    const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    let sel = sb.from("leads").select("id").limit(1);
    sel = leadId ? sel.eq("id", leadId) : sel.eq("phone", phone);
    const { data: lead, error: le } = await sel.maybeSingle();
    if (le) throw new Error(le.message);
    if (!lead) return new Response(JSON.stringify({ ok: false, error: "lead not found" }), { status: 404, headers: CORS });

    const nowIso = new Date().toISOString();
    const { error: ue } = await sb.from("leads").update({
      status: "converted",
      verified: false,
      deposit_platform: platform,
      deposit_amount: amount,
      deposit_account_ref: acct || null,
      account_balance: amount,
      converted_at: nowIso,
      updated_at: nowIso,
    }).eq("id", lead.id);
    if (ue) throw new Error(ue.message);

    await sb.from("communications").insert({ lead_id: lead.id, type: "note", direction: "inbound", body: `Deposit confirmation submitted — ${platform} $${amount}${acct ? ", acct " + acct : ""} (pending IB-portal verification)`, created_at: nowIso }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, lead_id: lead.id, platform, amount, verified: false }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
