// Badar Trader CRM - WhatsApp Cloud API Webhook
// Supabase Edge Function (Deno / TypeScript)
//
// Handoff behaviour (v28): confusion/inactivity handoffs auto-expire so a lead
// who returns after a gap resumes the bot flow from where they left off; only
// explicit "talk to an agent" requests keep the bot silent for a human.
//
// 2026-08-19: forced redeploy to guarantee a fresh instance re-reads
// WHATSAPP_ACCESS_TOKEN after several secret rotations tonight - a plain
// `supabase secrets set` does not necessarily recycle an already-warm
// instance's module-level constant, only new instances see it immediately.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isMetaSignatureEnforced,
  readAndVerifyMetaRequest,
} from "../_shared/meta_signature.mjs";
import { isAllowedPhoneNumberId } from "../_shared/whatsapp_phone_scope.mjs";
import { isPermanentHandoff } from "../_shared/handoff_permanence.mjs";
import { shouldNotifyAgent, DEFAULT_COOLDOWN_MINUTES } from "../_shared/agent_notify_policy.mjs";
import { shouldSuppressRePrompt } from "../_shared/unmatched_reprompt_policy.mjs";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_SIGNATURE_ENFORCED = isMetaSignatureEnforced(Deno.env.get("META_SIGNATURE_ENFORCED"));

const GRAPH_VERSION = "v21.0";

// How long before a confusion/inactivity handoff is considered stale. A lead
// who returns after this many hours has their needs_human flag cleared and the
// bot flow resumed (explicit agent requests are exempt - see runBotStep).
const HANDOFF_STALE_HOURS = 2;

// A DECLINED lead who comes back after this long is treated as a fresh
// opportunity: the flow restarts from the greeting instead of dead-ending
// every message in the "a team member will follow up" acknowledgement
// (which promised a follow-up nobody was making - Badar, 2026-07-14).
// Within the window the polite acknowledgement stands, so someone who just
// said "not right now" isn't immediately re-pitched.
const DECLINED_RESTART_HOURS = 24;

// Muhammad, 21 July 2026: turn off the WhatsApp ping agents get on new-lead
// assignment. Lead assignment itself still happens (round-robin, CRM record),
// only the outbound notification is silenced. Flip back to true when told to.
const NEW_LEAD_NOTIFICATIONS_ENABLED = false;

// Muhammad, 23 July 2026: WhatChimp got connected to this same WABA as a
// second subscribed app - Meta allows more than one app to receive the same
// inbound webhook, so this bot and WhatChimp's own bot could both end up
// replying to the same customer at once. Paused as a precaution while that
// gets sorted out. Inbound messages/leads still get logged normally (nothing
// here touches ingestion); every place the bot would send something back to
// a customer or ping an agent just no-ops instead.
//
// Enabled 2026-08-19 (Muhammad, his laptop, him present), same night and
// same evidence as AI_REPLIES_ENABLED above: two real test messages to
// +971 52 558 6541 after this WABA's webhook was actually fixed produced
// zero WhatChimp auto-reply. This is the specific precaution that comment
// was waiting on. If WhatChimp turns out to still be listening despite
// that, a real customer could get answered twice - watch the first few
// live replies closely.
const BOT_REPLIES_ENABLED = true;

// Keyword replies are DELIBERATELY on their own switch, not BOT_REPLIES_ENABLED.
// The point is to be able to answer simple factual questions ("price", "course")
// without resuming the whole qualification funnel (greeting, language picker,
// broker choice, deposit flow). Turning this on alone has a far smaller blast
// radius than un-pausing the bot, and is much easier to reverse.
//
// Before ever setting this true, check that nothing else is already replying on
// the same WABA - WhatChimp is still connected to this number, and if its AI
// Agent or its own keyword replies get re-enabled, customers get double replies.
// That is exactly the problem BOT_REPLIES_ENABLED was introduced to stop on
// 28 July. Also note Meta's 24h customer-service window: a keyword reply to a
// conversation that has been silent 24h+ will be rejected and logged as failed.
const KEYWORD_REPLIES_ENABLED = false;

// AI Signals sibling for real customer replies (2026-08-04 prep work) - the
// Train AI tab stores a system prompt + knowledge notes per campaign but
// nothing ever read them. This wires that config into a real OpenAI call,
// same "structured, tested, switched off" state as KEYWORD_REPLIES_ENABLED
// above. OpenAI specifically because HANDOFF.md already documents Badar's
// brother has an OpenAI account with a real key funding the WhatChimp AI
// Agent for this same number - reusing that provider means the prompt is
// portable if WhatChimp is ever dropped, not a guess.
//
// Enabled 2026-08-19 (Muhammad, his laptop, him present) after all four
// gates below were actually met, not assumed:
//   1. settings.openai_api_key saved via Bot Manager -> AI Configuration.
//   2. Active ai_knowledge_base row for +971 52 558 6541 with Muhammad's
//      own written system prompt (old placeholder campaign deactivated).
//   3. Two real test messages to 6541 produced zero WhatChimp auto-reply,
//      the best signal available without logging into WhatChimp itself.
//   4. Muhammad read the assembled prompt before this was flipped.
const AI_REPLIES_ENABLED = true;

// ── REPLY GATES AT RUNTIME ───────────────────────────────────────────────────
// The three constants above are now DEFAULTS, not the final word. Each is also
// looked up in `settings` on every invocation, so the three toggles in Bot
// Manager can turn a reply path off - or back on - without a redeploy.
//
// Why this matters more than convenience: until now the only way to silence the
// bot was to edit this file and deploy it, which needs a laptop with the CLI and
// takes minutes. If the bot ever starts saying the wrong thing to real
// customers, minutes is far too long. This is the stop button.
//
// Resolution order, deliberately: an explicit row in `settings` wins; a missing
// row falls back to the constant above; an unreadable database falls back to the
// constant too, because if `settings` cannot be read the webhook cannot read
// leads either and is already failing - silently flipping every gate would just
// add a second, confusing failure on top of the first.
//
// "false" is matched exactly, so a typo in the settings value can never read as
// off by accident. Anything that is not the literal string "true" or "false"
// leaves the constant in charge.
const GATE_DEFAULTS: Record<string, boolean> = {
  AI_REPLIES_ENABLED: AI_REPLIES_ENABLED,
  KEYWORD_REPLIES_ENABLED: KEYWORD_REPLIES_ENABLED,
  BOT_REPLIES_ENABLED: BOT_REPLIES_ENABLED,
};

// One read per invocation, not per call site: a single inbound message can pass
// several gates and there is no reason to ask the database each time.
let _gateCache: Record<string, boolean> | null = null;

async function loadGates(sb: SupabaseClient): Promise<Record<string, boolean>> {
  if (_gateCache) return _gateCache;
  const resolved: Record<string, boolean> = { ...GATE_DEFAULTS };
  try {
    const { data, error } = await sb
      .from("settings")
      .select("key, value")
      .in("key", Object.keys(GATE_DEFAULTS));
    if (error) throw error;
    for (const row of data ?? []) {
      const v = String(row.value ?? "").trim().toLowerCase();
      if (v === "true") resolved[row.key] = true;
      else if (v === "false") resolved[row.key] = false;
    }
  } catch (err) {
    console.error("loadGates: could not read settings, using compiled defaults -",
      err instanceof Error ? err.message : String(err));
  }
  _gateCache = resolved;
  return resolved;
}

async function gateOpen(sb: SupabaseClient, name: keyof typeof GATE_DEFAULTS): Promise<boolean> {
  return (await loadGates(sb))[name];
}

// The send helpers below have no SupabaseClient and are called from dozens of
// places, so threading one through all of them would be a large, risky diff for
// no gain. loadGates() is awaited once at the top of every request instead, well
// before anything can send, and this reads that already-populated cache. If it
// somehow runs before the load, it returns the compiled default rather than
// inventing an answer.
function gateOpenSync(name: keyof typeof GATE_DEFAULTS): boolean {
  return (_gateCache ?? GATE_DEFAULTS)[name];
}

// Muhammad, 22 July 2026: a real lead (Izza) explicitly asked for a human
// agent and sat unanswered for 10+ days - escalating a lead set needs_human
// but never actually told anyone, and she had no assigned agent at all to
// even see it. Separate toggle from the one above (that's about routine new
// leads; this is specifically "someone needs help right now").
const ESCALATION_NOTIFICATIONS_ENABLED = true;

// ── AGENT NOTIFICATION SAFETY ────────────────────────────────────────────────
// July 2026: agents got four or five WhatsApp pings inside a minute because
// escalate() sent one every time it ran, with no check for having just told
// that same agent about that same lead. They were frustrated enough to phone
// Muhammad, and there was no quick way to stop it. That is why
// NEW_LEAD_NOTIFICATIONS_ENABLED was switched off on 2026-07-21.
//
// AGENT_NOTIFY_TEST_NUMBERS is the way back on safely. While it holds any
// number, those are the ONLY phones that can be notified - every real agent is
// unreachable no matter what else happens. Empty it only once the rhythm has
// been watched on test phones and judged right.
// Muhammad (+92 300 6960632) and Junaid (+92 336 2391119), 2026-08-22.
// While these two are listed, NO other phone on earth can receive an agent
// notification from this webhook - real agents included. Emptying this array is
// what makes notifications live for the whole team, and that is a deliberate
// decision to take only after watching the rhythm on these two phones.
const AGENT_NOTIFY_TEST_NUMBERS: string[] = ["923006960632", "923362391119"];
const AGENT_NOTIFY_COOLDOWN_MINUTES = DEFAULT_COOLDOWN_MINUTES;

let cachedWaToken: string | null = null;
let cachedWaPhoneId: string | null = null;

async function getWaCredentials(): Promise<{ token: string; phoneId: string }> {
  if (WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID) {
    return { token: WHATSAPP_ACCESS_TOKEN, phoneId: WHATSAPP_PHONE_NUMBER_ID };
  }
  if (cachedWaToken && cachedWaPhoneId) {
    return { token: cachedWaToken, phoneId: cachedWaPhoneId };
  }
  const sb = makeSupabase();
  const { data } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
  const row = (key: string) => data?.find((r: any) => r.key === key)?.value?.trim() ?? "";
  const token = WHATSAPP_ACCESS_TOKEN || row("wa_access_token");
  const phoneId = WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id");
  cachedWaToken = token;
  cachedWaPhoneId = phoneId;
  return { token, phoneId };
}

const LINKS = {
  exness: "https://one.exnesstrack.org/a/eatgh2cl7y",
  exnessCode: "eatgh2cl7y",
  xm: "https://affs.click/a3Vrw",
  xmCode: "YR4PD",
  // Was a Google Form placeholder that returns 401 Unauthorized (confirmed
  // live) - this is the real, working, hosted form (Badar, 2026-07-14).
  form: "https://crm.badartrader.com/join.html",
};

type Lang = "en" | "ur";

