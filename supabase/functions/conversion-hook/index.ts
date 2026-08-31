// Badar Trader CRM - Conversion Hook (deposit-into-own-account model)
// Called by the deposit-confirmation form / thank-you page on load.
//
// 2026-08-31, Muhammad: this used to write status='converted' with
// verified=false, i.e. it declared a conversion purely because a customer
// filled in a form, before anyone had checked the broker IB portal. Converted
// is a VERIFIED business outcome, not a claim, so this now records the
// submission and parks the lead at 'pending_approval' - it shows in the Inbox
// under Qualified, and an admin turns it into a real conversion through
// approveConversion(), which demands a deposit screenshot on file.
//
// Everything the form reports is still captured (platform, amount, broker
// account ref, account_balance) so the admin has the evidence in front of
// them; only the claim that this IS a conversion is withheld. converted_at is
// deliberately NOT stamped here - it means "when this genuinely converted",
// and approveConversion() is what stamps it.
//
// 2026-08-31 (Phase 39): two things this hook was missing.
//   1. It never told anyone. A lead landing in Pending Approval from the form
//      sat there until an admin happened to look. It now fires the EXISTING
//      notify-admin-pending-approval function over the repo's internal
//      server-to-server path - the same alert an agent triggers from the Inbox,
//      not a second parallel notifier.
//   2. It processed the same submission repeatedly. join.html calls this hook
//      and then redirects to thankyou.html, which calls it AGAIN on load, and
//      again on every refresh. Each call rewrote the lead and added another
//      activity line for one real deposit. Submissions are now claimed once by
//      content hash in the database (see migration 20260831050000), so the
//      state change, the activity line and the alert happen exactly once, while
//      a genuinely different claim still goes through.
//
// Query params: lead_id (UUID) OR phone ; name ; platform ; amount ; account (broker acct ref)
//
// If neither lead_id nor a matching phone is found, a new lead is created instead
// of failing - this used to silently 404, and join.html silently swallowed that
// error and redirected to thankyou.html regardless, so anyone reaching this form
// without an existing lead (e.g. a direct link, not via the WhatsApp bot) had
// their submission dropped with no record anywhere. A missing lead_id specifically
// (as opposed to a missing phone match) still 404s - that means a stale/wrong ID
// was passed, which is a different, real error worth surfacing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { INTERNAL_SECRET_HEADER } from "../_shared/internal_auth.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };

function norm(p: string): string { p = (p || "").trim(); if (!p) return ""; return p.startsWith("+") ? p : "+" + p; }
const PLATFORMS = ["exness", "dooprime", "course_only", "other"];

