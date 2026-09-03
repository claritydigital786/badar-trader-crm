// Converted leads -> private Google Sheet, via a Google Apps Script Web App.
// Server side only.
//
// TRANSPORT CHANGED 2026-09-06. The direct Google service-account route
// (Sheets API + Drive API, JWT-signed as the service account) was abandoned
// after conclusive testing: correct service-account identity, correct live
// key, correct Spreadsheet ID, both Sheets and Drive APIs enabled, two
// separate spreadsheets shared directly as Editor - Drive files.get and Sheets
// spreadsheets.get both still returned 404 for every file tested, from this
// function AND from an identical local script run outside Supabase entirely.
// That ruled out Supabase/runtime configuration and pointed at an org-level
// Google Workspace/Cloud restriction on sharing to this service account, which
// is not something this repo can fix. Rather than keep debugging Google
// Workspace policy, the write now happens through a Web App that runs as
// Muhammad's own Google account (Execute as: Me), so no external grant is
// involved in reading or writing the sheet at all.
//
// The old direct-API implementation (RS256 JWT signing, Sheets values.get/put,
// A1-range construction) is not kept in this file - it added ~150 lines nobody
// can execute any more. It is intact in git history at commit 9559ba4 if the
// Workspace restriction is ever lifted and this needs to revert.
//
// The old GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL /
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY secrets are left configured in the project
// and simply unused - nothing in this file reads them.
//
// Nothing about Google exists in the browser: the webhook URL, the shared
// secret and the outbound request all live in this Edge Function and never
// leave it. The frontend can ask this function to drain the queue, ping the
// webhook, or run a self-cleaning synthetic test, but it cannot reach Apps
// Script itself and never sees a credential.
//
// This is the sending half of a transactional outbox. The approval transaction
// (approve_deposit_and_convert) enqueues a row and commits; if the webhook is
// down, rate-limiting, or not configured yet, the conversion has already
// succeeded and the row simply stays pending for a later attempt. A sync
// failure can never roll back an approval.
//
// Row identity in the sheet is the lead_id in column B, enforced on the Apps
// Script side (see Code.gs there): it reads that column under a script lock
// and either UPDATEs the matching row or APPENDs a new one, so a retry - or a
// re-approval, or a backfill run - can never produce a second row for the same
// customer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalRequest } from "../_shared/internal_auth.mjs";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

// Old direct-Google-API secrets. Deliberately read but NOT used by the webhook
// transport - kept configured only so a revert to that route needs no secret
// changes. Referenced once (below) purely so an unused-import/unused-var lint
// pass has a reason not to flag them; nothing in this file sends them anywhere.
const _LEGACY_GOOGLE_SECRETS_STILL_CONFIGURED = [
  "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
].every((name) => !!Deno.env.get(name));

// New transport: an Apps Script Web App deployed by Muhammad, "Execute as: Me,
// Who has access: Anyone" - reachability is by URL, so the shared secret below
// IS the access control for it, checked on the Apps Script side before it
// reads or writes anything.
const WEBHOOK_URL    = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") ?? "";
const WEBHOOK_SECRET = Deno.env.get("CONVERTED_LEADS_SHEET_WEBHOOK_SECRET") ?? "";

const MAX_ATTEMPTS = 6;
const BATCH_SIZE   = 25;

// A lead_id that can never collide with a real lead's UUID, so a synthetic
// connectivity test can never be mistaken for (or clash with) real data, and is
// trivial for an admin to find and delete by eye in the sheet.
const TEST_LEAD_ID_PREFIX = "TEST-SYNTHETIC-";

// CORS. Same shape the project's other browser-facing functions use (see
// conversion-hook), but with the origin pinned rather than "*": this one is
// admin-only, so there is no reason for any other site to be able to read its
// responses. CORS is not the security boundary - verify_jwt plus the role check
// below are - this only lets the CRM's own preflight through.
//
// Why it was needed (found live 2026-09-06): "Sync now" failed with "Failed to
// send a request to the Edge Function" while the function sat ACTIVE and the
// queue stayed at pending=1. supabase-js sends authorization/apikey/
// content-type/x-client-info, so the browser issues an OPTIONS preflight first.
// OPTIONS fell through to the method check and was answered 405 with no
// Access-Control-* headers at all, so the browser never sent the POST and the
// sync code was never reached.
const ALLOWED_ORIGIN = "https://crm.badartrader.com";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

type SheetRow = {
  converted_at: unknown; lead_id: unknown; full_name: unknown; email: unknown; phone: unknown;
  amount: unknown; currency: unknown; agent_name: unknown; assigned_agent_id: unknown;
  approver_name: unknown; approved_at: unknown; wa_channel: unknown; source: unknown; campaign: unknown;
};

