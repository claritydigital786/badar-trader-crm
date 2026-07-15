// Badar Trader CRM — Conversion Hook (deposit-into-own-account model)
// Called by the deposit-confirmation form / thank-you page on load. Marks the lead
// converted but UNVERIFIED (verified=false) — agents flip verified=true after
// checking the broker IB portal. Stores platform, amount, broker account ref, and
// stamps revenue (leads.account_balance, summed for Dashboard Total Revenue).
//
// Query params: lead_id (UUID) OR phone ; name ; platform ; amount ; account (broker acct ref)
//
// If neither lead_id nor a matching phone is found, a new lead is created instead
// of failing — this used to silently 404, and join.html silently swallowed that
// error and redirected to thankyou.html regardless, so anyone reaching this form
// without an existing lead (e.g. a direct link, not via the WhatsApp bot) had
// their submission dropped with no record anywhere. A missing lead_id specifically
// (as opposed to a missing phone match) still 404s — that means a stale/wrong ID
// was passed, which is a different, real error worth surfacing.
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
    const name = (q.get("name") || "").trim();
    const phone = norm(q.get("phone") || "");
    let platform = (q.get("platform") || "other").trim().toLowerCase();
    if (!PLATFORMS.includes(platform)) platform = "other";
    const amount = Number(q.get("amount") || "0") || 0;
    const acct = (q.get("account") || "").trim().slice(0, 60);
    if (!leadId && !phone) return new Response(JSON.stringify({ ok: false, error: "lead_id or phone required" }), { status: 400, headers: CORS });

    const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    let sel = sb.from("leads").select("id").limit(1);
    sel = leadId ? sel.eq("id", leadId) : sel.eq("phone", phone);
    const { data: found, error: le } = await sel.maybeSingle();
    if (le) throw new Error(le.message);

    let leadRowId: string;
    if (found) {
      leadRowId = found.id;
    } else if (leadId) {
      // A specific lead_id was passed but doesn't exist — that's a real error
      // (stale link / wrong ID), not a "first contact" case.
      return new Response(JSON.stringify({ ok: false, error: "lead not found" }), { status: 404, headers: CORS });
    } else {
      // No lead_id given and no existing lead matches this phone — create one
      // instead of dropping the submission.
      const { data: created, error: ce } = await sb
        .from("leads")
        .insert({ full_name: name || "Unknown", phone, source: "website", status: "new" })
        .select("id")
        .single();
      if (ce) throw new Error(`lead creation failed: ${ce.message}`);
      leadRowId = created.id;
    }

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
    }).eq("id", leadRowId);
    if (ue) throw new Error(ue.message);

    // communication_logs, not communications — the latter's type check only
    // allows email/whatsapp/call/sms, not 'note'. This insert was silently
    // failing on every single call before (constraint violation swallowed by
    // the old .then(()=>{},()=>{}) — confirmed by reproducing it directly).
    const { error: logErr } = await sb.from("communication_logs").insert({
      lead_id: leadRowId,
      type: "note",
      message: `Deposit confirmation submitted — ${platform} $${amount}${acct ? ", acct " + acct : ""} (pending IB-portal verification)`,
      created_by: null,
    });
    if (logErr) console.error("communication_logs insert failed:", logErr.message);

    return new Response(JSON.stringify({ ok: true, lead_id: leadRowId, platform, amount, verified: false }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