// Canonical identity of one deposit claim. Deterministic and content-based, so
// the same claim always hashes to the same key no matter which Edge Function
// instance handles it - an in-memory cooldown cannot work here because the
// runtime is stateless and may cold start on every request.
//
// Normalisation matters as much as the hash: the amount is fixed to 2 decimal
// places so "500" and "500.00" are one claim rather than two, and the account
// ref is lowercased and trimmed so casing does not split a claim in half. The
// "v1" prefix lets the key format change later without silently colliding with
// keys already stored.
async function submissionKey(
  leadRowId: string,
  platform: string,
  amount: number,
  acct: string,
): Promise<string> {
  const canonical = [
    "v1",
    leadRowId,
    platform,
    (Number.isFinite(amount) ? amount : 0).toFixed(2),
    acct.trim().toLowerCase(),
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Reuse the ONE existing admin alert mechanism rather than adding a second one.
// notify-admin-pending-approval already owns the recipient, the copy, the
// WhatsApp credentials and its own pending_approval_notifications ledger keyed
// (lead_id, status_changed_at). It was built for a signed-in agent in the
// browser, so it authenticates a user JWT; this hook is a public endpoint with
// no user, and calls it over the repo's existing server-to-server path instead
// (x-internal-function-secret, the same shared helper nudge-agents,
// fire-automation and send-follow-ups use).
//
// Deliberately fire-and-report, never fire-and-fail: the customer's submission
// is already safely recorded by this point, so a WhatsApp outage must not turn
// their confirmation into an error page. A failure is logged for the admin to
// pick up from the Pending Approval list, which is the fallback that existed
// before any notification did.
async function notifyAdminPendingApproval(leadRowId: string): Promise<string> {
  if (!INTERNAL_FUNCTION_SECRET) {
    console.error("pending-approval notify skipped: INTERNAL_FUNCTION_SECRET is not configured");
    return "not_configured";
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-admin-pending-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE}`,
        [INTERNAL_SECRET_HEADER]: INTERNAL_FUNCTION_SECRET,
      },
      body: JSON.stringify({ lead_id: leadRowId, source: "conversion-hook" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      console.error("pending-approval notify failed:", body?.error || `HTTP ${res.status}`);
      return "failed";
    }
    return body?.already_notified ? "already_notified" : "sent";
  } catch (e) {
    console.error("pending-approval notify failed:", String(e));
    return "failed";
  }
}

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
      // A specific lead_id was passed but doesn't exist - that's a real error
      // (stale link / wrong ID), not a "first contact" case.
      return new Response(JSON.stringify({ ok: false, error: "lead not found" }), { status: 404, headers: CORS });
    } else {
      // No lead_id given and no existing lead matches this phone - create one
      // instead of dropping the submission.
      const { data: created, error: ce } = await sb
        .from("leads")
        .insert({ full_name: name || "Unknown", phone, source: "website", status: "new" })
        .select("id")
        .single();
      if (ce) throw new Error(`lead creation failed: ${ce.message}`);
      leadRowId = created.id;
    }

    // ---- Idempotency gate -------------------------------------------------
    // Everything below this point is a side effect that must happen exactly
    // once per real claim: the state transition, the activity line, and the
    // admin alert. The claim is won atomically in the database (primary key
    // conflict inside a single statement), so two concurrent requests for the
    // same claim cannot both pass, and a cold start cannot forget that the
    // claim was already handled.
    const key = await submissionKey(leadRowId, platform, amount, acct);
    const { data: isFirst, error: claimErr } = await sb.rpc("claim_deposit_submission", {
      p_submission_key: key,
      p_lead_id: leadRowId,
      p_platform: platform,
      p_amount: amount,
      p_account_ref: acct || null,
    });
    if (claimErr) throw new Error(`idempotency claim failed: ${claimErr.message}`);

    if (isFirst !== true) {
      // A replay: thankyou.html re-firing after the redirect, or the customer
      // refreshing it. The submission is already recorded, so this is a success
      // for the caller and a no-op for the CRM. No second activity line, no
      // second transition, no second alert.
      return new Response(JSON.stringify({
        ok: true, lead_id: leadRowId, platform, amount,
        verified: false, status: "pending_approval", duplicate: true,
      }), { headers: CORS });
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: "pending_approval",
      verified: false,
      deposit_platform: platform,
      deposit_amount: amount,
      account_balance: amount,
      updated_at: nowIso,
    };
    // Only write the broker account ref when this submission actually carried
    // one. Writing `acct || null` unconditionally is what let the second call
    // of a single submission erase the reference the first call had just saved,
    // because the redirect did not forward `account`. Both pages now forward it,
    // and this makes the erasure impossible even if some other caller does not.
    if (acct) update.deposit_account_ref = acct;
    const { error: ue } = await sb.from("leads").update(update).eq("id", leadRowId);
    if (ue) {
      // The claim was won but the work did not land. Hand the key back so the
      // customer's retry is treated as a first submission rather than a replay,
      // otherwise this claim could never be recorded at all.
      await sb.rpc("release_deposit_submission", { p_submission_key: key }).then(() => {}, () => {});
      throw new Error(ue.message);
    }

    // communication_logs, not communications - the latter's type check only
    // allows email/whatsapp/call/sms, not 'note'. This insert was silently
    // failing on every single call before (constraint violation swallowed by
    // the old .then(()=>{},()=>{}) - confirmed by reproducing it directly).
    const { error: logErr } = await sb.from("communication_logs").insert({
      lead_id: leadRowId,
      type: "note",
      message: `Deposit confirmation submitted - ${platform} $${amount}${acct ? ", acct " + acct : ""} (awaiting admin approval and IB-portal verification)`,
      created_by: null,
    });
    if (logErr) console.error("communication_logs insert failed:", logErr.message);

    // Only now, on a first accepted submission that actually landed. An invalid
    // or rejected submission returned long before this line, so a rejection can
    // never alert anyone, and a replay returned at the idempotency gate above.
    const notified = await notifyAdminPendingApproval(leadRowId);

    return new Response(JSON.stringify({ ok: true, lead_id: leadRowId, platform, amount, verified: false, status: "pending_approval", duplicate: false, notified }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