// Sends one batch of rows to the Apps Script Web App. The script itself does
// the header/idempotent-upsert work (see Code.gs) - this only transports the
// already-resolved field values and reports back what it did.
async function callWebhook(body: Record<string, unknown>, label: string): Promise<Record<string, unknown>> {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    const err: Error & { notConfigured?: boolean } = new Error("google sheets webhook is not configured");
    err.notConfigured = true;
    throw err;
  }
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: WEBHOOK_SECRET, ...body }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err: Error & { status?: number } = new Error(`${label} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(text); } catch { /* handled below */ }
  if (!parsed) throw new Error(`${label} -> non-JSON response: ${text.slice(0, 300)}`);
  if (parsed.ok === false) throw new Error(`${label} -> ${parsed.error ?? "webhook reported failure"}`);
  return parsed;
}

// Resolves one row's field values from the database at send time. Nothing here
// is taken from a client, and the outbox row itself holds no customer data -
// see converted_lead_sheet_sync's own schema comment.
async function resolveRow(
  admin: ReturnType<typeof createClient>,
  job: { lead_id: string; deposit_document_id: string | null },
): Promise<SheetRow> {
  const { data: lead, error: leadErr } = await admin.from("leads")
    .select("id, full_name, email, phone, converted_at, wa_channel, source, meta_campaign, assigned_agent_id")
    .eq("id", job.lead_id).single();
  if (leadErr || !lead) throw new Error(leadErr?.message ?? "lead not found");

  // Amount Deposited = the approved deposit's ledger row, matched by
  // deposit_document_id. That is the transaction approve_deposit_and_convert
  // inserts, i.e. the amount tied to THIS conversion event - not AUM, not a
  // payroll or commission figure, neither of which is read here at all.
  let amount: unknown = null, currency: unknown = null;
  if (job.deposit_document_id) {
    const { data: txn } = await admin.from("transactions")
      .select("amount, currency").eq("deposit_document_id", job.deposit_document_id).limit(1).maybeSingle();
    if (txn) { amount = txn.amount; currency = txn.currency; }
  }

  // Forwarded By = the lead's canonical owner, resolved server-side.
  let agentName: string | null = null;
  if (lead.assigned_agent_id) {
    const { data: a } = await admin.from("profiles")
      .select("full_name, email").eq("id", lead.assigned_agent_id).maybeSingle();
    agentName = a?.full_name ?? a?.email ?? null;
  }

  // Approved By / Approval Date = the approval record itself.
  let approverName: string | null = null, approvedAt: string | null = null;
  if (job.deposit_document_id) {
    const { data: doc } = await admin.from("kyc_documents")
      .select("reviewed_by, reviewed_at").eq("id", job.deposit_document_id).maybeSingle();
    approvedAt = doc?.reviewed_at ?? null;
    if (doc?.reviewed_by) {
      const { data: p } = await admin.from("profiles")
        .select("full_name, email").eq("id", doc.reviewed_by).maybeSingle();
      approverName = p?.full_name ?? p?.email ?? null;
    }
  }

  return {
    converted_at: lead.converted_at, lead_id: lead.id, full_name: lead.full_name,
    email: lead.email, phone: lead.phone, amount, currency,
    agent_name: agentName, assigned_agent_id: lead.assigned_agent_id,
    approver_name: approverName, approved_at: approvedAt,
    wa_channel: lead.wa_channel, source: lead.source, campaign: lead.meta_campaign,
  };
}

Deno.serve(async (req) => {
  // Preflight is answered before ANY authentication or business logic, because a
  // preflight legitimately carries no credentials - the browser has not sent the
  // real request yet. Nothing is authorised here; the POST below still has to
  // pass verify_jwt and the admin role check.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Two callers are allowed, and neither is anonymous:
  //   * a server-to-server caller with the internal secret (scheduler/ops)
  //   * a signed-in ADMIN or SUPER ADMIN, checked server-side against profiles,
  //     so the CRM can nudge the queue right after an approval without holding
  //     any Google credential. An agent's token fails this check.
  // This gate is unchanged by the transport switch and covers every action
  // below (sync, ping, test) identically - there is no lower-trust action.
  const internal = verifyInternalRequest(req, INTERNAL_FUNCTION_SECRET);
  let authorized = internal.authorized;
  if (!authorized) {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await admin.from("profiles")
      .select("role").eq("id", userRes.user.id).single();
    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return json({ error: "forbidden" }, 403);
    }
    authorized = true;
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is the default "drain the queue" call */ }
  const action = typeof body.action === "string" ? body.action : "sync";

  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    // Not an error: the integration simply is not configured yet. Rows stay
    // queued and nothing is lost.
    return json({ ok: false, configured: false,
                  reason: "google sheets webhook is not configured" }, 200);
  }

  // ── action: ping ────────────────────────────────────────────
  // Pure connectivity + secret check. Touches no database table, sends no
  // spreadsheet row. Lets an admin prove the Apps Script deployment and the
  // shared secret are correct before anything real is sent.
  if (action === "ping") {
    try {
      const res = await callWebhook({ action: "ping" }, "ping");
      return json({ ok: true, configured: true, action: "ping", webhook: res });
    } catch (e) {
      return json({ ok: false, configured: true, action: "ping",
                    error: String((e as Error).message).slice(0, 400) }, 200);
    }
  }

  // ── action: test ────────────────────────────────────────────
  // A self-contained, self-identifying synthetic round-trip: append, then
  // update the SAME lead_id with one changed field to prove idempotency, all
  // under a lead_id that can never be a real lead's UUID. Never touches
  // converted_lead_sheet_sync. The admin still has to open the actual sheet to
  // see the row and delete it - this function cannot see a Google Sheet's
  // rendered contents, only what Apps Script reports back.
  if (action === "test") {
    const testId = TEST_LEAD_ID_PREFIX + crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const appendRes = await callWebhook({
        action: "sync",
        rows: [{
          converted_at: now, lead_id: testId, full_name: "SYNTHETIC TEST - safe to delete",
          email: "synthetic-test@example.invalid", phone: "+10000000000",
          amount: "1", currency: "USD", agent_name: "Diagnostic run", assigned_agent_id: testId,
          approver_name: "Diagnostic run", approved_at: now, wa_channel: "test", source: "synthetic-test",
          campaign: "sync-converted-leads-sheet self-test",
        }],
      }, "synthetic append");

      const updateRes = await callWebhook({
        action: "sync",
        rows: [{
          converted_at: now, lead_id: testId, full_name: "SYNTHETIC TEST - safe to delete",
          email: "synthetic-test@example.invalid", phone: "+10000000000",
          amount: "2", currency: "USD", agent_name: "Diagnostic run", assigned_agent_id: testId,
          approver_name: "Diagnostic run", approved_at: now, wa_channel: "test", source: "synthetic-test",
          campaign: "sync-converted-leads-sheet self-test (amount changed 1 -> 2)",
        }],
      }, "synthetic update");

      return json({
        ok: true, configured: true, action: "test", test_lead_id: testId,
        append: appendRes, update: updateRes,
        // updateRes.appended should be 0 and updateRes.updated should be 1 for
        // this to prove idempotency - the caller (admin panel) shows this plainly.
        idempotent: updateRes.appended === 0 && updateRes.updated === 1,
        next_step: "Open the sheet, confirm exactly one row for this Lead ID with amount=2, then delete that row.",
      });
    } catch (e) {
      return json({ ok: false, configured: true, action: "test", test_lead_id: testId,
                    error: String((e as Error).message).slice(0, 400) }, 200);
    }
  }

  if (action !== "sync") return json({ error: `unknown action "${action}"` }, 400);

  // ── action: sync (default) - drain the outbox ──────────────
  const { data: due, error: dueErr } = await admin
    .from("converted_lead_sheet_sync")
    .select("id, lead_id, deposit_document_id, attempt_count")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (dueErr) return json({ error: dueErr.message }, 500);
  if (!due?.length) return json({ ok: true, configured: true, processed: 0 });

  // Mark the whole batch processing up front, exactly as the per-row version
  // did before sending - prevents an overlapping run from picking the same rows.
  await admin.from("converted_lead_sheet_sync")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .in("id", due.map((j) => j.id));

  let rows: SheetRow[];
  try {
    rows = await Promise.all(due.map((job) => resolveRow(admin, job)));
  } catch (e) {
    // A row failed to resolve from the database (not a Google/webhook problem).
    // Back the whole batch off together, same posture as a transport failure.
    const msg = String((e as Error).message).slice(0, 400);
    for (const job of due) await backoff(admin, job, msg);
    return json({ ok: false, configured: true, error: msg }, 200);
  }

  try {
    const res = await callWebhook({ action: "sync", rows }, "sheet sync");
    const now = new Date().toISOString();
    for (const job of due) {
      await admin.from("converted_lead_sheet_sync").update({
        status: "synced", synced_at: now,
        attempt_count: (job.attempt_count ?? 0) + 1, last_error: null,
        updated_at: now,
      }).eq("id", job.id);
    }
    return json({ ok: true, configured: true, processed: due.length,
                  synced: due.length, failed: 0, webhook: res });
  } catch (e) {
    // The webhook call is one HTTP request for the whole batch, so a failure -
    // Apps Script down, wrong secret, quota, timeout - applies to all of it.
    // Every due row backs off together rather than burning an attempt each in
    // a way that could desynchronise their retry schedules.
    const msg = String((e as Error).message).slice(0, 400);
    for (const job of due) await backoff(admin, job, msg);
    return json({ ok: false, configured: true, processed: due.length,
                  synced: 0, failed: due.length, error: msg }, 200);
  }
});

// Bounded exponential backoff: 1, 2, 4, 8, 16, 32 minutes, then the row stops
// being picked up (attempt_count >= MAX_ATTEMPTS) and waits for an admin retry.
// Google is never hammered.
async function backoff(admin: ReturnType<typeof createClient>, job: { id: string; attempt_count: number }, message: string) {
  const attempts = (job.attempt_count ?? 0) + 1;
  const delayMs = Math.min(2 ** attempts, 32) * 60_000;
  await admin.from("converted_lead_sheet_sync").update({
    status: "failed", attempt_count: attempts, last_error: message,
    next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
}
