// Badar Trader CRM - Facebook Messenger + Instagram DM webhook
// Supabase Edge Function (Deno / TypeScript)
//
// STAGED, INGEST-ONLY (2026-08-27, Muhammad's decision - same shape as
// 3903's WhatsApp ingest-only connection, see whatsapp-webhook/index.ts and
// REMAINING_TODOS.md's 2026-08-26 entry): real messages from a real Facebook
// Page and a real linked Instagram Business account land here as real leads,
// visible in the Omnichannel Inbox with a channel badge, round-robin
// assigned like any other lead - but this function NEVER sends a reply of
// any kind. No scripted flow, no keyword rules, no AI - none of that exists
// in this file at all, on purpose, so there is no code path here that could
// ever message a real Messenger/Instagram contact automatically. Turning on
// automated replies for this channel is a separate, later, deliberate
// decision - not part of this build.
//
// A Messenger/Instagram contact is identified by an opaque, platform-scoped
// id (PSID for Messenger, IGSID for Instagram) - never a phone number, so
// leads for this channel are found/created by `external_id`, not `phone`
// (see the 20260827010000 migration's comment for why `phone` is never
// reused for this).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isMetaSignatureEnforced,
  readAndVerifyMetaRequest,
} from "../_shared/meta_signature.mjs";

const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_SIGNATURE_ENFORCED = isMetaSignatureEnforced(Deno.env.get("META_SIGNATURE_ENFORCED"));

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Env-first, settings-table-fallback - same pattern whatsapp-webhook's
// getWaCredentials() and send-wa-message already use, so Muhammad can paste
// these into the CRM's own Meta Integration UI (saved to `settings`) instead
// of needing `supabase secrets set` run for him every time. An explicit env
// var still wins if one is ever set directly. Fail-closed either way: an
// unset/empty value rejects every event for that type, never accepts
// anything.
type MessengerConfig = { fbPageId: string; igBusinessAccountId: string; verifyToken: string };
let _configCache: MessengerConfig | null = null;

async function getMessengerConfig(sb: SupabaseClient): Promise<MessengerConfig> {
  if (_configCache) return _configCache;
  const envFbPageId = Deno.env.get("FB_PAGE_ID") ?? "";
  const envIgId = Deno.env.get("IG_BUSINESS_ACCOUNT_ID") ?? "";
  const envVerifyToken = Deno.env.get("META_MESSENGER_VERIFY_TOKEN") ?? "";

  let row = (_key: string) => "";
  if (!envFbPageId || !envIgId || !envVerifyToken) {
    const { data } = await sb.from("settings").select("key, value")
      .in("key", ["fb_page_id", "ig_business_account_id", "meta_messenger_verify_token"]);
    row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  }

  _configCache = {
    fbPageId: envFbPageId || row("fb_page_id"),
    igBusinessAccountId: envIgId || row("ig_business_account_id"),
    verifyToken: envVerifyToken || row("meta_messenger_verify_token"),
  };
  return _configCache;
}

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const ROTATION_BATCH_SIZE = 10;

type RotationAgent = { id: string; name: string };

let _rotationCache: RotationAgent[] | null = null;

// Deliberately minimal compared to whatsapp-webhook's getAgentRotation - this
// channel doesn't (yet) ping an agent's phone on assignment, so only the id
// and name needed to write assigned_agent_id/a log line are fetched. If this
// channel later gets its own notification, borrow whatsapp-webhook's fuller
// version rather than growing this one in place.
async function getAgentRotation(sb: SupabaseClient): Promise<RotationAgent[]> {
  if (_rotationCache) return _rotationCache;
  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("is_active", true)
    .eq("is_suspended", false)
    .eq("receives_leads", true)
    .order("created_at", { ascending: true });
  if (error || !data || !data.length) {
    console.error("messenger-webhook: getAgentRotation could not read an eligible agent -", error?.message);
    return [];
  }
  _rotationCache = data.map((p: any) => ({ id: p.id, name: (p.full_name || "").trim() || "Agent" }));
  return _rotationCache;
}

async function assignAgentRoundRobin(sb: SupabaseClient): Promise<string | null> {
  const rotation = await getAgentRotation(sb);
  if (!rotation.length) return null;
  const { count } = await sb.from("leads").select("id", { count: "exact", head: true });
  const totalLeads = count ?? 1;
  const agentIndex = Math.floor((totalLeads - 1) / ROTATION_BATCH_SIZE) % rotation.length;
  return rotation[agentIndex].id;
}

async function upsertLeadByExternalId(
  sb: SupabaseClient,
  externalId: string,
  fullName: string,
  timestamp: string,
): Promise<{ id: string } | null> {
  const { data: existing, error: selectError } = await sb
    .from("leads")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (selectError) {
    console.error("messenger-webhook: could not query leads by external_id -", selectError.message);
    return null;
  }
  if (existing) return existing;

  const assignedAgentId = await assignAgentRoundRobin(sb);
  const { data: created, error: insertError } = await sb
    .from("leads")
    .insert({
      full_name: fullName,
      external_id: externalId,
      source: "meta",
      status: "new",
      assigned_agent_id: assignedAgentId,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("messenger-webhook: could not insert lead -", insertError.message);
    return null;
  }
  console.log(`messenger-webhook: new lead ${created.id} for external_id ${externalId}`);
  return created;
}

async function insertCommunication(
  sb: SupabaseClient,
  leadId: string,
  channelType: "messenger" | "instagram",
  body: string,
  timestamp: string,
  waMessageId?: string,
): Promise<void> {
  const { error } = await sb.from("communications").insert({
    lead_id: leadId,
    type: channelType,
    direction: "inbound",
    body,
    created_at: timestamp,
    wa_message_id: waMessageId ?? null,
  });
  if (error) console.error("messenger-webhook: could not insert communication -", error.message);
}

// True when this exact platform message id has already been logged - a Meta
// webhook retry is a no-op, not a duplicate lead/message. Same reasoning as
// whatsapp-webhook's wasAlreadyProcessed.
async function wasAlreadyProcessed(sb: SupabaseClient, waMessageId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("communications")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("messenger-webhook: could not check for a duplicate -", error.message);
    return false;
  }
  return !!data;
}