const HELLO_REPLY = "Hello!";
const WALAIKUM_REPLY = "Walaikum Assalam!";
const NAMASTE_REPLY = "Namaste!";
const SATSRIAKAL_REPLY = "Sat Sri Akal!";
const ARABIC_GREETING_REPLY = "Marhaba!";
// Rotation pool for the "confused" fallback - Muhammad wants his approved
// wording to be one of several variations picked at random, not the only
// one, so more can be added here once approved without touching the
// function itself.
const CONFUSED_REPLIES_EN: string[] = [
  "We have received your question. A Team Member will contact you shortly.\n\nThanks!",
];
const CONFUSED_REPLIES_UR: string[] = [
  "Apka sawaal mausool ho chuka ha. Jald hamara numainda apse raabta kre ga.\n\nShukriya!",
];

// Every prompt in the flow needs both languages. Until 2026-08-23 the four
// button/card senders below took a plain English string and all fifteen call
// sites passed English, so a customer who picked Roman Urdu got the greeting
// and menu in Urdu and then the entire rest of the funnel in English. Muhammad's
// wife found this in five minutes of real testing. Taking both languages as
// separate arguments means a new prompt cannot be added without writing both.
function t(lang: Lang, en: string, ur: string): string {
  return lang === "ur" ? ur : en;
}

function confusedReply(lang: Lang): string {
  const pool = lang === "ur" ? CONFUSED_REPLIES_UR : CONFUSED_REPLIES_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

function faqText(lang: Lang): string {
  if (lang === "ur") {
    return `Mukhtasar FAQs:\n\n• Kya $250 course waqai free hai? Haan, hamare partner broker ke saath $500 deposit karein, course khud unlock ho jayega.\n• Kya main $500 se kam deposit kar sakta hoon? Minimum $500 hai. Agar pehle se kam hai to top up kar lein, upar ki koi limit nahi hai.\n• Kya mera deposit mahfooz hai? Haan, ye aapke apne broker account mein rehta hai; Badar Trader kabhi khud payment nahi leta.\n• Withdraw kaise karoon? Seedha apne broker account se, kabhi bhi, hamari taraf se koi rok nahi.\n• Aur madad chahiye? "Talk to an Agent" chunein, hamari team se baat karein.`;
  }
  return `Quick FAQs:\n\n• Is the $250 course really free? Yes, deposit $500 with our partner broker and it unlocks automatically.\n• Can I deposit less than $500? The minimum is $500. If you already have less deposited, just top it up, there's no upper limit either.\n• Is my deposit safe? Yes, it stays in your own broker account; Badar Trader never collects payments directly.\n• How do I withdraw? Directly from your broker account, anytime, no restrictions from us.\n• Need more help? Choose "Talk to an Agent" to reach our team.`;
}

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // Cleared per request on purpose. Edge Functions reuse a warm isolate between
  // invocations, so a cache left populated would keep serving whatever the gates
  // said on the first message this instance handled - meaning a toggle flipped
  // in Bot Manager might not take effect for minutes, or until the instance
  // recycled. For a control whose whole purpose is stopping the bot quickly,
  // stale is the one thing it must never be. One small query per message is a
  // fair price for a stop button that actually stops.
  _gateCache = null;

  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    // Meta signs the exact bytes received, so verify before decoding or parsing.
    let rawBody: Uint8Array;
    let signature: { allowed: boolean; verified: boolean; reason: string };
    try {
      ({ rawBody, signature } = await readAndVerifyMetaRequest(req, {
        appSecret: META_APP_SECRET,
        enforced: META_SIGNATURE_ENFORCED,
      }));
    } catch (err) {
      console.error("WhatsApp webhook: could not read request body:", err);
      return new Response("OK", { status: 200 });
    }

    if (!signature.allowed) {
      console.error(`WhatsApp webhook: rejected unverified request - ${signature.reason}`);
      return new Response("Invalid signature", { status: 401 });
    }
    if (META_APP_SECRET) console.log(`WhatsApp webhook signature: ${signature.reason}`);

    try {
      const body = JSON.parse(new TextDecoder().decode(rawBody));
      await handleIncomingMessage(body);
    } catch (err) {
      console.error("Error processing WhatsApp webhook payload:", err);
    }
    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function handleIncomingMessage(payload: unknown): Promise<void> {
  const entries = (payload as any)?.entry ?? [];

  for (const entry of entries) {
    const changes = entry?.changes ?? [];

    for (const change of changes) {
      // This webhook is subscribed per WABA, not per number, so an event for
      // 3903 (which shares a WABA with this CRM's number) can physically
      // arrive here. Reject anything that is not explicitly the configured
      // CRM number before reading a single field out of it - no DB read, no
      // DB write, no reply attempt for a mismatched or unconfigured id.
      const incomingPhoneNumberId: string = change?.value?.metadata?.phone_number_id ?? "";
      const { phoneId: expectedPhoneNumberId } = await getWaCredentials();

      if (!isAllowedPhoneNumberId(incomingPhoneNumberId, expectedPhoneNumberId)) {
        console.error(
          `WhatsApp webhook: rejected event for phone_number_id "${incomingPhoneNumberId || "(missing)"}" - ` +
            `does not match the configured CRM number "${expectedPhoneNumberId || "(not configured)"}". No data was read or written.`,
        );
        continue;
      }

      const messages: any[] = change?.value?.messages ?? [];
      const contacts: any[] = change?.value?.contacts ?? [];
      const statuses: any[] = change?.value?.statuses ?? [];

      for (const status of statuses) {
        const recipientPhone = normalisePhone(status.recipient_id ?? "");
        const statusType: string = status.status ?? "unknown";
        const errorInfo: string | null = status.errors?.length
          ? status.errors
              .map((e: any) => `${e.code}: ${e.title}${e.error_data?.details ? " - " + e.error_data.details : ""}`)
              .join("; ")
          : null;

        console.log(`WhatsApp status update for ${recipientPhone}: ${statusType}${errorInfo ? ` (${errorInfo})` : ""}`);

        // Record the state against the message it belongs to (catalog B3/B4).
        // status.id is Meta's wamid, the same value communications.wa_message_id
        // has stored on both directions since Phase 13.
        if (status.id) {
          await recordDeliveryStatus(makeSupabase(), String(status.id), statusType);
        }

        if (statusType === "failed" && recipientPhone) {
          const sb = makeSupabase();
          const { data: lead } = await sb.from("leads").select("id").eq("phone", recipientPhone).maybeSingle();
          if (lead) {
            await insertCommunication(
              sb,
              lead.id,
              "outbound",
              `[DELIVERY FAILED: ${errorInfo ?? "no error detail from Meta"}]`,
              new Date().toISOString(),
            );
          }
        }
      }

      for (const message of messages) {
        const senderPhone: string = normalisePhone(message.from ?? "");
        const timestamp: string   = message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        if (!senderPhone) {
          console.error("Message has no sender phone number - skipping.");
          continue;
        }

        const contactName: string =
          contacts.find((c: any) => c.wa_id === message.from)?.profile?.name ??
          senderPhone;

        // Blue double-tick on the customer's side, same as any real WhatsApp
        // reply - Muhammad asked for this so the customer knows someone (the
        // bot) has actually seen their message. Fired in the background, not
        // awaited: it's cosmetic for the customer and must never add latency
        // to the bot's actual reply.
        if (message.id) markAsRead(message.id).catch((err) => console.error("markAsRead failed:", err));

        const sb = makeSupabase();

        // Resolve the reply gates before anything downstream can send. The send
        // helpers read this cache synchronously, so filling it here is what makes
        // gateOpenSync() truthful rather than a guess at the defaults.
        await loadGates(sb);

        const agent = (await getAgentRotation(sb)).find((a) => normalisePhone(a.phone) === senderPhone);

        if (message.type === "image") {
          if (agent) {
            console.log(`Image from agent ${agent.name} - ignoring (agents aren't processed as leads).`);
            continue;
          }
          await handleImageMessage(sb, message, senderPhone, contactName, timestamp);
          continue;
        }

        const input = extractUserInput(message);
        if (!input) {
          // This used to log and continue, which meant a voice note, PDF,
          // video, sticker, location or contact card produced NO row at all -
          // the agent never saw that anything had arrived. Record a readable
          // placeholder instead, so the conversation stays honest.
          //
          // The bot flow is deliberately not run for these: there is no text
          // to interpret, and guessing would be worse than staying quiet.
          // Nothing is sent to the customer here either.
          if (agent) {
            console.log(`Unsupported type "${message.type}" from agent ${agent.name} - ignoring (agents aren't processed as leads).`);
            continue;
          }
          await recordUnsupportedMessage(sb, message, senderPhone, contactName, timestamp);
          continue;
        }

        console.log(`Incoming WhatsApp from ${senderPhone}: "${input.text}"`);

        if (agent) {
          await handleAgentReply(sb, agent, input);
          continue;
        }

        const { lead, wasCreated } = await upsertLead(sb, senderPhone, contactName, timestamp);
        if (!lead) continue;

        // Idle-time checks (handoff auto-expiry, 24h stage restarts) need the
        // customer's actual last message time, not lead.updated_at - that
        // column is bumped by ANY write to the row (an agent just opening the
        // conversation flips is_unread, which touches updated_at via the
        // leads_updated_at trigger), so it silently resets on CRM activity
        // that has nothing to do with the conversation going stale. Read it
        // before the inbound insert below so this always reflects the PRIOR
        // message, never the one being logged in this same request.
        const lastCustomerTouch = wasCreated ? null : await getLastInboundAt(sb, lead.id);

        // Found live, 25 Aug 2026 (Ehsan's test conversation, in front of
        // Badar): a customer typing their funnel answer as free text ("Roman
        // Urdu" in reply to the language card) instead of tapping the button
        // could get "helpfully" intercepted by tryKeywordReply/tryAIReply
        // below, which have no idea a specific answer was expected. The reply
        // sounded fine, but bot_stage never advanced - lead cb765744 was still
        // sitting at awaiting_language many turns and several real AI answers
        // later. The AI kept answering the customer's OTHER questions
        // correctly the whole time, which is exactly what hid this: nothing
        // looked broken until a question the AI couldn't answer fell through
        // to the frozen state machine, which reprompted the (long-stale)
        // language card mid-conversation, out of nowhere. A brand new lead's
        // very first message has the same exposure (their greeting could be
        // "answered" by the AI instead of ever sending the language card at
        // all), so both cases route through the funnel first: keyword/AI only
        // ever gets a message the funnel isn't currently expecting a specific
        // answer to.
        const isStageAnswer = wasCreated || matchesCurrentStage(lead, input);

        // Logging the inbound message doesn't need to finish before the bot
        // can respond - neither depends on the other's result, so they run
        // concurrently instead of adding the log write's time to the delay
        // before the customer sees a reply.
        // A keyword rule, when one matches, answers INSTEAD of the funnel step,
        // never as well as it - otherwise the customer would get two replies to
        // one message. Returns null when the feature is off or nothing matched,
        // which is the normal path today. AI is checked second, only when no
        // keyword rule fired - a specific rule match is more deterministic and
        // intentional than an LLM's judgment call, so it wins when both apply.
        const keywordResult = isStageAnswer ? null : await tryKeywordReply(sb, lead, input);
        const aiResult = (isStageAnswer || keywordResult) ? null : await tryAIReply(sb, lead, input);
        const replyResult = keywordResult || aiResult;

        await Promise.all([
          insertCommunication(sb, lead.id, "inbound", input.text, timestamp, undefined, message.id),
          replyResult
            ? insertCommunication(sb, lead.id, "outbound", combineSendLog(replyResult), timestamp)
            : runBotStep(sb, lead, wasCreated, input, lastCustomerTouch),
        ]);
      }
    }
  }
}

type UserInput = { text: string; selectionId: string | null };

function extractUserInput(message: any): UserInput | null {
  if (message.type === "text") {
    return { text: message.text?.body ?? "", selectionId: null };
  }
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return {
      text: message.interactive.button_reply?.title ?? "",
      selectionId: message.interactive.button_reply?.id ?? null,
    };
  }
  if (message.type === "interactive" && message.interactive?.type === "list_reply") {
    return {
      text: message.interactive.list_reply?.title ?? "",
      selectionId: message.interactive.list_reply?.id ?? null,
    };
  }
  return null;
}

