// Badar Trader CRM - server-side WhatsApp send proxy
// Supabase Edge Function (Deno / TypeScript)
//
// Why this exists: agents send replies from the Conversations tab. The
// original implementation read wa_access_token from public.settings in the
// agent's own browser session, which required exposing the raw token to
// every agent (schema.sql §30). This function keeps the token server-side:
// the browser sends { lead_id, text } with the agent's JWT, and the token
// never leaves the backend. Once this is deployed and the frontend switch
// is live, drop the §30 policy again.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy send-wa-message
//
// Contract: always responds 200 with JSON { ok: boolean, error?: string }
// for application-level outcomes. Non-200 means auth/infra problems only -
// the frontend treats 404 as "not deployed yet" and falls back to the
// legacy in-browser send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
// Added 2026-09-01, Muhammad's direct instruction: agents were blocked from
// manually replying to a real customer whose recent messages actually
// arrived on 3903, because this function only ever sent via 6541's
// credentials. This is a DIFFERENT decision from whatsapp-webhook's own
// 3903 gate (isIngestOnlyNumber/ingestOnlyMessage), which is about
// AUTOMATED replies (scripted funnel, keyword rules, AI) and stays exactly
// as it was - that gate exists because WhatChimp's own bot could otherwise
// double-reply alongside ours. This is a human agent, in this CRM, manually
// typing and sending one message - not automation - so that specific
// double-reply risk does not apply here the same way.
const WHATSAPP_PHONE_NUMBER_ID_3903 = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID_3903") ?? "";

const GRAPH_VERSION = "v21.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Attachments ───────────────────────────────────────────────
// The file rides inside the JSON request as base64 rather than being uploaded
// to storage by the browser first. That avoids needing a new storage RLS
// policy letting agents write to the bucket, which would need a migration
// applied to the live database. The tradeoff is the size cap below, since the
// whole file has to fit in one request body. If bigger files are ever needed,
// the upgrade is: browser uploads straight to storage, sends only the path,
// and this function reads it with the service role.
type Attachment = { dataBase64: string; mimeType: string; filename: string };

// A pre-approved WhatsApp template send. This is the ONLY thing WhatsApp
// accepts more than 24 hours after the customer's last message, which is why
// it exists: without it a conversation that goes quiet cannot be reopened.
//
// metaName is Meta's own identifier for the template, not the friendly label
// the CRM shows. `rendered` is the body with its {{n}} placeholders already
// substituted - sent to WhatsApp as parameters, but stored in communications
// as finished text so the conversation shows what the customer actually read.
type TemplateSend = { metaName: string; language: string; params: string[]; rendered: string };

// Base64 inflates by about a third, so 5MB of file is roughly 6.7MB on the
// wire. Also matches WhatsApp's own 5MB image ceiling, so an image that fits
// here will not be rejected by Meta for size.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// WhatsApp only accepts these for type "image". Everything else has to go as a
// document, which is fine - it still arrives, just without an inline preview.
const WA_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];

function attachmentKind(mimeType: string): "image" | "document" {
  return WA_IMAGE_MIME_TYPES.includes(mimeType) ? "image" : "document";
}

