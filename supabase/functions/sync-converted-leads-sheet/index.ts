// Converted leads -> private Google Sheet. Server side only.
//
// Nothing about Google exists in the browser: the service-account key, the
// spreadsheet id and the access token all live in Edge secrets and never leave
// this function. The frontend can ask this function to drain the queue, but it
// cannot reach Google itself and never sees a credential.
//
// This is the sending half of a transactional outbox. The approval transaction
// (approve_deposit_and_convert) enqueues a row and commits; if Google is down,
// rate-limiting, or not configured yet, the conversion has already succeeded and
// the row simply stays pending for a later attempt. A sync failure can never
// roll back an approval.
//
// Row identity in the sheet is the lead_id in column B. Before writing, the
// function reads that column and either UPDATEs the matching row or APPENDs a
// new one, so a retry - or a re-approval, or a backfill run - can never produce
// a second row for the same customer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalRequest } from "../_shared/internal_auth.mjs";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

const SHEET_ID       = Deno.env.get("GOOGLE_SHEETS_SPREADSHEET_ID") ?? "";
const SA_EMAIL       = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") ?? "";
const SA_PRIVATE_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ?? "";
const SHEET_TAB      = Deno.env.get("GOOGLE_SHEETS_TAB_NAME") ?? "Converted Leads";

const MAX_ATTEMPTS = 6;
const BATCH_SIZE   = 25;

const HEADER = [
  "Converted At", "Lead ID", "Customer Name", "Email", "Phone Number",
  "Amount Deposited", "Currency", "Forwarded By Agent", "Agent ID",
  "Approved By", "Approval Date", "WhatsApp Channel", "Lead Source", "Campaign",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ── Google service-account auth (RS256 JWT -> access token) ────
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string): Uint8Array {
  // Secrets managers frequently store the key with literal \n; accept both.
  const body = pem.replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
async function googleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(SA_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`)));
  const assertion = `${header}.${payload}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
    }),
  });
  if (!res.ok) throw new Error(`google token: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token as string;
}

const sheetsUrl = (range: string, suffix = "") =>
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}${suffix}`;

async function sheetsFetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    const err: Error & { status?: number } = new Error(`sheets ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Writes the header once. Harmless to re-run: it only writes when row 1 is empty
// or does not already match, so it cannot clobber a sheet someone has customised
// beyond the header.
async function ensureHeader(token: string) {
  const got = await sheetsFetch(token, sheetsUrl(`${SHEET_TAB}!A1:N1`));
  const row: string[] = got.values?.[0] ?? [];
  if (row.length && row[1] === "Lead ID") return;
  await sheetsFetch(token, sheetsUrl(`${SHEET_TAB}!A1:N1`, "?valueInputOption=RAW"), {
    method: "PUT", body: JSON.stringify({ values: [HEADER] }),
  });
}

// lead_id -> 1-based sheet row. Column B is the stable business key; name and
// phone are never used to match, being duplicated and inconsistently formatted.
async function leadRowIndex(token: string): Promise<Map<string, number>> {
  const got = await sheetsFetch(token, sheetsUrl(`${SHEET_TAB}!B:B`));
  const map = new Map<string, number>();
  (got.values ?? []).forEach((r: string[], i: number) => {
    const id = (r?.[0] ?? "").trim();
    if (id && id !== "Lead ID") map.set(id, i + 1);
  });
  return map;
}

function rowFor(r: Record<string, unknown>): string[] {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return [
    s(r.converted_at), s(r.lead_id), s(r.full_name), s(r.email), s(r.phone),
    s(r.amount), s(r.currency), s(r.agent_name), s(r.assigned_agent_id),
    s(r.approver_name), s(r.approved_at), s(r.wa_channel), s(r.source), s(r.campaign),
  ];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Two callers are allowed, and neither is anonymous:
  //   * a server-to-server caller with the internal secret (scheduler/ops)
  //   * a signed-in ADMIN or SUPER ADMIN, checked server-side against profiles,
  //     so the CRM can nudge the queue right after an approval without holding
  //     any Google credential. An agent's token fails this check.
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

  if (!SHEET_ID || !SA_EMAIL || !SA_PRIVATE_KEY) {
    // Not an error: the integration simply is not configured yet. Rows stay
    // queued and nothing is lost.
    return json({ ok: false, configured: false,
                  reason: "google sheets secrets are not configured" }, 200);
  }

  const { data: due, error: dueErr } = await admin
    .from("converted_lead_sheet_sync")
    .select("id, lead_id, deposit_document_id, attempt_count")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (dueErr) return json({ error: dueErr.message }, 500);
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
  if (!due?.length) return json({ ok: true, configured: true, processed: 0, sheet_url: SHEET_URL });

  let token: string;
  try {
    token = await googleAccessToken();
    await ensureHeader(token);
  } catch (e) {
    // Auth or header failure is not per-row: back every due row off together
    // rather than burning an attempt each.
    const msg = String((e as Error).message).slice(0, 400);
    for (const job of due) await backoff(admin, job, msg);
    return json({ ok: false, configured: true, error: msg, sheet_url: SHEET_URL }, 200);
  }

  const index = await leadRowIndex(token);
  let synced = 0, failed = 0;

  for (const job of due) {
    try {
      await admin.from("converted_lead_sheet_sync")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      // Every value is read from the database at send time. Nothing is taken
      // from a client, and the outbox row itself holds no customer data.
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

      const values = [rowFor({
        converted_at: lead.converted_at, lead_id: lead.id, full_name: lead.full_name,
        email: lead.email, phone: lead.phone, amount, currency,
        agent_name: agentName, assigned_agent_id: lead.assigned_agent_id,
        approver_name: approverName, approved_at: approvedAt,
        wa_channel: lead.wa_channel, source: lead.source, campaign: lead.meta_campaign,
      })];

      const existing = index.get(String(lead.id));
      if (existing) {
        await sheetsFetch(token, sheetsUrl(`${SHEET_TAB}!A${existing}:N${existing}`, "?valueInputOption=RAW"),
          { method: "PUT", body: JSON.stringify({ values }) });
      } else {
        const appended = await sheetsFetch(token,
          sheetsUrl(`${SHEET_TAB}!A:N`, "?valueInputOption=RAW&insertDataOption=INSERT_ROWS"),
          { method: "POST", body: JSON.stringify({ values }) });
        // Remember where it landed, so two due rows for the same lead in one
        // batch cannot append twice.
        const m = /![A-Z]+(\d+):/.exec(appended?.updates?.updatedRange ?? "");
        if (m) index.set(String(lead.id), Number(m[1]));
      }

      await admin.from("converted_lead_sheet_sync").update({
        status: "synced", synced_at: new Date().toISOString(),
        attempt_count: (job.attempt_count ?? 0) + 1, last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      synced++;
    } catch (e) {
      await backoff(admin, job, String((e as Error).message).slice(0, 400));
      failed++;
    }
  }

  return json({ ok: true, configured: true, processed: due.length, synced, failed, sheet_url: SHEET_URL });
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