// last_notified_at drives the per-agent notification cooldown. Optional because
// AGENT_ROTATION_FALLBACK below is a hardcoded degraded list with no database
// row behind it, and a fallback agent has simply never been notified.
type RotationAgent = { id: string; name: string; phone: string; last_notified_at?: string | null };

// Agent numbers live in profiles.phone now, not here. This list is only what
// the function used to hardcode, kept purely as a fallback: if the database
// read fails, degrading to the old two-agent behaviour is far better than the
// alternative failure mode, which is failing to recognise a staff member and
// creating them as a new customer lead.
const AGENT_ROTATION_FALLBACK: RotationAgent[] = [
  { id: "9bfb2f92-658b-4868-90b9-dd041515d111", name: "Ehsan Wazir", phone: "923342224925" },
  { id: "2bc20292-76bb-467b-a2a1-7bfa0cad4421", name: "Muhammad Hanzala", phone: "923235163874" },
];
const ROTATION_BATCH_SIZE = 10;

// Cached for the life of this function instance, which is short, so a batch of
// messages does not re-query per message while never going stale for long.
let _rotationCache: RotationAgent[] | null = null;

// Ordered by created_at so the round-robin index is stable across invocations.
// Only agents who are active, not suspended, and actually have a number can be
// in rotation - assigning a lead to someone unreachable is worse than skipping
// them.
async function getAgentRotation(sb: SupabaseClient): Promise<RotationAgent[]> {
  if (_rotationCache) return _rotationCache;

  const { data, error } = await sb
    .from("profiles")
    .select("id, full_name, phone, last_notified_at")
    .eq("role", "agent")
    .eq("is_active", true)
    .eq("is_suspended", false)
    // Observers keep full access but are not in the sales rotation, so the bot
    // must not hand them escalated leads either - otherwise the frontend and
    // the webhook would disagree about who is on rotation.
    .eq("receives_leads", true)
    .not("phone", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getAgentRotation: database read failed, using fallback list -", error.message);
    return AGENT_ROTATION_FALLBACK;
  }

  const rows: RotationAgent[] = (data ?? [])
    .map((p: any) => ({
      id: p.id,
      name: (p.full_name || "").trim() || "Agent",
      phone: String(p.phone || "").trim(),
    }))
    .filter((a) => a.phone.length > 0);

  if (!rows.length) {
    console.error("getAgentRotation: no active agent has a phone set, using fallback list");
    return AGENT_ROTATION_FALLBACK;
  }

  _rotationCache = rows;
  return rows;
}

async function assignAgentRoundRobin(sb: SupabaseClient): Promise<RotationAgent> {
  const rotation = await getAgentRotation(sb);
  const { count } = await sb.from("leads").select("id", { count: "exact", head: true });
  const totalLeads = count ?? 1;
  const agentIndex = Math.floor((totalLeads - 1) / ROTATION_BATCH_SIZE) % rotation.length;
  return rotation[agentIndex];
}

