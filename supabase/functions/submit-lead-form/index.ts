// Badar Trader CRM - submit-lead-form
// Supabase Edge Function (Deno / TypeScript)
//
// Public endpoint backing signals-form.html and course-form.html - the
// replicated versions of Badar's real lead-capture forms. Unlike
// conversion-hook (which only updates an existing lead matched by phone),
// this ALWAYS creates a new lead, since these forms are the first contact
// point for someone who hasn't messaged the WhatsApp bot yet.
//
// The deposit screenshot is mandatory and is stored as a kyc_documents row
// (document_type='deposit_screenshot') in the existing deposit-screenshots
// bucket, so it shows up in the CRM's existing KYC review tab with the
// existing Verify/Reject workflow - no new admin UI needed for that part.
//
// "Enforcement" here is what's actually achievable server-side: the file
// must really be an image (rejects PDFs/docs/randomly-renamed files) and a
// sane size (rejects near-empty placeholder files and unreasonably huge
// ones). It cannot verify the image actually shows a payment - that needs
// either a human reviewer (the Verify/Reject buttons this already feeds)
// or a paid vision-model call, which was intentionally not added here
// without an explicit decision on whose API key/cost that is.
//
// Deploy: supabase functions deploy submit-lead-form --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  readFormDataWithinLimit,
  RequestTooLargeError,
} from "../_shared/public_form_security.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TURNSTILE_SITE_KEY = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const PUBLIC_FORM_RATE_LIMIT_SALT = Deno.env.get("PUBLIC_FORM_RATE_LIMIT_SALT") ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const FORM_TYPES: Record<string, string> = {
  signals: "signals_group_form",
  course: "course_form",
};
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MIN_FILE_BYTES = 1024; // reject near-empty / placeholder uploads
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

function normPhone(p: string): string {
  p = (p || "").trim();
  if (!p) return "";
  return p.startsWith("+") ? p : "+" + p;
}

function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string, ip: string): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) {
    return { ok: false, status: 503, error: "Form security is not configured yet" };
  }
  if (!token || token.length > 2048) {
    return { ok: false, status: 400, error: "Please complete the security check" };
  }

  const body = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  let response: Response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return { ok: false, status: 502, error: "Security check is temporarily unavailable" };
  }
  if (!response.ok) return { ok: false, status: 502, error: "Security check is temporarily unavailable" };

  const result = await response.json();
  if (!result?.success || result.action !== "lead_form") {
    return { ok: false, status: 400, error: "Security check failed or expired. Please try again" };
  }
  return { ok: true, status: 200 };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    if (!TURNSTILE_SITE_KEY) return json({ ok: false, error: "Form security is not configured yet" }, 503);
    return json({ ok: true, turnstile_site_key: TURNSTILE_SITE_KEY });
  }
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  if (!SUPABASE_URL || !SERVICE) {
    return json({ ok: false, error: "Form storage is not configured yet" }, 503);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "Request is too large" }, 413);
  }

  const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  let createdLeadId = "";
  let uploadedPath = "";
  try {
    const form = await readFormDataWithinLimit(req, MAX_REQUEST_BYTES);
    const ip = clientIp(req);
    const turnstile = await verifyTurnstile(String(form.get("turnstile_token") || ""), ip);
    if (!turnstile.ok) return json({ ok: false, error: turnstile.error }, turnstile.status);

    if (!PUBLIC_FORM_RATE_LIMIT_SALT) {
      return json({ ok: false, error: "Form rate limiting is not configured yet" }, 503);
    }
    const rateKey = await sha256Hex(`${PUBLIC_FORM_RATE_LIMIT_SALT}:${ip}:${req.headers.get("user-agent") || "unknown"}`);
    const { data: allowed, error: rateError } = await sb.rpc("consume_public_form_rate_limit", {
      p_key_hash: rateKey,
      p_limit: RATE_LIMIT_ATTEMPTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (rateError) throw new Error(`rate limit check failed: ${rateError.message}`);
    if (!allowed) {
      return json(
        { ok: false, error: "Too many submissions. Please wait 15 minutes and try again" },
        429,
        { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) },
      );
    }

    const firstName = ((form.get("first_name") as string) || "").trim();
    const lastName = ((form.get("last_name") as string) || "").trim();
    const email = ((form.get("email") as string) || "").trim();
    const phone = normPhone((form.get("phone") as string) || "");
    const brokerId = ((form.get("broker_id") as string) || "").trim().slice(0, 80);
    const formType = ((form.get("form_type") as string) || "").trim();
    const file = form.get("screenshot") as File | null;

    if (!FORM_TYPES[formType]) return json({ ok: false, error: "invalid form_type" }, 400);
    if (!firstName) return json({ ok: false, error: "first_name is required" }, 400);
    if (!email && !phone) return json({ ok: false, error: "email or phone is required" }, 400);
    if (!brokerId) return json({ ok: false, error: "broker_id is required" }, 400);
    if (!file) return json({ ok: false, error: "screenshot is required" }, 400);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return json({ ok: false, error: `screenshot must be an image (got ${file.type || "unknown type"})` }, 400);
    }
    if (file.size < MIN_FILE_BYTES) return json({ ok: false, error: "screenshot file is too small - please upload a real screenshot" }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ ok: false, error: "screenshot file is too large (max 10MB)" }, 400);

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const nowIso = new Date().toISOString();
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .insert({
        first_name: firstName,
        last_name: lastName || null,
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        deposit_account_ref: brokerId,
        source: "website",
        meta_campaign: FORM_TYPES[formType],
        status: "new",
        kyc_status: "pending",
      })
      .select("id")
      .single();
    if (leadErr) throw new Error(`lead insert failed: ${leadErr.message}`);
    const leadId = lead.id as string;
    createdLeadId = leadId;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${leadId}/${Date.now()}_deposit_screenshot.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await sb.storage.from("deposit-screenshots").upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw new Error(`screenshot upload failed: ${upErr.message}`);
    uploadedPath = path;

    const { error: docErr } = await sb.from("kyc_documents").insert({
      client_id: leadId,
      document_type: "deposit_screenshot",
      status: "pending",
      file_path: path,
      uploaded_at: nowIso,
    });
    if (docErr) throw new Error(`kyc_documents insert failed: ${docErr.message}`);

    // communication_logs (not communications - that table's type check only
    // allows email/whatsapp/call/sms, not 'note'; confirmed by hitting that
    // constraint during testing).
    const { error: logErr } = await sb.from("communication_logs").insert({
      lead_id: leadId,
      type: "note",
      message: `New ${formType === "signals" ? "Signaling Group" : "Course"} form submission - broker ID: ${brokerId} (deposit screenshot pending review)`,
      created_by: null,
    });
    if (logErr) console.error("communication_logs insert failed:", logErr.message);

    return json({ ok: true, lead_id: leadId });
  } catch (e) {
    if (uploadedPath) {
      const { error } = await sb.storage.from("deposit-screenshots").remove([uploadedPath]);
      if (error) console.error("failed to clean up uploaded screenshot:", error.message);
    }
    if (createdLeadId) {
      const { error } = await sb.from("leads").delete().eq("id", createdLeadId);
      if (error) console.error("failed to clean up partially-created lead:", error.message);
    }
    if (e instanceof RequestTooLargeError) {
      return json({ ok: false, error: "Request is too large" }, 413);
    }
    console.error("public lead form submission failed:", e);
    return json({ ok: false, error: "Submission could not be saved. Please try again" }, 500);
  }
});