// Rough decoded size without allocating the bytes: 4 base64 chars per 3 bytes,
// minus padding. Used to reject early, before decoding a large payload.
function base64ByteLength(b64: string): number {
  const len = b64.length;
  if (!len) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

function validateAttachment(a: Attachment): string | null {
  if (!a.dataBase64) return "Attachment has no file data";
  if (!a.mimeType) return "Attachment has no file type";
  const size = base64ByteLength(a.dataBase64);
  if (size <= 0) return "Attachment appears to be empty";
  if (size > MAX_ATTACHMENT_BYTES) {
    return `Attachment is too large (${(size / 1024 / 1024).toFixed(1)}MB). The limit is 5MB.`;
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Meta will not accept media inline in a message: it has to be uploaded
// first, and the message then references the returned id.
async function uploadMediaToMeta(
  phoneId: string,
  token: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
  filename: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([bytes], { type: mimeType }), filename || "attachment");

    // No Content-Type header on purpose - fetch sets it, including the
    // multipart boundary, which cannot be written by hand correctly.
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err?.error?.message || `Attachment upload failed (HTTP ${res.status})` };
    }
    const data = await res.json().catch(() => ({}));
    if (!data?.id) return { ok: false, error: "Attachment upload returned no media id" };
    return { ok: true, id: String(data.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Our own copy, so the sent file can be shown in the conversation later.
// Reuses the deposit-screenshots bucket the inbound path already uses, under
// an outbound/ prefix - the bucket name is a misnomer now, but a second
// bucket would need a migration applied to the live database, and the
// conversation renderer already resolves signed URLs from this one.
// Returns null rather than throwing: this must never fail a send.
async function storeOutboundCopy(
  sb: ReturnType<typeof makeServiceClient>,
  leadId: string,
  bytes: Uint8Array<ArrayBuffer>,
  attachment: Attachment,
): Promise<string | null> {
  try {
    const dotted = attachment.filename.includes(".") ? attachment.filename.split(".").pop() : "";
    const ext = (dotted || attachment.mimeType.split("/")[1] || "bin").toLowerCase();
    const path = `outbound/${leadId}/${Date.now()}.${ext}`;
    const { error } = await sb.storage
      .from("deposit-screenshots")
      .upload(path, bytes, { contentType: attachment.mimeType });
    if (error) {
      console.error("storeOutboundCopy failed, message was still sent:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("storeOutboundCopy threw, message was still sent:", err);
    return null;
  }
}

// Persist a send failure the same way the frontend does, so it stays
// diagnosable after the fact (see sendConvMessage in index.html).
async function logSendFailure(
  sb: ReturnType<typeof makeServiceClient>,
  leadId: string,
  userId: string,
  message: string,
): Promise<void> {
  await sb.from("communication_logs").insert({
    lead_id: leadId,
    type: "whatsapp",
    message: `[SEND FAILED] ${message}`,
    created_by: userId,
  }).then(() => {}, () => {});
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function makeServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Same env-first, settings-fallback lookup the webhook uses (whatsapp-webhook
// getWaCredentials) so both send paths stay configured from one place.
// channel picks which real number to send from - "3903" for a reply on that
// line (same WABA, same access token, its own phone number id), anything
// else for the primary line (6541), exactly mirroring whatsapp-status's own
// two-number lookup.
async function getWaCredentials(channel: "6541" | "3903" = "6541"): Promise<{ token: string; phoneId: string }> {
  if (channel === "3903") {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID_3903 };
  }
  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID };
  }
  const sb = makeServiceClient();
  const { data } = await sb.from("settings").select("key, value")
    .in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: { key: string; value: string }) => r.key === key)?.value?.trim() ?? "";
  return {
    token: WHATSAPP_ACCESS_TOKEN || row("wa_access_token"),
    phoneId: WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id"),
  };
}

// Which real number a reply on this lead should actually go out on. Looks at
// the lead's own recent inbound history for an EXPLICIT channel (added
// 2026-09-01, migration 20260901010000) - a null/unknown row is never
// guessed at, same corrected reasoning as the frontend's own fix the same
// day. No explicit recent evidence at all defaults to 6541, the
// longest-running, best-understood number - never guesses 3903 without real
// proof, since a wrong guess there is a genuine send to the wrong line.
async function resolveSendChannel(sb: ReturnType<typeof makeServiceClient>, leadId: string): Promise<"6541" | "3903"> {
  const { data } = await sb.from("communications")
    .select("channel")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(20);
  const recent = (data ?? []).find((r: { channel: string | null }) => r.channel === "6541" || r.channel === "3903");
  return (recent?.channel as "6541" | "3903" | undefined) ?? "6541";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Identify the caller from their JWT. verify_jwt already rejected requests
  // without a valid token, but we still need to know WHO is asking.
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return json({ ok: false, error: "Not signed in" }, 401);
  }

  let leadId = "";
  let text = "";
  let replyToWaMessageId = "";
  let reactionToWaMessageId = "";
  let reactionEmoji = "";
  let attachment: Attachment | null = null;
  let template: TemplateSend | null = null;
  try {
    const body = await req.json();
    leadId = String(body?.lead_id ?? "").trim();
    text = String(body?.text ?? "").trim();
    replyToWaMessageId = String(body?.reply_to_wa_message_id ?? "").trim();
    reactionToWaMessageId = String(body?.reaction_to_wa_message_id ?? "").trim();
    reactionEmoji = String(body?.reaction_emoji ?? "").trim();
    if (body?.template) {
      template = {
        metaName: String(body.template.meta_name ?? "").trim(),
        language: String(body.template.language ?? "en").trim(),
        params:   Array.isArray(body.template.params) ? body.template.params.map((p: unknown) => String(p ?? "")) : [],
        rendered: String(body.template.rendered ?? "").trim(),
      };
    }
    if (body?.attachment) {
      attachment = {
        dataBase64: String(body.attachment.data_base64 ?? ""),
        mimeType:   String(body.attachment.mime_type ?? "").split(";")[0].trim().toLowerCase(),
        filename:   String(body.attachment.filename ?? "").trim(),
      };
    }
  } catch {
    return json({ ok: false, error: "Invalid request body" });
  }
  const isReaction = !!reactionToWaMessageId;
  // Text alone is fine, an attachment alone is fine (the caption is optional),
  // and a reaction targets an existing WAMID. Mixed reaction/send payloads are
  // rejected so the endpoint can never accidentally send both.
  if (!leadId || (!text && !attachment && !template && !isReaction)) {
    return json({ ok: false, error: "lead_id and a message, attachment, template or reaction are required" });
  }
  if (isReaction && (text || attachment || template || replyToWaMessageId)) {
    return json({ ok: false, error: "A reaction cannot be combined with another message type" });
  }
  // Meta uses an empty emoji to remove the existing reaction.
  if (isReaction && reactionEmoji.length > 16) {
    return json({ ok: false, error: "A reaction must contain one supported emoji, or be empty to remove it" });
  }
  if (attachment) {
    const problem = validateAttachment(attachment);
    if (problem) return json({ ok: false, error: problem });
  }
  if (template && !template.metaName) {
    // The CRM stores a human label (name) and Meta's own identifier
    // (meta_name). Only the latter can be sent, and a template row can exist
    // with it blank, so this is a real case rather than a defensive check.
    return json({ ok: false, error: "That template has no Meta template name saved, so WhatsApp cannot be told which template to send." });
  }

  const sb = makeServiceClient();

  // The service-role client bypasses RLS, so the assigned-lead rule must be
  // repeated here explicitly. Otherwise an agent who guessed a lead UUID
  // could send through this function even though PR #14 hides that lead in
  // the browser and database API.
  const [{ data: profile }, { data: lead, error: leadError }] = await Promise.all([
    sb.from("profiles").select("role, is_suspended").eq("id", user.id).maybeSingle(),
    sb.from("leads").select("id, phone, assigned_agent_id").eq("id", leadId).maybeSingle(),
  ]);
  if (leadError || !lead) {
    return json({ ok: false, error: "Lead not found" });
  }
  // super_admin added 2026-09-01 (Badar's new role, above admin) - treated as
  // admin-or-above everywhere, same as public.is_admin() does for RLS.
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isAssignedAgent = profile?.role === "agent" && !profile.is_suspended
    && lead.assigned_agent_id === user.id;
  if (!isAdmin && !isAssignedAgent) {
    return json({ ok: false, error: "Your account does not have access to send messages" }, 403);
  }

  if (isReaction) {
    // A WAMID supplied by the browser must belong to this exact lead. This
    // prevents reacting to an unrelated message by guessing or copying an ID.
    const { data: targetMessage } = await sb.from("communications")
      .select("id")
      .eq("lead_id", leadId)
      .eq("wa_message_id", reactionToWaMessageId)
      .maybeSingle();
    if (!targetMessage) {
      return json({ ok: false, error: "The message to react to was not found in this conversation" });
    }
  }

  const sendChannel = await resolveSendChannel(sb, leadId);
  const { token, phoneId } = await getWaCredentials(sendChannel);
  if (!token || !phoneId) {
    return json({
      ok: false,
      error: sendChannel === "3903"
        ? "3903's credentials are not configured (WHATSAPP_PHONE_NUMBER_ID_3903 secret is missing) - admin must add it."
        : "WhatsApp credentials not configured - admin must save them in Meta Integration",
    });
  }

  const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
  if (!phoneDigits) {
    return json({ ok: false, error: "Lead has no phone number on record" });
  }

  // An attachment has to reach Meta before the message can be sent: media is
  // referenced by id, never inlined into the message payload.
  let storedPath: string | null = null;
  let mediaPayload: Record<string, unknown> | null = null;
  if (attachment) {
    const bytes = base64ToBytes(attachment.dataBase64);
    const uploaded = await uploadMediaToMeta(phoneId, token, bytes, attachment.mimeType, attachment.filename);
    if (!uploaded.ok) {
      await logSendFailure(sb, leadId, user.id, uploaded.error);
      return json({ ok: false, error: uploaded.error });
    }

    const kind = attachmentKind(attachment.mimeType);
    mediaPayload = {
      type: kind,
      [kind]: {
        id: uploaded.id,
        // WhatsApp calls it a caption on both, and shows it under the file.
        ...(text ? { caption: text } : {}),
        // Documents keep their filename so the customer sees "receipt.pdf"
        // rather than an opaque id. Images have no filename field.
        ...(kind === "document" && attachment.filename ? { filename: attachment.filename } : {}),
      },
    };

    // Keep our own copy so the conversation can show it afterwards. Best
    // effort on purpose: if storing fails, the customer has still received
    // the file, and telling the agent the send failed would be a lie.
    storedPath = await storeOutboundCopy(sb, leadId, bytes, attachment);
  }

  const waResp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneDigits,
      ...(isReaction
        ? {
            type: "reaction",
            reaction: { message_id: reactionToWaMessageId, emoji: reactionEmoji },
          }
        : template
        ? {
            type: "template",
            template: {
              name: template.metaName,
              language: { code: template.language },
              // Only a body component is sent. Every template this CRM stores
              // is body-only text; headers, buttons and media headers would
              // each need their own component and their own UI to fill.
              ...(template.params.length
                ? { components: [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] }
                : {}),
            },
          }
        : (mediaPayload ?? { type: "text", text: { body: text } })),
      // Deliberately no reply context on a template send: a template is used
      // precisely when the window has closed, so there is no live thread to
      // quote into and Meta rejects the combination in some cases.
      ...(replyToWaMessageId && !template && !isReaction ? { context: { message_id: replyToWaMessageId } } : {}),
    }),
  });

  if (!waResp.ok) {
    const errData = await waResp.json().catch(() => ({}));
    const message = errData?.error?.message || `WhatsApp API error ${waResp.status}`;
    await logSendFailure(sb, leadId, user.id, message);
    return json({ ok: false, error: message });
  }

  const waData = await waResp.json().catch(() => ({}));
  const sentWaMessageId: string | undefined = waData?.messages?.[0]?.id;

  // Reactions attach to an existing message and should not appear as a new
  // chat bubble. The browser stores the per-user visual marker after this
  // succeeds. We still record the human takeover below.
  if (isReaction) {
    const { error: takeoverError } = await sb.from("leads").update({
      needs_human: true,
      handoff_reason: "requested human agent, an agent manually took over this conversation",
    }).eq("id", leadId);
    return json({
      ok: true,
      ...(takeoverError ? { warning: `Reaction sent, but the bot may still reply: ${takeoverError.message}` } : {}),
    });
  }

  // An attachment sent with no caption still needs a readable body, or the
  // conversation and the Comm Log show an empty row. Same bracket convention
  // the inbound handler uses.
  // A template is stored as the finished text the customer received, not as
  // the raw body with {{1}} still in it - the conversation should show what
  // was actually read. Falls back to naming the template if the frontend did
  // not send a rendered version.
  const outboundBody = template
    ? (template.rendered || `[template sent: ${template.metaName}]`)
    : text || (attachment
      ? (attachmentKind(attachment.mimeType) === "image"
          ? "[image sent]"
          : `[document sent${attachment.filename ? `: ${attachment.filename}` : ""}]`)
      : "");

  // These two writes are independent (different tables, neither reads the
  // other's result) but used to run one after another - a real, avoidable
  // round-trip added to every single send. Found 2026-08-06 while
  // investigating a repeated agent complaint (Hanzla) that sends feel slow.
  // This alone won't explain several seconds of delay - most of that is the
  // WhatsApp Graph API call above and possible Edge Function cold starts,
  // neither of which this function controls - but it removes one genuine,
  // fixable slice of the total.
  const [{ error: insertError }, { error: takeoverError }] = await Promise.all([
    sb.from("communications").insert({
      lead_id: leadId,
      type: "whatsapp",
      direction: "outbound",
      body: outboundBody,
      logged_by: user.id,
      wa_message_id: sentWaMessageId ?? null,
      attachment_path: storedPath,
      // The number this specific message actually went out on - resolveSendChannel()
      // decided it above, and getWaCredentials(sendChannel) used exactly that
      // channel's real credentials, so this is the true value, not a guess.
      channel: sendChannel,
    }),
    // An agent manually messaging a lead means a human has taken over this
    // conversation - the bot must not keep processing the lead's replies as
    // answers to its own stage machine. Uses the same needs_human flag the
    // webhook's runBotStep already checks, with a reason matching the
    // "requested human agent" pattern so it's a PERMANENT handoff (never
    // auto-resumes after the usual gap), not a temporary one. Missed
    // originally: a lead was lost 21 July 2026 evening when an agent
    // (Hanzala) tried to step into an early-stage bot conversation and the
    // bot kept consuming the lead's replies as if answering its own flow.
    sb.from("leads").update({
      needs_human: true,
      handoff_reason: "requested human agent, an agent manually took over this conversation",
    }).eq("id", leadId),
  ]);

  if (insertError) {
    // Message DID go out - surface the logging failure rather than pretending
    // the send failed (a retry would double-message the lead).
    return json({ ok: true, warning: `Sent, but failed to log in CRM: ${insertError.message}` });
  }

  // The takeover write was previously fired and its result thrown away, so a
  // failure here was completely silent. That matters more than the logging
  // failure above: without needs_human the bot carries on consuming the
  // lead's replies as answers to its own flow, which is exactly how a lead
  // was lost on 21 July. The agent needs to know the bot may still be live in
  // this conversation, so they can set Needs Human by hand.
  if (takeoverError) {
    return json({
      ok: true,
      warning: `Sent, but could not hand this conversation over to you - the bot may still reply to this lead. Set Needs Human manually. (${takeoverError.message})`,
    });
  }

  return json({ ok: true });
});