async function upsertLead(
  sb: SupabaseClient,
  phone: string,
  name: string,
  timestamp: string,
): Promise<{ lead: any | null; wasCreated: boolean }> {
  const { data: existing, error: selectError } = await sb
    .from("leads")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (selectError) {
    console.error("Error querying leads table:", selectError.message);
    return { lead: null, wasCreated: false };
  }

  if (existing) {
    // Nothing downstream reads is_unread before responding to the customer -
    // this was a full extra DB round-trip (~150-300ms to the project's
    // ap-northeast-1 region) sitting in the critical path of every single
    // message from a returning lead, the most common case by far. Same
    // background pattern already used for agent notification below.
    const markUnread = sb.from("leads").update({ is_unread: true }).eq("id", existing.id).then(
      ({ error }) => { if (error) console.error("Error marking lead unread:", error.message); },
    );
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
    if (waitUntil) waitUntil(markUnread);
    else Promise.resolve(markUnread).catch((err: unknown) => console.error("markUnread failed:", err));
    return { lead: existing, wasCreated: false };
  }

  const { data: newLead, error: insertError } = await sb
    .from("leads")
    .insert({
      full_name:  name,
      phone:      phone,
      source:     "meta",
      status:     "new",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("Error inserting lead:", insertError.message);
    return { lead: null, wasCreated: false };
  }

  console.log(`New lead created: ${newLead.id}`);

  // Agent assignment (round-robin count + update) and the notification below
  // both run in the background, not awaited here - nothing the customer
  // sees (the greeting in runBotStep) depends on assigned_agent_id, so
  // there's no reason to make them wait on it. Shaves a full round-robin
  // count query plus an update off the delay before the greeting goes out.
  const notifyAgent = (async () => {
    const agent = await assignAgentRoundRobin(sb);
    await sb.from("leads").update({ assigned_agent_id: agent.id }).eq("id", newLead.id);

    if (!NEW_LEAD_NOTIFICATIONS_ENABLED) {
      await insertCommunication(
        sb,
        newLead.id,
        "outbound",
        `[assigned to ${agent.name}, notification disabled - Muhammad, 21 July 2026]`,
        new Date().toISOString(),
      );
      return;
    }
    // This is the path that flooded agents in July, and it is the one being
    // switched back on - so it goes through the same rules, with the test
    // allowlist applied so a trial cannot reach a real agent's phone.
    const decision = shouldNotifyAgent({
      agentPhone: agent.phone,
      leadAlreadyNotified: false, // brand new lead, nobody has been told yet
      agentLastNotifiedAt: agent.last_notified_at ?? null,
      cooldownMinutes: AGENT_NOTIFY_COOLDOWN_MINUTES,
      testNumbers: AGENT_NOTIFY_TEST_NUMBERS,
    });
    if (!decision.notify) {
      await insertCommunication(
        sb,
        newLead.id,
        "outbound",
        `[assigned to ${agent.name}, NOT notified - ${decision.reason}]`,
        new Date().toISOString(),
      );
      return;
    }
    const pingResult = await sendButtons(
      agent.phone,
      `A new lead is waiting for you in the CRM. Please follow up.`,
      [{ id: `ack_${newLead.id}`, title: "I've got this" }],
    );
    const nowIso = new Date().toISOString();
    await Promise.all([
      sb.from("leads").update({
        agent_ping_count: 1,
        agent_last_pinged_at: nowIso,
      }).eq("id", newLead.id),
      sb.from("profiles").update({ last_notified_at: nowIso }).eq("id", agent.id),
    ]);
    await insertCommunication(
      sb,
      newLead.id,
      "outbound",
      pingResult.ok
        ? `[assigned to ${agent.name}, notified]`
        : `[assigned to ${agent.name}, notification SEND FAILED - ${pingResult.error}]`,
      nowIso,
    );
  })();
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (waitUntil) {
    waitUntil(notifyAgent);
  } else {
    notifyAgent.catch((err) => console.error("Agent notify failed:", err));
  }

  return { lead: newLead, wasCreated: true };
}

// Delivery ticks (catalog B3/B4). Meta reports sent -> delivered -> read for
// every outbound message, but does NOT guarantee the callbacks arrive in that
// order, and it re-sends them. So this only ever moves a message forward:
// a late "delivered" can never undo a "read" already recorded.
const DELIVERY_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

async function recordDeliveryStatus(
  sb: SupabaseClient,
  waMessageId: string,
  statusType: string,
): Promise<void> {
  // "failed" is not part of the ladder and always wins - a message that failed
  // did not arrive, and that matters more than how far it had got. It is also
  // sticky: because "failed" is absent from DELIVERY_RANK it never appears in
  // the lower-ranked list below, so no later callback can overwrite it.
  if (statusType === "failed") {
    const { error } = await sb
      .from("communications")
      .update({ delivery_status: "failed" })
      .eq("wa_message_id", waMessageId);
    if (error) console.error("recordDeliveryStatus (failed):", error.message);
    return;
  }

  const rank = DELIVERY_RANK[statusType];
  if (!rank) {
    // Meta has added status values before ("deleted"). Ignore rather than
    // store, so an unrecognised value can never clobber a real "read".
    console.log(`recordDeliveryStatus: ignoring unknown status "${statusType}"`);
    return;
  }

  const lowerRanked = Object.keys(DELIVERY_RANK).filter((s) => DELIVERY_RANK[s] < rank);

  let query = sb
    .from("communications")
    .update({ delivery_status: statusType })
    .eq("wa_message_id", waMessageId);

  // Only overwrite a row that has no status yet, or one sitting at a lower
  // rung. Done as part of the UPDATE's WHERE rather than read-then-write, so
  // two callbacks racing cannot both decide they are the newer one.
  query = lowerRanked.length
    ? query.or(`delivery_status.is.null,delivery_status.in.(${lowerRanked.join(",")})`)
    : query.is("delivery_status", null);

  const { error } = await query;
  if (error) console.error(`recordDeliveryStatus (${statusType}):`, error.message);
}

async function insertCommunication(
  sb: SupabaseClient,
  leadId: string,
  direction: "inbound" | "outbound",
  body: string,
  timestamp: string,
  attachmentPath?: string,
  waMessageId?: string,
): Promise<void> {
  const { error } = await sb.from("communications").insert({
    lead_id:         leadId,
    type:            "whatsapp",
    direction:       direction,
    body:            body,
    created_at:      timestamp,
    attachment_path: attachmentPath ?? null,
    wa_message_id:   waMessageId ?? null,
  });

  if (error) {
    console.error("Error inserting communication:", error.message);
  }
}

// Turns an inbound message we cannot interpret into one short readable line an
// agent can understand at a glance. Square brackets match the convention the
// image handler and the delivery-failure notes already use, so these read as
// system descriptions rather than as something the customer typed.
function describeUnsupportedMessage(message: any): string {
  const type = String(message?.type ?? "unknown");

  // Captions are real content the customer wrote, so they are worth keeping.
  // Capped so one pathological caption cannot dominate the inbox preview.
  const rawCaption = String(message?.[type]?.caption ?? "").trim();
  const caption = rawCaption.length > 500 ? rawCaption.slice(0, 500) + "…" : rawCaption;
  const withCaption = (label: string) => (caption ? `${label} ${caption}` : label);

  switch (type) {
    case "audio":
      return message.audio?.voice ? "[voice note]" : "[audio file]";
    case "video":
      return withCaption("[video]");
    case "document": {
      const name = String(message.document?.filename ?? "").trim();
      return withCaption(name ? `[document: ${name}]` : "[document]");
    }
    case "sticker":
      return "[sticker]";
    case "location": {
      const loc = message.location ?? {};
      const place = String(loc.name ?? loc.address ?? "").trim();
      if (place) return `[location: ${place}]`;
      if (loc.latitude != null && loc.longitude != null) {
        return `[location: ${loc.latitude}, ${loc.longitude}]`;
      }
      return "[location]";
    }
    case "contacts": {
      const names = (message.contacts ?? [])
        .map((c: any) => String(c?.name?.formatted_name ?? "").trim())
        .filter(Boolean);
      return names.length ? `[contact card: ${names.join(", ")}]` : "[contact card]";
    }
    case "button":
      // Quick-reply button on a template. extractUserInput only understands
      // the newer "interactive" reply shapes, not this older one.
      return `[button reply: ${String(message.button?.text ?? "").trim() || "no label"}]`;
    default:
      return `[unsupported message type: ${type}]`;
  }
}

// Records an inbound message the bot cannot act on, so the agent at least sees
// that something arrived. Media is NOT downloaded or stored - that is a larger
// follow-on needing per-type storage handling; this only makes the arrival
// visible. Nothing is sent to the customer from here.
async function recordUnsupportedMessage(
  sb: SupabaseClient,
  message: any,
  senderPhone: string,
  contactName: string,
  timestamp: string,
): Promise<void> {
  // upsertLead also flips is_unread, so the conversation surfaces in the
  // inbox's Unread filter the same way a normal inbound message would.
  const { lead } = await upsertLead(sb, senderPhone, contactName, timestamp);
  if (!lead) {
    console.error(
      `recordUnsupportedMessage: could not upsert lead for ${senderPhone} - a "${message?.type}" message is being lost.`,
    );
    return;
  }

  // Fetch the file itself where there is one, so the agent can actually open
  // it rather than only seeing that it arrived. Failure is NOT fatal: the row
  // is written either way, with the reason appended, because a visible
  // "[voice note] (file could not be stored: ...)" is far better than the
  // message vanishing - which is the bug this whole path exists to fix.
  const mediaId = mediaIdOf(message);
  let storedPath: string | undefined;
  let storeNote = "";
  if (mediaId) {
    const stored = await downloadAndStoreMedia(sb, mediaId, lead.id);
    if (stored.ok) {
      storedPath = stored.path;
    } else {
      storeNote = ` (file could not be stored: ${stored.error})`;
      console.error(`recordUnsupportedMessage: media ${mediaId} not stored - ${stored.error}`);
    }
  }

  const body = describeUnsupportedMessage(message) + storeNote;
  console.log(`Recorded unsupported inbound from ${senderPhone}: ${body}`);
  await insertCommunication(sb, lead.id, "inbound", body, timestamp, storedPath, message?.id);
}

async function handleImageMessage(
  sb: SupabaseClient,
  message: any,
  senderPhone: string,
  contactName: string,
  timestamp: string,
): Promise<void> {
  const { lead } = await upsertLead(sb, senderPhone, contactName, timestamp);
  if (!lead) return;

  const to = senderPhone.replace(/^\+/, "");
  const mediaId: string | undefined = message.image?.id;

  if (!mediaId) {
    await insertCommunication(sb, lead.id, "inbound", "[image received - no media ID in payload]", timestamp);
    return;
  }

  const stored = await downloadAndStoreMedia(sb, mediaId, lead.id);
  await insertCommunication(
    sb,
    lead.id,
    "inbound",
    stored.ok ? "[deposit screenshot received]" : `[image received - FAILED to store: ${stored.error}]`,
    timestamp,
    stored.ok ? stored.path : undefined,
    message.id,
  );

  // Handed over through escalate() rather than a bare ack plus a conditional
  // ping, fixed 2026-08-20 (Junaid). The ping used to fire only when the lead
  // already had an assigned agent, so an unassigned lead sending the one
  // signal that actually means "I have closed" produced no notification, no
  // needs_human flag and no assignment: exactly the hole escalate()'s own
  // comment records as having left Izza invisible for 10+ days. escalate()
  // assigns round-robin when nobody owns the lead, flags it, notifies the
  // owner and writes the context line, all in one path. The customer-facing
  // text is unchanged, passed as the message override so this stays one
  // outbound message.
  await escalate(
    sb,
    lead,
    to,
    "sent a deposit screenshot",
    "Got it. Your deposit screenshot has been received, our team will confirm it shortly.",
  );
}

// WhatsApp permits documents up to 100MB. This function buffers the whole
// file in memory twice (download, then upload), so anything near that would
// risk the function itself. 20MB comfortably covers receipts, voice notes and
// short clips, which is what actually arrives here.
const MAX_STORED_MEDIA_BYTES = 20 * 1024 * 1024;

// Every media-bearing inbound type keeps its id under a key named after the
// type. Location and contacts carry no file at all.
function mediaIdOf(message: any): string | null {
  const type = String(message?.type ?? "");
  if (!["audio", "video", "document", "sticker", "image"].includes(type)) return null;
  const id = message?.[type]?.id;
  return id ? String(id) : null;
}

async function downloadAndStoreMedia(
  sb: SupabaseClient,
  mediaId: string,
  leadId: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { token } = await getWaCredentials();
  if (!token) return { ok: false, error: "no WhatsApp access token available" };

  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!metaRes.ok) return { ok: false, error: `media lookup failed: HTTP ${metaRes.status}` };
    const meta = await metaRes.json();
    const mediaUrl: string = meta.url;
    const mimeType: string = (meta.mime_type ?? "image/jpeg").split(";")[0];

    // Size guard. This used to handle only images, which WhatsApp caps at 5MB,
    // so there was nothing to guard. It now also handles documents and video,
    // which WhatsApp allows up to 100MB - the whole file is held in memory
    // here and again on upload, so a large one could take the function down
    // for every other inbound message, not just this one. Meta reports the
    // size in the lookup above, so it can be refused before downloading.
    const fileSize = Number(meta.file_size ?? 0);
    if (fileSize > MAX_STORED_MEDIA_BYTES) {
      return {
        ok: false,
        error: `file is ${(fileSize / 1024 / 1024).toFixed(1)}MB, over the ${MAX_STORED_MEDIA_BYTES / 1024 / 1024}MB storage limit`,
      };
    }

    const fileRes = await fetch(mediaUrl, { headers: { "Authorization": `Bearer ${token}` } });
    if (!fileRes.ok) return { ok: false, error: `media download failed: HTTP ${fileRes.status}` };
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    const ext = mimeType.split("/")[1] ?? "jpg";
    const path = `${leadId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage.from("deposit-screenshots").upload(path, bytes, { contentType: mimeType });
    if (uploadError) return { ok: false, error: uploadError.message };

    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Reads the keyword_replies table the CRM's "Create Flow" tab writes to.
// Returns the send result when a rule matched and a reply was attempted, or
// null when nothing matched (in which case the normal bot step runs instead).
//
// Match semantics are kept identical to what the CRM UI promises in its
// dropdown: contains / exact / starts_with, all case-insensitive.
async function tryKeywordReply(
  sb: SupabaseClient,
  lead: any,
  input: UserInput,
): Promise<SendResult | null> {
  if (!(await gateOpen(sb, "KEYWORD_REPLIES_ENABLED"))) return null;

  // A human has taken over this conversation - stay silent, same rule the
  // rest of the bot follows. Never talk over an agent.
  if (lead.needs_human) return null;

  const text = (input.text || "").trim();
  if (!text) return null;

  const { data, error } = await sb
    .from("keyword_replies")
    .select("keyword, match_type, reply_message")
    .eq("is_active", true);

  // Table missing or unreadable must never break inbound handling - fall
  // through to the normal bot step rather than dropping the message.
  if (error) {
    console.error("tryKeywordReply: could not read keyword_replies:", error.message);
    return null;
  }
  if (!data || !data.length) return null;

  const lower = text.toLowerCase();
  const match = data.find((r: any) => {
    const k = (r.keyword || "").toLowerCase().trim();
    if (!k) return false;
    if (r.match_type === "exact")       return lower === k;
    if (r.match_type === "starts_with") return lower.startsWith(k);
    return lower.includes(k);
  });
  if (!match) return null;

  const to = lead.phone.replace(/^\+/, "");
  return await sendKeywordText(to, match.reply_message);
}

async function getOpenAIKey(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", "openai_api_key").maybeSingle();
  return (data?.value || "").trim();
}

// Defaults to the model this function has always called, so leaving
// settings.openai_model unset changes nothing - only an explicit save from
// the Train AI tab's model picker overrides it.
async function getOpenAIModel(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", "openai_model").maybeSingle();
  return (data?.value || "").trim() || "gpt-4o-mini";
}

// Real AI reply path (2026-08-04 prep work). Same silent-fallthrough shape
// as tryKeywordReply - any missing piece (flag, table, key, empty model
// output) falls through to the normal bot step, never breaks inbound
// handling. Checked after keyword replies, not before: a specific rule
// match is more deterministic and intentional than an LLM's judgment call,
// so it should win when both could apply.
async function tryAIReply(sb: SupabaseClient, lead: any, input: UserInput): Promise<SendResult | null> {
  if (!(await gateOpen(sb, "AI_REPLIES_ENABLED"))) return null;
  if (lead.needs_human) return null;

  const text = (input.text || "").trim();
  if (!text) return null;

  const { data: campaigns, error } = await sb
    .from("ai_knowledge_base")
    .select("system_prompt, knowledge_notes")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("tryAIReply: could not read ai_knowledge_base:", error.message);
    return null;
  }
  if (!campaigns || !campaigns.length) return null;
  const campaign = campaigns[0];

  const apiKey = await getOpenAIKey(sb);
  if (!apiKey) {
    console.error("tryAIReply: AI_REPLIES_ENABLED is true but settings.openai_api_key is not set");
    return null;
  }
  const model = await getOpenAIModel(sb);

  const systemPrompt = campaign.knowledge_notes
    ? `${campaign.system_prompt}\n\nKnowledge notes:\n${campaign.knowledge_notes}`
    : campaign.system_prompt;

  let reply = "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        // Found 2026-08-25 via a real live test that got no answer at all:
        // `max_tokens` is rejected outright by reasoning models (gpt-5-mini,
        // the configured default) with a 400 - they require
        // `max_completion_tokens`. That alone still wasn't enough: a
        // reasoning model spends part of this budget on hidden reasoning
        // tokens before it ever writes a visible reply, so the old budget of
        // 300 was entirely consumed by reasoning, every single time, leaving
        // zero tokens for the actual answer (confirmed directly against
        // OpenAI's API with the real system prompt - 300 produced empty
        // content 100% of the time, 1000 reliably left enough room for both).
        max_completion_tokens: 1000,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("tryAIReply: OpenAI call failed:", res.status, errBody.slice(0, 300));
      return null;
    }
    const json = await res.json();
    reply = (json?.choices?.[0]?.message?.content || "").trim();
    if (!reply) return null;
  } catch (e) {
    console.error("tryAIReply: exception calling OpenAI:", e instanceof Error ? e.message : String(e));
    return null;
  }

  const to = lead.phone.replace(/^\+/, "");
  return await sendAIText(to, reply);
}

async function getLastInboundAt(sb: SupabaseClient, leadId: string): Promise<string | null> {
  const { data } = await sb.from("communications")
    .select("created_at")
    .eq("lead_id", leadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

async function runBotStep(
  sb: SupabaseClient,
  lead: any,
  wasCreated: boolean,
  input: UserInput,
  lastCustomerTouch: string | null,
): Promise<void> {
  const to = lead.phone.replace(/^\+/, "");

  // Handoff behaviour:
  //  - Explicit "talk to an agent" requests keep the bot silent (human owns it).
  //  - Confusion/inactivity handoffs auto-expire: a lead returning after a gap
  //    has the flag cleared and resumes the flow from their current stage, so a
  //    lead who got stuck once (and whom no agent answered) is never left mute.
  //
  // lastCustomerTouch (the prior inbound message's timestamp) is used here
  // instead of lead.updated_at deliberately - updated_at is bumped by ANY
  // write to the lead row (an agent opening the conversation, a note, a tag),
  // not just real customer messages, which silently reset every idle-time
  // check below whenever the CRM was merely looked at.
  const lastTouch = new Date(lastCustomerTouch ?? lead.created_at ?? Date.now()).getTime();
  const returningAfterGap = (Date.now() - lastTouch) / 3600000 >= HANDOFF_STALE_HOURS;

  if (lead.needs_human) {
    if (isPermanentHandoff(lead.handoff_reason) || !returningAfterGap) return;
    await sb.from("leads").update({ needs_human: false, handoff_reason: null, retry_count: 0 }).eq("id", lead.id);
    lead.needs_human = false;
    lead.retry_count = 0;
  }

  // A returning lead's old near-limit retry count shouldn't instantly re-escalate
  // them on the first message back - give the resumed flow a fresh count.
  if (returningAfterGap && (lead.retry_count ?? 0) > 0) {
    await sb.from("leads").update({ retry_count: 0 }).eq("id", lead.id);
    lead.retry_count = 0;
  }

  if (wasCreated) {
    const greeting = matchGreeting(input) ?? "hello";
    // Sequential, not parallel - a brand new customer's very first message
    // is the worst possible place for a delivery-order gamble. Sending both
    // at once shaved a little latency but Meta could (and, reported live,
    // did) deliver the language card before the greeting text, reading as
    // the bot answering out of order. Guaranteed order matters far more
    // here than the small time saved.
    const r1 = await sendText(to, greetingReplyText(greeting));
    const r2 = await sendLanguageCard(to);
    await logOutbound(sb, lead.id, combineSendLog(r1, r2));
    return;
  }

  const lang: Lang = lead.language === "ur" ? "ur" : "en";

  // A lead abandoned mid-flow (never explicitly declined, just went quiet)
  // has no restart rule today - only "declined" gets one. Anyone returning
  // to any of these stages after a long gap has their new message
  // misinterpreted as an answer to whatever question they left hanging,
  // days or weeks ago, which reads as the bot behaving inconsistently
  // between a fresh number and one with old test/lead history. Same
  // restart shape as the declined-lead rule below, just covering every
  // abandonable mid-flow stage instead of only one.
  //
  // input.selectionId is only ever set when the customer tapped a REAL
  // button/list option still on their screen (never for typed free text) -
  // that is always intentional and tied to the exact stage they're in, so
  // it must never be discarded as "stale." Found live, 22 July 2026: M
  // Junaid tapped "FAQs" on a >24h-old Main Menu card and the bot restarted
  // him to the greeting instead of answering, because this check didn't
  // distinguish a real tap from ambiguous typed text.
  const MIDFLOW_RESTART_STAGES = [
    "awaiting_menu", "awaiting_trader_status", "awaiting_broker",
    "awaiting_broker_existing", "awaiting_experience",
    "awaiting_traded_before", "awaiting_deposit_confirm", "qualified",
  ];
  const hoursIdle = (Date.now() - lastTouch) / 3600000;
  if (!wasCreated && !input.selectionId && MIDFLOW_RESTART_STAGES.includes(lead.bot_stage) && hoursIdle >= DECLINED_RESTART_HOURS) {
    await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
    const greeting = matchGreeting(input) ?? "hello";
    // Sequential - same fix as the wasCreated path above, guaranteed order.
    const r1 = await sendText(to, greetingReplyText(greeting));
    const r2 = await sendLanguageCard(to);
    await logOutbound(sb, lead.id, `[Stale mid-flow lead, was ${lead.bot_stage}, restarted after 24h+]\n${combineSendLog(r1, r2)}`);
    return;
  }

  // A mistaken tap (wrong broker, wrong experience level, etc.) previously
  // had no way back - the lead was stuck re-answering the current question
  // or had to be manually reset. bot_stage_history is a stack of every stage
  // this lead has moved forward through; "Back" pops one level and re-sends
  // that stage's prompt, undoing whatever field that stage's forward
  // transition had already saved (see goBack).
  if (matchNavBack(input) && (lead.bot_stage_history?.length ?? 0) > 0) {
    await goBack(sb, lead, to, lang);
    return;
  }

  switch (lead.bot_stage) {
    case "awaiting_language": {
      const chosen = matchLanguage(input);
      if (!chosen) {
        await handleUnmatched(sb, lead, to, input, 3, "language choice", () => sendLanguageCard(to));
        return;
      }
      await advanceStage(sb, lead, "awaiting_menu", { language: chosen });
      const rMenu = await sendMainMenuCard(to, chosen);
      await logOutbound(sb, lead.id, combineSendLog(rMenu));
      return;
    }

    case "awaiting_menu": {
      const choice = matchMenuChoice(input);
      if (!choice) {
        await handleUnmatched(sb, lead, to, input, 3, "main menu choice", () => sendMainMenuCard(to, lang));
        return;
      }

      if (choice === "start_trading") {
        // BOX 3: ask new-or-existing BEFORE broker choice, so someone who
        // already has a live Exness/XM account skips straight to the deposit
        // step instead of being walked through opening an account they have.
        await advanceStage(sb, lead, "awaiting_trader_status");
        const r = await sendTraderStatusButtons(to, t(lang, "Have you already opened a trading account with Exness or XM, or would this be your first time?", "Kya aap ka Exness ya XM par pehle se trading account hai, ya ye aap ki pehli baar hai?"), lang);
        await logOutbound(sb, lead.id, combineSendLog(r));
        return;
      }

      if (choice === "free_signals") {
        await sb.from("leads").update({ bot_stage: "declined", retry_count: 0 }).eq("id", lead.id);
        await escalate(sb, lead, to, "requested human agent for Premium Signalling Group");
        return;
      }

      if (choice === "talk_agent") {
        await escalate(sb, lead, to, "requested human agent from main menu");
        return;
      }

      {
        const [r1, r2] = await Promise.all([
          sendText(to, faqText(lang)),
          sendMainMenuCard(to, lang),
        ]);
        await logOutbound(sb, lead.id, combineSendLog(r1, r2));
      }
      return;
    }

    case "awaiting_trader_status": {
      const status = matchTraderStatus(input);
      if (!status) {
        await handleUnmatched(sb, lead, to, input, 3, "new-or-existing answer", () =>
          sendTraderStatusButtons(to, t(lang, "Sorry, I didn't catch that. Have you already opened a trading account with Exness or XM, or would this be your first time?", "Maazrat, samajh nahi aaya. Kya aap ka Exness ya XM par pehle se account hai, ya ye pehli baar hai?"), lang),
        );
        return;
      }

      if (status === "existing") {
        // BOX 3B: existing account holder - pick a broker, then skip the
        // experience/traded-before questions and go straight to deposit.
        await advanceStage(sb, lead, "awaiting_broker_existing");
        const r = await sendBrokerCard(to, t(lang, "Which one, Exness or XM, or both?", "Kaun sa, Exness ya XM, ya dono?"), lang);
        await logOutbound(sb, lead.id, combineSendLog(r));
        return;
      }

      // BOX 3A: first-time trader - unchanged flow from here on
      // (broker -> experience -> traded-before -> deposit).
      await advanceStage(sb, lead, "awaiting_broker");
      const r = await sendBrokerCard(to, t(lang, "Which broker would you like to use?", "Aap kaun sa broker istemal karna chahenge?"), lang);
      await logOutbound(sb, lead.id, combineSendLog(r));
      return;
    }

    case "awaiting_broker_existing": {
      const broker = matchBroker(input);
      if (!broker) {
        await handleUnmatched(sb, lead, to, input, 3, "broker choice", () =>
          sendBrokerCard(to, t(lang, "Sorry, I didn't catch that. Which one, Exness or XM, or both?", "Maazrat, samajh nahi aaya. Kaun sa, Exness ya XM, ya dono?"), lang),
        );
        return;
      }
      // Existing account holder: skip awaiting_experience and
      // awaiting_traded_before entirely, straight to deposit confirmation.
      await advanceStage(sb, lead, "awaiting_deposit_confirm", { broker_choice: broker, trader_experience: "experienced" });
      const rDep = await sendDepositConfirm(to, broker);
      await logOutbound(sb, lead.id, combineSendLog(rDep));
      return;
    }

    case "awaiting_broker": {
      const broker = matchBroker(input);
      if (!broker) {
        await handleUnmatched(sb, lead, to, input, 3, "broker choice", () =>
          sendBrokerCard(to, t(lang, "Sorry, I didn't catch that. Which broker would you like to use?", "Maazrat, samajh nahi aaya. Aap kaun sa broker istemal karna chahenge?"), lang),
        );
        return;
      }
      await advanceStage(sb, lead, "awaiting_experience", { broker_choice: broker });
      const rExp = await sendExperienceButtons(to, t(lang, "Great choice! Are you new to trading, or already experienced?", "Bohat khoob! Kya aap trading mein naye hain, ya pehle se tajurba hai?"), lang);
      await logOutbound(sb, lead.id, combineSendLog(rExp));
      return;
    }

    case "awaiting_experience": {
      const experience = matchExperience(input);
      if (!experience) {
        await handleUnmatched(sb, lead, to, input, 3, "experience level", () =>
          sendExperienceButtons(to, t(lang, "Just to confirm, are you new to trading, or already experienced?", "Sirf tasdeeq ke liye, kya aap trading mein naye hain, ya pehle se tajurba hai?"), lang),
        );
        return;
      }

      if (experience === "new") {
        await advanceStage(sb, lead, "awaiting_traded_before");
        const r = await sendTradedBeforeButtons(to, t(lang, "No problem! Have you traded before (with any broker)?", "Koi masla nahi! Kya aap ne pehle kabhi trading ki hai (kisi bhi broker ke saath)?"), lang);
        await logOutbound(sb, lead.id, combineSendLog(r));
        return;
      }

      await advanceStage(sb, lead, "awaiting_deposit_confirm", { trader_experience: "experienced" });
      const rDep1 = await sendDepositConfirm(to, lead.broker_choice);
      await logOutbound(sb, lead.id, combineSendLog(rDep1));
      return;
    }

    case "awaiting_traded_before": {
      const yesNo = matchYesNo(input);
      if (!yesNo) {
        await handleUnmatched(sb, lead, to, input, 3, "traded-before answer", () =>
          sendTradedBeforeButtons(to, t(lang, "Sorry, have you traded before with any broker?", "Maazrat, kya aap ne pehle kisi broker ke saath trading ki hai?"), lang),
        );
        return;
      }
      await advanceStage(sb, lead, "awaiting_deposit_confirm", { trader_experience: "new" });
      const rDep2 = await sendDepositConfirm(to, lead.broker_choice);
      await logOutbound(sb, lead.id, combineSendLog(rDep2));
      return;
    }

    case "awaiting_deposit_confirm": {
      const yesNo = matchYesNo(input);
      if (!yesNo) {
        // A question about depositing less than $500 skips the re-prompt -
        // that's a real objection needing a person's answer, not ambiguous
        // input worth re-asking Yes/No over.
        if (asksAboutLowerDeposit(input)) {
          await escalate(sb, lead, to, "asked about depositing less than $500");
          return;
        }
        // Give one clarifying re-prompt before handing off, so a single question
        // at the deposit step doesn't instantly escalate a hot lead.
        await handleUnmatched(sb, lead, to, input, 3, "deposit confirmation", () =>
          sendDepositConfirm(to, lead.broker_choice, "Sorry, just a Yes or No, are you ready to proceed with the $500 deposit?"),
        );
        return;
      }

      if (yesNo === "yes") {
        // "Both" (added 21 July 2026, Badar) shows both brokers' links/codes
        // together instead of picking one - a lead who wants to use both
        // Exness and XM gets both referral links in the same message.
        const brokerName = lead.broker_choice === "xm" ? "XM" : lead.broker_choice === "both" ? "Exness or XM" : "Exness";
        const linkSection = lead.broker_choice === "both"
          ? `Exness: ${LINKS.exness} (code: ${LINKS.exnessCode})\nXM: ${LINKS.xm} (code: ${LINKS.xmCode})`
          : lead.broker_choice === "xm"
            ? `${LINKS.xm}\n\nReferral / partner code: ${LINKS.xmCode}`
            : `${LINKS.exness}\n\nReferral / partner code: ${LINKS.exnessCode}`;
        await sb.from("leads").update({
          ready_to_deposit: true,
          bot_stage: "qualified",
          status: "qualified",
          retry_count: 0,
        }).eq("id", lead.id);

        const summary = `New Lead, Badar Funnel\nName: ${lead.full_name}\nBroker: ${lead.broker_choice}\nTrader type: ${lead.trader_experience}\nReady for $500 deposit: Yes\nWhatsApp: ${lead.phone}`;
        await sb.from("communications").insert({
          lead_id: lead.id, type: "whatsapp", direction: "outbound",
          subject: "Qualified lead summary", body: summary, created_at: new Date().toISOString(),
        });

        // 2026-07-21 (Badar): don't assume every lead is starting from zero -
        // some are already trading on this broker. Either a fresh $500
        // deposit or an existing $500+ balance both count, the screenshot is
        // what actually matters (it's the real signal a lead has closed, see
        // handleImageMessage).
        // Handed over through escalate() rather than a plain sendText, fixed
        // 2026-08-20 (Junaid). This branch used to promise the customer "a
        // team member will follow up" and then just return: needs_human was
        // never set, no agent was assigned when the lead had none, and nobody
        // was notified. The single highest-intent moment in the whole funnel
        // was the one place with no handoff at all, while every failure path
        // (confused, declined, low-deposit question) escalated correctly.
        // Passing the qualified copy as escalate()'s message override keeps
        // this to exactly one outbound message, the same text as before.
        await escalate(
          sb,
          lead,
          to,
          "qualified, ready for the $500 deposit",
          `Perfect! Deposit $500 in your own ${brokerName} account using the link below:\n${linkSection}\n\nAlready trading with ${brokerName} and have $500 or more deposited? Even better, that counts too. Either way, send your account screenshot showing the deposit here and our team will confirm and unlock your free $250 mentorship course. A team member will follow up with you shortly!`,
        );
        return;
      }

      // 21 July 2026 (Badar, live-tested): same fix as the Premium Signalling
      // Group menu option - this used to auto-dump the full deposit
      // instructions as a downsell pitch instead of a real handoff. Same
      // treatment now: a human takes it from here.
      await sb.from("leads").update({
        ready_to_deposit: false,
        bot_stage: "declined",
        retry_count: 0,
      }).eq("id", lead.id);

      await escalate(sb, lead, to, "requested human agent after declining $500 deposit");
      return;
    }

    default: {
      // qualified / declined - conversation already resolved.

      // Declined leads returning after a day restart from scratch (greeting +
      // language picker), same shape as the wasCreated flow. Qualified leads
      // get the same 24h+ restart, but via MIDFLOW_RESTART_STAGES above (it
      // runs before this switch), so they never actually reach this branch
      // once stale - this check only fires for declined leads still within
      // the window, or qualified leads that haven't gone stale yet.
      const hoursSinceTouch = (Date.now() - lastTouch) / 3600000;
      if (lead.bot_stage === "declined" && hoursSinceTouch >= DECLINED_RESTART_HOURS) {
        await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
        const greeting = matchGreeting(input) ?? "hello";
        // Sequential - same fix as the wasCreated path above, guaranteed order.
        const r1 = await sendText(to, greetingReplyText(greeting));
        const r2 = await sendLanguageCard(to);
        await logOutbound(sb, lead.id, `[Declined lead returned after 24h+, restarted]\n${combineSendLog(r1, r2)}`);
        return;
      }

      // A question about depositing less than $500 needs a person, not a
      // generic ack - escalate with a specific reason so the agent knows
      // exactly what to answer instead of reconstructing context later.
      if (asksAboutLowerDeposit(input)) {
        await escalate(sb, lead, to, "asked about depositing less than $500");
        return;
      }

      // A lead whose conversation already resolved (declined/qualified) used
      // to get this identical canned ack forever, no matter what they said -
      // this was the actual cause behind "why do I keep getting the same
      // reply" reports (Junaid, 21 July). Every other stuck point in the
      // funnel escalates to a human after repeated messages via
      // handleUnmatched; this branch never did. Same threshold (2) applied
      // here now. Greetings are exempt from the count, same as elsewhere -
      // someone just saying "hi" again isn't "stuck".
      const greeting = matchGreeting(input);
      if (!greeting) {
        const retries = (lead.retry_count ?? 0) + 1;
        if (retries >= 2) {
          await escalate(sb, lead, to, `sent ${retries} messages after conversation resolved (${lead.bot_stage})`);
          return;
        }
        await sb.from("leads").update({ retry_count: retries }).eq("id", lead.id);
      }

      const prefix = greeting ? `${greetingReplyText(greeting)} ` : "";
      const r = await sendText(to, `${prefix}Thanks for the message. A team member will follow up with you shortly.`);
      await logOutbound(sb, lead.id, combineSendLog(r));
      return;
    }
  }
}

async function handleUnmatched(
  sb: SupabaseClient,
  lead: any,
  to: string,
  input: UserInput,
  limit: number,
  label: string,
  rePrompt: () => Promise<SendResult>,
): Promise<void> {
  const greeting = matchGreeting(input);
  if (greeting) {
    const greetResult = await sendText(to, greetingReplyText(greeting));
    const rePromptResult = await rePrompt();
    await logOutbound(sb, lead.id, combineSendLog(greetResult, rePromptResult));
    return;
  }

  const retries = (lead.retry_count ?? 0) + 1;
  if (retries >= limit) {
    // Badar's call, 22 July 2026: whenever the bot genuinely can't understand
    // what's being asked, always use one of the two approved "we've received
    // your question, a team member will contact you" templates - the same
    // wording whether this is the 1st unclear message (confusedReply below)
    // or the one that triggers the actual handoff, not a different-sounding
    // escalation message.
    await escalate(
      sb, lead, to,
      `stuck at ${lead.bot_stage} after ${retries} attempt(s)`,
      confusedReply(lead.language === "ur" ? "ur" : "en"),
    );
    return;
  }
  await sb.from("leads").update({ retry_count: retries }).eq("id", lead.id);
  const apologyResult = await sendText(to, confusedReply(lead.language === "ur" ? "ur" : "en"));

  // Muhammad's wife's real test, 2026-08-23: she typed a genuine question at a
  // button stage ("Ya offer kya hai") and got the apology above immediately
  // followed by the exact same button prompt again in one breath - answered
  // with a question instead of an answer. tryAIReply() already gets first
  // refusal on every inbound message (see the dispatch above); reaching this
  // function at all means it already had nothing to say this turn, so it
  // cannot be asked again here. What IS in this function's control is not
  // piling a second message on top of the apology on her very first unmatched
  // turn - free text (not a stray tap on a button that just didn't match
  // anything) reads as someone trying to say something, not someone who
  // forgot the menu exists. Recommended and approved 2026-08-23 (option 1 of
  // three, see REMAINING_TODOS.md): stay quiet on the prompt for one turn,
  // and only re-show it if they are still stuck on the very next message.
  if (shouldSuppressRePrompt(input, retries)) {
    await logOutbound(sb, lead.id, combineSendLog(apologyResult));
    return;
  }

  const rePromptResult = await rePrompt();
  await logOutbound(sb, lead.id, combineSendLog(apologyResult, rePromptResult));
}

// Every forward step in the funnel goes through this instead of a bare
// `.update()` so bot_stage_history always has an accurate stack of where the
// lead has been - that stack is what makes "Go Back" possible. extraFields
// is whatever that transition saves alongside the stage change (broker
// choice, trader experience, etc.); goBack() undoes exactly these when a
// lead backs out of the stage that set them.
async function advanceStage(
  sb: SupabaseClient,
  lead: any,
  newStage: string,
  extraFields: Record<string, unknown> = {},
): Promise<void> {
  const history = [...(lead.bot_stage_history ?? []), lead.bot_stage];
  await sb.from("leads").update({
    bot_stage: newStage,
    bot_stage_history: history,
    retry_count: 0,
    ...extraFields,
  }).eq("id", lead.id);
  lead.bot_stage = newStage;
  lead.bot_stage_history = history;
  Object.assign(lead, extraFields);
}

// Pops one level off bot_stage_history and re-sends that stage's prompt.
// Clears whatever field the stage being LEFT had saved on its way in, so a
// lead who backs out and re-answers doesn't inherit a stale value from the
// path they abandoned (e.g. backing out of "experienced" shouldn't leave
// trader_experience set to "experienced" once they're back picking a broker).
async function goBack(sb: SupabaseClient, lead: any, to: string, lang: Lang): Promise<void> {
  const history = [...(lead.bot_stage_history ?? [])];
  const prevStage = history.pop();
  if (!prevStage) return;

  const clearedFields: Record<string, unknown> = {};
  if (lead.bot_stage === "awaiting_menu") clearedFields.language = null;
  if (lead.bot_stage === "awaiting_experience") clearedFields.broker_choice = null;
  if (lead.bot_stage === "awaiting_deposit_confirm") clearedFields.trader_experience = null;

  await sb.from("leads").update({
    bot_stage: prevStage,
    bot_stage_history: history,
    retry_count: 0,
    ...clearedFields,
  }).eq("id", lead.id);
  lead.bot_stage = prevStage;
  lead.bot_stage_history = history;
  Object.assign(lead, clearedFields);

  let result: SendResult;
  switch (prevStage) {
    case "awaiting_language":
      result = await sendLanguageCard(to);
      break;
    case "awaiting_menu":
      result = await sendMainMenuCard(to, lang);
      break;
    case "awaiting_trader_status":
      result = await sendTraderStatusButtons(to, t(lang, "Sure, have you already opened a trading account with Exness or XM, or would this be your first time?", "Zaroor, kya aap ka Exness ya XM par pehle se account hai, ya ye pehli baar hai?"), lang);
      break;
    case "awaiting_broker":
      result = await sendBrokerCard(to, t(lang, "Sure, which broker would you like to use?", "Zaroor, aap kaun sa broker istemal karna chahenge?"), lang);
      break;
    case "awaiting_broker_existing":
      result = await sendBrokerCard(to, t(lang, "Sure, which one, Exness or XM, or both?", "Zaroor, kaun sa, Exness ya XM, ya dono?"), lang);
      break;
    case "awaiting_experience":
      result = await sendExperienceButtons(to, t(lang, "No problem, are you new to trading, or already experienced?", "Koi masla nahi, kya aap trading mein naye hain, ya pehle se tajurba hai?"), lang);
      break;
    case "awaiting_traded_before":
      result = await sendTradedBeforeButtons(to, t(lang, "Sure, have you traded before (with any broker)?", "Zaroor, kya aap ne pehle kabhi trading ki hai (kisi bhi broker ke saath)?"), lang);
      break;
    default:
      result = await sendMainMenuCard(to, lang);
  }
  await logOutbound(sb, lead.id, `[went back to ${prevStage}]\n${combineSendLog(result)}`);
}

async function escalate(
  sb: SupabaseClient,
  lead: any,
  to: string,
  reason: string,
  message?: string,
): Promise<void> {
  // A lead escalating with nobody assigned would otherwise sit invisible -
  // exactly what happened to Izza (10+ days, no agent, no ping, nobody knew).
  let assignedAgentId: string | null = lead.assigned_agent_id ?? null;
  let assignedAgent = (await getAgentRotation(sb)).find((a) => a.id === assignedAgentId) ?? null;
  if (!assignedAgentId) {
    assignedAgent = await assignAgentRoundRobin(sb);
    assignedAgentId = assignedAgent.id;
  }

  await sb.from("leads").update({
    needs_human:    true,
    handoff_reason: reason,
    assigned_agent_id: assignedAgentId,
    updated_at:     new Date().toISOString(),
  }).eq("id", lead.id);

  const result = await sendText(
    to,
    message ?? "Thanks for your patience. Let me connect you with a team member who'll help you personally, please hold on a moment.",
  );
  await logOutbound(sb, lead.id, `[escalated to human: ${reason}]\n${combineSendLog(result)}`);

  if (ESCALATION_NOTIFICATIONS_ENABLED && assignedAgent) {
    // Every block is written to the lead's own log with its reason, so a quiet
    // phone is always explainable rather than looking like a broken feature.
    // No testNumbers here on purpose. Escalation alerts already reach real
    // agents today and are wanted - the allowlist exists to trial the NEW-LEAD
    // notification safely, not to switch off a working alert. Passing it here
    // would silently stop every real agent being told a lead needs a human,
    // which is a worse outcome than the flood it was meant to prevent. The
    // one-per-lead and cooldown rules below still apply to everyone, always.
    const decision = shouldNotifyAgent({
      agentPhone: assignedAgent.phone,
      leadAlreadyNotified: (lead.agent_ping_count ?? 0) > 0,
      agentLastNotifiedAt: assignedAgent.last_notified_at ?? null,
      cooldownMinutes: AGENT_NOTIFY_COOLDOWN_MINUTES,
    });

    if (!decision.notify) {
      await insertCommunication(
        sb,
        lead.id,
        "outbound",
        `[agent ${assignedAgent.name} NOT notified - ${decision.reason}]`,
        new Date().toISOString(),
      );
    } else {
      const pingResult = await sendText(
        assignedAgent.phone,
        `A lead needs a human right now: ${lead.full_name || "Unknown"} (${lead.phone}). Reason: ${reason}. Please check the CRM.`,
      );
      const nowIso = new Date().toISOString();
      // Recorded even on a failed send: a Meta outage must not become a retry
      // loop that floods the agent the moment delivery recovers.
      await Promise.all([
        sb.from("leads").update({
          agent_ping_count: (lead.agent_ping_count ?? 0) + 1,
          agent_last_pinged_at: nowIso,
        }).eq("id", lead.id),
        sb.from("profiles").update({ last_notified_at: nowIso }).eq("id", assignedAgentId),
      ]);
      await insertCommunication(
        sb,
        lead.id,
        "outbound",
        pingResult.ok ? `[agent ${assignedAgent.name} notified of escalation]` : `[SEND FAILED: agent escalation notification - ${pingResult.error}]`,
        nowIso,
      );
    }
  }
}

async function handleAgentReply(
  sb: SupabaseClient,
  agent: { id: string; name: string; phone: string },
  input: UserInput,
): Promise<void> {
  const leadId = input.selectionId?.startsWith("ack_") ? input.selectionId.slice(4) : null;
  if (!leadId) {
    console.log(`Message from agent ${agent.name} was not an ack button - ignoring.`);
    return;
  }

  const { data: lead } = await sb.from("leads").select("id, agent_acknowledged_at").eq("id", leadId).maybeSingle();
  if (!lead || lead.agent_acknowledged_at) return;

  await sb.from("leads").update({ agent_acknowledged_at: new Date().toISOString() }).eq("id", lead.id);
  await insertCommunication(sb, lead.id, "outbound", `[agent ${agent.name} acknowledged assignment]`, new Date().toISOString());
  await sendText(agent.phone, `Got it, lead marked as picked up.`);
}

// Caller is responsible for logging the result (matches every other send*
// helper) - this used to log internally, which double-logged when reused as
// handleUnmatched's rePrompt (handleUnmatched logs its own combined result).
async function sendDepositConfirm(to: string, brokerChoice: string, bodyText?: string): Promise<SendResult> {
  const brokerLabel = brokerChoice === "xm" ? "XM" : brokerChoice === "both" ? "Exness or XM" : "Exness";
  return await sendButtons(
    to,
    bodyText ?? `This offer needs a $500 deposit with ${brokerLabel} to unlock Badar's free $250 mentorship course. Ready to proceed?`,
    [
      { id: "deposit_yes", title: "Yes, I'm ready" },
      { id: "deposit_no", title: "Not right now" },
      { id: "nav_back", title: "Go Back" },
    ],
  );
}