// Describes anything that isn't plain text (an image, sticker, etc.) the
// same "readable bracket note" way whatsapp-webhook's
// describeUnsupportedMessage does - never silently dropped.
function describeMessengerMessage(message: any): string {
  if (typeof message?.text === "string" && message.text.trim()) return message.text;
  if (Array.isArray(message?.attachments) && message.attachments.length) {
    const kinds = message.attachments.map((a: any) => a?.type || "file").join(", ");
    return `[attachment: ${kinds}]`;
  }
  if (message?.is_deleted) return "[message deleted]";
  return "[unsupported message content]";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // Cleared per request, same reasoning as whatsapp-webhook's _gateCache - a
  // warm instance must never keep serving a stale settings-table value.
  _configCache = null;
  const sbForConfig = makeSupabase();
  const config = await getMessengerConfig(sbForConfig);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === config.verifyToken && config.verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let rawBody: Uint8Array;
  let signature: { allowed: boolean; verified: boolean; reason: string };
  try {
    ({ rawBody, signature } = await readAndVerifyMetaRequest(req, {
      appSecret: META_APP_SECRET,
      enforced: META_SIGNATURE_ENFORCED,
    }));
  } catch (err) {
    console.error("messenger-webhook: could not read request body:", err);
    return new Response("OK", { status: 200 });
  }

  if (!signature.allowed) {
    console.error(`messenger-webhook: rejected unverified request - ${signature.reason}`);
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch (err) {
    console.error("messenger-webhook: could not parse JSON body:", err);
    return new Response("OK", { status: 200 });
  }

  // "page" = Messenger, "instagram" = Instagram DMs - Meta sets this at the
  // top level of the payload depending on which product delivered the event.
  const objectType: string = payload?.object ?? "";
  if (objectType !== "page" && objectType !== "instagram") {
    console.error(`messenger-webhook: rejected event with unrecognised object "${objectType || "(missing)"}". No data was read or written.`);
    return new Response("OK", { status: 200 });
  }

  const sb = sbForConfig;
  const entries: any[] = payload?.entry ?? [];

  for (const entry of entries) {
    // Fail-closed routing guard - reject anything not explicitly this Page
    // or this Instagram Business account, before any DB read or write. Both
    // fbPageId and igBusinessAccountId must be configured for their
    // respective object type to ever be accepted; an unset id rejects
    // everything of that type rather than accepting anything unconfigured.
    const entryId: string = entry?.id ?? "";
    const isAllowedPage = objectType === "page" && config.fbPageId.length > 0 && entryId === config.fbPageId;
    const isAllowedInstagram = objectType === "instagram" && config.igBusinessAccountId.length > 0 && entryId === config.igBusinessAccountId;
    if (!isAllowedPage && !isAllowedInstagram) {
      console.error(`messenger-webhook: rejected entry for id "${entryId || "(missing)"}" (object "${objectType}") - does not match the configured Page/Instagram account. No data was read or written.`);
      continue;
    }

    const channelType: "messenger" | "instagram" = objectType === "instagram" ? "instagram" : "messenger";
    const messagingEvents: any[] = entry?.messaging ?? [];

    for (const event of messagingEvents) {
      // Meta also delivers delivery/read receipts and postbacks through this
      // same array - only a real inbound message is ingested here.
      if (!event?.message) continue;
      // Echoes are our own sent messages bounced back for logging - never
      // relevant here since this function never sends anything.
      if (event.message.is_echo) continue;

      const senderId: string = event?.sender?.id ?? "";
      if (!senderId) {
        console.error("messenger-webhook: event has no sender id - skipping.");
        continue;
      }

      const mid: string | undefined = event.message?.mid;
      if (mid && (await wasAlreadyProcessed(sb, mid))) {
        console.log(`messenger-webhook: skipping duplicate message ${mid} - already processed.`);
        continue;
      }

      const timestamp = event.timestamp
        ? new Date(Number(event.timestamp)).toISOString()
        : new Date().toISOString();

      // No profile-name lookup in this first, ingest-only version (that's a
      // real Graph API call this function doesn't make yet) - an honest
      // generic label beats a fabricated name. Can be added later without
      // touching anything else here.
      const fullName = channelType === "instagram" ? "Instagram contact" : "Messenger contact";

      const lead = await upsertLeadByExternalId(sb, senderId, fullName, timestamp);
      if (!lead) {
        console.error(`messenger-webhook: could not upsert lead for ${senderId} - message lost.`);
        continue;
      }

      const body = describeMessengerMessage(event.message);
      await insertCommunication(sb, lead.id, channelType, body, timestamp, mid);
    }
  }

  return new Response("OK", { status: 200 });
});