async function sendLanguageCard(to: string): Promise<SendResult> {
  return await sendList(
    to,
    "Dear Customer",
    "Welcome to Team Badar Trader.\n\nPlease select your preferred language from the main menu below:",
    "Menu",
    [
      { id: "lang_en", title: "English", description: "Continue in English" },
      { id: "lang_ur", title: "Roman Urdu", description: "Urdu mein jaari rakhein" },
    ],
  );
}

async function sendMainMenuCard(to: string, lang: Lang): Promise<SendResult> {
  if (lang === "ur") {
    return await sendList(
      to,
      "Main Menu",
      "Aaj hum aap ki kaise madad kar sakte hain.\n\nBraye meherbani neeche main menu se apna pasandeeda option chunein:",
      "Menu",
      [
        { id: "menu_start_trading", title: "Trading Shuru Karein", description: "$500 offer + free mentorship course" },
        { id: "menu_free_signals", title: "Premium Signalling Group", description: "Join karein - By Badar Tanvir, bilkul free, deposit zaroori nahi" },
        { id: "menu_talk_agent", title: "Agent se Baat Karein", description: "Hamari team se rabta karein" },
        { id: "menu_faqs", title: "FAQs", description: "Aam sawalat ke jawabat" },
        { id: "nav_back", title: "Peeche Jayein", description: "Language selection par wapas jayein" },
      ],
    );
  }

  return await sendList(
    to,
    "Main Menu",
    "Here's how we can help you today.\n\nPlease select your preferred option from the main menu below:",
    "Menu",
    [
      { id: "menu_start_trading", title: "Start Trading", description: "$500 offer + free mentorship course" },
      { id: "menu_free_signals", title: "Premium Signalling Group", description: "By Badar Tanvir, join for free, no deposit required" },
      { id: "menu_talk_agent", title: "Talk to an Agent", description: "Connect with our team" },
      { id: "menu_faqs", title: "FAQs", description: "Common questions answered" },
      { id: "nav_back", title: "Go Back", description: "Back to language selection" },
    ],
  );
}

// Broker choice already had 3 options (Exness/XM/Both) - WhatsApp caps
// interactive button messages at 3, leaving no room for a 4th "Back" button,
// so this step uses a list message instead (same pattern as the menu/language
// cards) purely to fit the back option in.
async function sendBrokerCard(to: string, bodyText: string, lang: Lang = "en"): Promise<SendResult> {
  return await sendList(
    to,
    t(lang, "Choose Broker", "Broker Chunein"),
    bodyText,
    t(lang, "Choose", "Chunein"),
    [
      { id: "broker_exness", title: "Exness" },
      { id: "broker_xm", title: "XM" },
      { id: "broker_both", title: t(lang, "Both", "Dono") },
      { id: "nav_back", title: t(lang, "Go Back", "Peeche Jayein") },
    ],
  );
}

// BOX 3 question. Button titles stay <=20 chars per WhatsApp's reply-button
// limit, so the full question lives in bodyText, not the button labels.
async function sendTraderStatusButtons(to: string, bodyText: string, lang: Lang = "en"): Promise<SendResult> {
  return await sendButtons(to, bodyText, [
    { id: "trader_existing", title: t(lang, "I have an account", "Account hai") },
    { id: "trader_first_time", title: t(lang, "First time", "Pehli baar") },
    { id: "nav_back", title: t(lang, "Go Back", "Peeche Jayein") },
  ]);
}

async function sendExperienceButtons(to: string, bodyText: string, lang: Lang = "en"): Promise<SendResult> {
  return await sendButtons(to, bodyText, [
    { id: "exp_new", title: t(lang, "New to trading", "Naya hun") },
    { id: "exp_experienced", title: t(lang, "Experienced", "Tajurba hai") },
    { id: "nav_back", title: t(lang, "Go Back", "Peeche Jayein") },
  ]);
}

async function sendTradedBeforeButtons(to: string, bodyText: string, lang: Lang = "en"): Promise<SendResult> {
  return await sendButtons(to, bodyText, [
    { id: "traded_yes", title: t(lang, "Yes", "Haan") },
    { id: "traded_no", title: t(lang, "No", "Nahi") },
    { id: "nav_back", title: t(lang, "Go Back", "Peeche Jayein") },
  ]);
}

async function logOutbound(sb: SupabaseClient, leadId: string, body: string): Promise<void> {
  await insertCommunication(sb, leadId, "outbound", body, new Date().toISOString());
}

// A lead asking whether they can deposit less than $500 (or otherwise trying
// to negotiate the amount) needs a real answer from a person, not the bot's
// generic "a team member will follow up" ack - that ack doesn't tell the
// agent WHY they're being pinged, so the agent has no context and (as
// happened in practice) can end up giving inconsistent or wrong info hours
// later. Requires both an amount mention and a "less/lower" word in the same
// message, to avoid flagging unrelated messages that just happen to contain
// "500" or "kam".
function asksAboutLowerDeposit(input: UserInput): boolean {
  const t = input.text.toLowerCase();
  if (!t) return false;
  const mentionsAmount = /\b(500|five\s*hundred)\b/.test(t);
  const mentionsLess = /\b(kam|km|less|lower|under|kum|discount|reduce|negotiate)\b/.test(t);
  // "What's the minimum deposit?" never mentions 500 or a "less/lower" word
  // at all, so the check above missed one of the most natural phrasings of
  // exactly this objection - found 21 July 2026 after a real lead asked
  // this and the bot never escalated it.
  const mentionsMinimumDeposit = /\bdeposit\b/.test(t) && /\b(minimum|kam se kam|kum se kum)\b/.test(t);
  return (mentionsAmount && mentionsLess) || mentionsMinimumDeposit;
}

function matchNavBack(input: UserInput): boolean {
  if (input.selectionId === "nav_back") return true;
  return /^\s*(back|previous|pichl?e|wapas)\s*$/i.test(input.text);
}

function matchGreeting(input: UserInput): "hello" | "walaikum" | "namaste" | "satsriakal" | "arabic" | null {
  const t = input.text.trim();
  if (/^(hi+|hello+|hey+)[\s!.]*$/i.test(t)) return "hello";
  if (/^(a+\s*salam(u|o)?\s*(alaikum|alieukum)?|assalam(u|o)?\s*(alaikum|alieukum)?|salam|slm|a+oa+)[\s!.]*$/i.test(t)) return "walaikum";
  if (/^(namaste|namaskar)[\s!.]*$/i.test(t)) return "namaste";
  if (/^sat\s*s(h)?ri\s*akal[\s!.]*$/i.test(t)) return "satsriakal";
  if (/^(marhaba|ahlan(\s*wa\s*sahlan)?)[\s!.]*$/i.test(t)) return "arabic";
  if (/^(مرحبا|أهلا|اهلا)[\s!.]*$/.test(t)) return "arabic";
  return null;
}

function greetingReplyText(greeting: ReturnType<typeof matchGreeting>): string {
  switch (greeting) {
    case "walaikum": return WALAIKUM_REPLY;
    case "namaste": return NAMASTE_REPLY;
    case "satsriakal": return SATSRIAKAL_REPLY;
    case "arabic": return ARABIC_GREETING_REPLY;
    default: return HELLO_REPLY;
  }
}

function matchLanguage(input: UserInput): Lang | null {
  if (input.selectionId === "lang_en") return "en";
  if (input.selectionId === "lang_ur") return "ur";
  if (/english/i.test(input.text)) return "en";
  if (/urdu|roman/i.test(input.text)) return "ur";
  return null;
}

function matchMenuChoice(input: UserInput): "start_trading" | "free_signals" | "talk_agent" | "faqs" | null {
  if (input.selectionId === "menu_start_trading") return "start_trading";
  if (input.selectionId === "menu_free_signals") return "free_signals";
  if (input.selectionId === "menu_talk_agent") return "talk_agent";
  if (input.selectionId === "menu_faqs") return "faqs";
  if (/trading|shuru/i.test(input.text)) return "start_trading";
  if (/signal/i.test(input.text)) return "free_signals";
  if (/agent|baat/i.test(input.text)) return "talk_agent";
  if (/faq/i.test(input.text)) return "faqs";
  return null;
}

function matchTraderStatus(input: UserInput): "existing" | "first_time" | null {
  if (input.selectionId === "trader_existing") return "existing";
  if (input.selectionId === "trader_first_time") return "first_time";
  // "existing" checked first so "I already have an account" wins over a
  // stray "new" elsewhere in the sentence.
  if (/already|existing|\bhave\b|pehle se|purana/i.test(input.text)) return "existing";
  if (/first|\bnew\b|naya|pehli/i.test(input.text)) return "first_time";
  return null;
}

function matchBroker(input: UserInput): "exness" | "xm" | "both" | null {
  if (input.selectionId === "broker_exness") return "exness";
  if (input.selectionId === "broker_xm") return "xm";
  if (input.selectionId === "broker_both") return "both";
  if (/\bboth\b/i.test(input.text)) return "both";
  if (/exness/i.test(input.text)) return "exness";
  if (/\bxm\b/i.test(input.text)) return "xm";
  return null;
}

function matchExperience(input: UserInput): "new" | "experienced" | null {
  if (input.selectionId === "exp_new") return "new";
  if (input.selectionId === "exp_experienced") return "experienced";
  if (/\bnew\b/i.test(input.text)) return "new";
  if (/\bexperienc/i.test(input.text)) return "experienced";
  return null;
}

function matchYesNo(input: UserInput): "yes" | "no" | null {
  if (input.selectionId === "traded_yes" || input.selectionId === "deposit_yes") return "yes";
  if (input.selectionId === "traded_no" || input.selectionId === "deposit_no") return "no";
  if (/^\s*(yes|y|haan|ji|han)\b/i.test(input.text)) return "yes";
  if (/^\s*(no|n|nahi)\b/i.test(input.text)) return "no";
  return null;
}

// True when this input would be recognised as a real answer to whatever the
// bot is currently waiting on at lead.bot_stage - a tapped button always
// counts (never ambiguous), and free text counts only if that stage's own
// matcher would accept it. Used to give the funnel first refusal on anything
// that looks like an actual answer, before keyword/AI replies ever see it -
// see the dispatch loop's isStageAnswer comment for why. "qualified" and
// "declined" have no pending question, so free chat there is fair game for
// keyword/AI same as before this existed, except the one standing question
// (asked-about-a-lower-deposit) that still needs a human even post-funnel.
function matchesCurrentStage(lead: any, input: UserInput): boolean {
  if (input.selectionId) return true;
  if (matchNavBack(input)) return true;
  switch (lead.bot_stage) {
    case "awaiting_language": return matchLanguage(input) !== null;
    case "awaiting_menu": return matchMenuChoice(input) !== null;
    case "awaiting_trader_status": return matchTraderStatus(input) !== null;
    case "awaiting_broker_existing":
    case "awaiting_broker": return matchBroker(input) !== null;
    case "awaiting_experience": return matchExperience(input) !== null;
    case "awaiting_traded_before": return matchYesNo(input) !== null;
    // asksAboutLowerDeposit is its own deliberate escalation-to-a-human path
    // (see that function's comment - a wrong AI-generated answer here already
    // caused real inconsistency once), so it must reach runBotStep the same
    // way a Yes/No answer does, not get intercepted by keyword/AI first.
    case "awaiting_deposit_confirm": return matchYesNo(input) !== null || asksAboutLowerDeposit(input);
    // qualified/declined have no pending question, but the same
    // asksAboutLowerDeposit escalation still applies to them (see the
    // default case in runBotStep's switch) - same reasoning as above.
    default: return asksAboutLowerDeposit(input);
  }
}

// Deliberately gated by KEYWORD_REPLIES_ENABLED rather than BOT_REPLIES_ENABLED,
// so keyword replies can run while the funnel stays paused. Everything else in
// this file must keep using sendText.
async function sendKeywordText(to: string, body: string): Promise<SendResult> {
  if (!gateOpenSync("KEYWORD_REPLIES_ENABLED")) {
    return { ok: false, error: "Keyword replies paused (KEYWORD_REPLIES_ENABLED is off)", text: body };
  }
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
  return { ...result, text: body };
}

async function sendAIText(to: string, body: string): Promise<SendResult> {
  if (!gateOpenSync("AI_REPLIES_ENABLED")) {
    return { ok: false, error: "AI replies paused (AI_REPLIES_ENABLED is off)", text: body };
  }
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
  return { ...result, text: body };
}

async function sendText(to: string, body: string): Promise<SendResult> {
  if (!gateOpenSync("BOT_REPLIES_ENABLED")) {
    return { ok: false, error: "Bot replies paused (BOT_REPLIES_ENABLED is off)", text: body };
  }
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
  return { ...result, text: body };
}

async function sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<SendResult> {
  const fallbackText = `${bodyText}\n[Buttons: ${buttons.map((b) => b.title).join(" / ")}]`;
  if (!gateOpenSync("BOT_REPLIES_ENABLED")) {
    return { ok: false, error: "Bot replies paused (BOT_REPLIES_ENABLED is off)", text: fallbackText };
  }
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    },
  });
  return { ...result, text: fallbackText };
}

async function sendList(
  to: string,
  headerText: string,
  bodyText: string,
  buttonLabel: string,
  rows: { id: string; title: string; description?: string }[],
): Promise<SendResult> {
  const fallbackText = `${headerText}\n${bodyText}\n[Options: ${rows.map((r) => r.title).join(" / ")}]`;
  if (!gateOpenSync("BOT_REPLIES_ENABLED")) {
    return { ok: false, error: "Bot replies paused (BOT_REPLIES_ENABLED is off)", text: fallbackText };
  }
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: headerText },
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [{ rows }],
      },
    },
  });
  return { ...result, text: fallbackText };
}

// `text` is what was actually sent (or attempted), always populated -
// this is what the CRM's Conversations tab shows agents, so it must never
// be a placeholder description. See combineSendLog below, used everywhere
// this used to be replaced with a hand-typed "[thing sent]" bracket note.
type SendResult = { ok: boolean; error?: string; text: string };
type GraphApiResult = { ok: boolean; error?: string };

// Builds one log line from one or more send attempts, real content always,
// never a description of the content. Fixed 21 July 2026 - every outbound
// log entry used to be a bracketed internal note ("[screenshot ack sent]")
// instead of what was actually said, which left agents with no way to see
// what the bot had told a customer, a real, live problem found in practice.
function combineSendLog(...results: SendResult[]): string {
  const combinedText = results.map((r) => r.text).join("\n\n");
  const allOk = results.every((r) => r.ok);
  if (allOk) return combinedText;
  const errors = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean).join("; ");
  return `[DELIVERY FAILED: ${errors}]\n${combinedText}`;
}

async function markAsRead(messageId: string): Promise<void> {
  await callGraphApi({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

async function callGraphApi(payload: unknown): Promise<GraphApiResult> {
  const { token, phoneId } = await getWaCredentials();
  if (!token || !phoneId) {
    const msg = "No WhatsApp access token / phone number ID available (checked env vars and settings table)";
    console.error(msg + " - skipping outbound send.");
    return { ok: false, error: msg };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`WhatsApp send failed (${res.status}):`, errBody);
      return { ok: false, error: `HTTP ${res.status}: ${errBody.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("WhatsApp send threw an exception (network/timeout):", msg);
    return { ok: false, error: `exception: ${msg}` };
  }
}

function normalisePhone(raw: string): string {
  if (!raw) return "";
  return raw.startsWith("+") ? raw : `+${raw}`;
}
