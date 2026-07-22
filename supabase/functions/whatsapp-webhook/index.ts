// Badar Trader CRM — WhatsApp Cloud API Webhook
// Supabase Edge Function (Deno / TypeScript)
//
// Handoff behaviour (v28): confusion/inactivity handoffs auto-expire so a lead
// who returns after a gap resumes the bot flow from where they left off; only
// explicit "talk to an agent" requests keep the bot silent for a human.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GRAPH_VERSION = "v21.0";

// How long before a confusion/inactivity handoff is considered stale. A lead
// who returns after this many hours has their needs_human flag cleared and the
// bot flow resumed (explicit agent requests are exempt — see runBotStep).
const HANDOFF_STALE_HOURS = 2;

// A DECLINED lead who comes back after this long is treated as a fresh
// opportunity: the flow restarts from the greeting instead of dead-ending
// every message in the "a team member will follow up" acknowledgement
// (which promised a follow-up nobody was making — Badar, 2026-07-14).
// Within the window the polite acknowledgement stands, so someone who just
// said "not right now" isn't immediately re-pitched.
const DECLINED_RESTART_HOURS = 24;

// Muhammad, 21 July 2026: turn off the WhatsApp ping agents get on new-lead
// assignment. Lead assignment itself still happens (round-robin, CRM record),
// only the outbound notification is silenced. Flip back to true when told to.
const NEW_LEAD_NOTIFICATIONS_ENABLED = false;

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
  cachedWaToken = WHATSAPP_ACCESS_TOKEN || row("wa_access_token");
  cachedWaPhoneId = WHATSAPP_PHONE_NUMBER_ID || row("wa_phone_number_id");
  return { token: cachedWaToken, phoneId: cachedWaPhoneId };
}

const LINKS = {
  exness: "https://one.exnesstrack.org/a/eatgh2cl7y",
  exnessCode: "eatgh2cl7y",
  xm: "https://affs.click/a3Vrw",
  xmCode: "YR4PD",
  // Was a Google Form placeholder that returns 401 Unauthorized (confirmed
  // live) — this is the real, working, hosted form (Badar, 2026-07-14).
  form: "https://crm.badartrader.com/join.html",
};

type Lang = "en" | "ur";

const HELLO_REPLY = "Hello!";
const WALAIKUM_REPLY = "Walaikum Assalam!";
const CONFUSED_REPLY = "This is Team Badar Tanvir. We are ever ready to serve for our brand's purpose. We're really sorry, but we couldn't quite understand your message.";

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
    try {
      const body = await req.json();
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
      const messages: any[] = change?.value?.messages ?? [];
      const contacts: any[] = change?.value?.contacts ?? [];
      const statuses: any[] = change?.value?.statuses ?? [];

      for (const status of statuses) {
        const recipientPhone = normalisePhone(status.recipient_id ?? "");
        const statusType: string = status.status ?? "unknown";
        const errorInfo: string | null = status.errors?.length
          ? status.errors
              .map((e: any) => `${e.code}: ${e.title}${e.error_data?.details ? " — " + e.error_data.details : ""}`)
              .join("; ")
          : null;

        console.log(`WhatsApp status update for ${recipientPhone}: ${statusType}${errorInfo ? ` (${errorInfo})` : ""}`);

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
          console.error("Message has no sender phone number — skipping.");
          continue;
        }

        const contactName: string =
          contacts.find((c: any) => c.wa_id === message.from)?.profile?.name ??
          senderPhone;

        // Blue double-tick on the customer's side, same as any real WhatsApp
        // reply — Muhammad asked for this so the customer knows someone (the
        // bot) has actually seen their message. Fired in the background, not
        // awaited: it's cosmetic for the customer and must never add latency
        // to the bot's actual reply.
        if (message.id) markAsRead(message.id).catch((err) => console.error("markAsRead failed:", err));

        const sb = makeSupabase();

        const agent = AGENT_ROTATION.find((a) => normalisePhone(a.phone) === senderPhone);

        if (message.type === "image") {
          if (agent) {
            console.log(`Image from agent ${agent.name} — ignoring (agents aren't processed as leads).`);
            continue;
          }
          await handleImageMessage(sb, message, senderPhone, contactName, timestamp);
          continue;
        }

        const input = extractUserInput(message);
        if (!input) {
          console.log(`Skipping unsupported message of type: ${message.type}`);
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
        // customer's actual last message time, not lead.updated_at — that
        // column is bumped by ANY write to the row (an agent just opening the
        // conversation flips is_unread, which touches updated_at via the
        // leads_updated_at trigger), so it silently resets on CRM activity
        // that has nothing to do with the conversation going stale. Read it
        // before the inbound insert below so this always reflects the PRIOR
        // message, never the one being logged in this same request.
        const lastCustomerTouch = wasCreated ? null : await getLastInboundAt(sb, lead.id);

        // Logging the inbound message doesn't need to finish before the bot
        // can respond — neither depends on the other's result, so they run
        // concurrently instead of adding the log write's time to the delay
        // before the customer sees a reply.
        await Promise.all([
          insertCommunication(sb, lead.id, "inbound", input.text, timestamp, undefined, message.id),
          runBotStep(sb, lead, wasCreated, input, lastCustomerTouch),
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

const AGENT_ROTATION = [
  { id: "9bfb2f92-658b-4868-90b9-dd041515d111", name: "Ehsan Wazir", phone: "923342224925" },
  { id: "2bc20292-76bb-467b-a2a1-7bfa0cad4421", name: "Muhammad Hanzala", phone: "923235163874" },
];
const ROTATION_BATCH_SIZE = 10;

async function assignAgentRoundRobin(sb: SupabaseClient): Promise<typeof AGENT_ROTATION[number]> {
  const { count } = await sb.from("leads").select("id", { count: "exact", head: true });
  const totalLeads = count ?? 1;
  const agentIndex = Math.floor((totalLeads - 1) / ROTATION_BATCH_SIZE) % AGENT_ROTATION.length;
  return AGENT_ROTATION[agentIndex];
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
    // Nothing downstream reads is_unread before responding to the customer —
    // this was a full extra DB round-trip (~150-300ms to the project's
    // ap-northeast-1 region) sitting in the critical path of every single
    // message from a returning lead, the most common case by far. Same
    // background pattern already used for agent notification below.
    const markUnread = sb.from("leads").update({ is_unread: true }).eq("id", existing.id).then(
      ({ error }) => { if (error) console.error("Error marking lead unread:", error.message); },
    );
    const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
    if (waitUntil) waitUntil(markUnread); else markUnread.catch((err: unknown) => console.error("markUnread failed:", err));
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
  // both run in the background, not awaited here — nothing the customer
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
        `[assigned to ${agent.name}, notification disabled — Muhammad, 21 July 2026]`,
        new Date().toISOString(),
      );
      return;
    }
    const pingResult = await sendButtons(
      agent.phone,
      `A new lead is waiting for you in the CRM. Please follow up.`,
      [{ id: `ack_${newLead.id}`, title: "I've got this" }],
    );
    await sb.from("leads").update({
      agent_ping_count: 1,
      agent_last_pinged_at: new Date().toISOString(),
    }).eq("id", newLead.id);
    await insertCommunication(
      sb,
      newLead.id,
      "outbound",
      pingResult.ok
        ? `[assigned to ${agent.name}, notified]`
        : `[assigned to ${agent.name}, notification SEND FAILED — ${pingResult.error}]`,
      new Date().toISOString(),
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
    await insertCommunication(sb, lead.id, "inbound", "[image received — no media ID in payload]", timestamp);
    return;
  }

  const stored = await downloadAndStoreMedia(sb, mediaId, lead.id);
  await insertCommunication(
    sb,
    lead.id,
    "inbound",
    stored.ok ? "[deposit screenshot received]" : `[image received — FAILED to store: ${stored.error}]`,
    timestamp,
    stored.ok ? stored.path : undefined,
    message.id,
  );

  const ackResult = await sendText(
    to,
    "Got it. Your deposit screenshot has been received, our team will confirm it shortly.",
  );
  await logOutbound(sb, lead.id, combineSendLog(ackResult));

  if (lead.assigned_agent_id) {
    const assignedAgent = AGENT_ROTATION.find((a) => a.id === lead.assigned_agent_id);
    if (assignedAgent) {
      const pingResult = await sendText(assignedAgent.phone, "A deposit screenshot just came in from a lead in the CRM. Please review.");
      await insertCommunication(
        sb,
        lead.id,
        "outbound",
        pingResult.ok ? `[agent ${assignedAgent.name} notified of screenshot]` : `[SEND FAILED: agent screenshot notification — ${pingResult.error}]`,
        new Date().toISOString(),
      );
    }
  }
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
  // instead of lead.updated_at deliberately — updated_at is bumped by ANY
  // write to the lead row (an agent opening the conversation, a note, a tag),
  // not just real customer messages, which silently reset every idle-time
  // check below whenever the CRM was merely looked at.
  const lastTouch = new Date(lastCustomerTouch ?? lead.created_at ?? Date.now()).getTime();
  const returningAfterGap = (Date.now() - lastTouch) / 3600000 >= HANDOFF_STALE_HOURS;

  if (lead.needs_human) {
    const explicitRequest = /requested human agent/i.test(lead.handoff_reason ?? "");
    if (explicitRequest || !returningAfterGap) return;
    await sb.from("leads").update({ needs_human: false, handoff_reason: null, retry_count: 0 }).eq("id", lead.id);
    lead.needs_human = false;
    lead.retry_count = 0;
  }

  // A returning lead's old near-limit retry count shouldn't instantly re-escalate
  // them on the first message back — give the resumed flow a fresh count.
  if (returningAfterGap && (lead.retry_count ?? 0) > 0) {
    await sb.from("leads").update({ retry_count: 0 }).eq("id", lead.id);
    lead.retry_count = 0;
  }

  if (wasCreated) {
    const greeting = matchGreeting(input) ?? "hello";
    // Sequential, not parallel — a brand new customer's very first message
    // is the worst possible place for a delivery-order gamble. Sending both
    // at once shaved a little latency but Meta could (and, reported live,
    // did) deliver the language card before the greeting text, reading as
    // the bot answering out of order. Guaranteed order matters far more
    // here than the small time saved.
    const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
    const r2 = await sendLanguageCard(to);
    await logOutbound(sb, lead.id, combineSendLog(r1, r2));
    return;
  }

  const lang: Lang = lead.language === "ur" ? "ur" : "en";

  // A lead abandoned mid-flow (never explicitly declined, just went quiet)
  // has no restart rule today — only "declined" gets one. Anyone returning
  // to any of these stages after a long gap has their new message
  // misinterpreted as an answer to whatever question they left hanging,
  // days or weeks ago, which reads as the bot behaving inconsistently
  // between a fresh number and one with old test/lead history. Same
  // restart shape as the declined-lead rule below, just covering every
  // abandonable mid-flow stage instead of only one.
  //
  // input.selectionId is only ever set when the customer tapped a REAL
  // button/list option still on their screen (never for typed free text) —
  // that is always intentional and tied to the exact stage they're in, so
  // it must never be discarded as "stale." Found live, 22 July 2026: M
  // Junaid tapped "FAQs" on a >24h-old Main Menu card and the bot restarted
  // him to the greeting instead of answering, because this check didn't
  // distinguish a real tap from ambiguous typed text.
  const MIDFLOW_RESTART_STAGES = [
    "awaiting_menu", "awaiting_broker", "awaiting_experience",
    "awaiting_traded_before", "awaiting_deposit_confirm", "qualified",
  ];
  const hoursIdle = (Date.now() - lastTouch) / 3600000;
  if (!wasCreated && !input.selectionId && MIDFLOW_RESTART_STAGES.includes(lead.bot_stage) && hoursIdle >= DECLINED_RESTART_HOURS) {
    await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
    const greeting = matchGreeting(input) ?? "hello";
    // Sequential — same fix as the wasCreated path above, guaranteed order.
    const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
    const r2 = await sendLanguageCard(to);
    await logOutbound(sb, lead.id, `[Stale mid-flow lead, was ${lead.bot_stage}, restarted after 24h+]\n${combineSendLog(r1, r2)}`);
    return;
  }

  // A mistaken tap (wrong broker, wrong experience level, etc.) previously
  // had no way back — the lead was stuck re-answering the current question
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
        await handleUnmatched(sb, lead, to, input, 2, "language choice", () => sendLanguageCard(to));
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
        await handleUnmatched(sb, lead, to, input, 2, "main menu choice", () => sendMainMenuCard(to, lang));
        return;
      }

      if (choice === "start_trading") {
        await advanceStage(sb, lead, "awaiting_broker");
        const r = await sendBrokerCard(to, "Which broker would you like to use?");
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

    case "awaiting_broker": {
      const broker = matchBroker(input);
      if (!broker) {
        await handleUnmatched(sb, lead, to, input, 2, "broker choice", () =>
          sendBrokerCard(to, "Sorry, I didn't catch that. Which broker would you like to use?"),
        );
        return;
      }
      await advanceStage(sb, lead, "awaiting_experience", { broker_choice: broker });
      const rExp = await sendExperienceButtons(to, "Great choice! Are you new to trading, or already experienced?");
      await logOutbound(sb, lead.id, combineSendLog(rExp));
      return;
    }

    case "awaiting_experience": {
      const experience = matchExperience(input);
      if (!experience) {
        await handleUnmatched(sb, lead, to, input, 2, "experience level", () =>
          sendExperienceButtons(to, "Just to confirm, are you new to trading, or already experienced?"),
        );
        return;
      }

      if (experience === "new") {
        await advanceStage(sb, lead, "awaiting_traded_before");
        const r = await sendTradedBeforeButtons(to, "No problem! Have you traded before (with any broker)?");
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
        await handleUnmatched(sb, lead, to, input, 2, "traded-before answer", () =>
          sendTradedBeforeButtons(to, "Sorry, have you traded before with any broker?"),
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
        // A question about depositing less than $500 skips the re-prompt —
        // that's a real objection needing a person's answer, not ambiguous
        // input worth re-asking Yes/No over.
        if (asksAboutLowerDeposit(input)) {
          await escalate(sb, lead, to, "asked about depositing less than $500");
          return;
        }
        // Give one clarifying re-prompt before handing off, so a single question
        // at the deposit step doesn't instantly escalate a hot lead.
        await handleUnmatched(sb, lead, to, input, 2, "deposit confirmation", () =>
          sendDepositConfirm(to, lead.broker_choice, "Sorry, just a Yes or No, are you ready to proceed with the $500 deposit?"),
        );
        return;
      }

      if (yesNo === "yes") {
        // "Both" (added 21 July 2026, Badar) shows both brokers' links/codes
        // together instead of picking one — a lead who wants to use both
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

        // 2026-07-21 (Badar): don't assume every lead is starting from zero —
        // some are already trading on this broker. Either a fresh $500
        // deposit or an existing $500+ balance both count, the screenshot is
        // what actually matters (it's the real signal a lead has closed, see
        // handleImageMessage).
        const rQualified = await sendText(
          to,
          `Perfect! Deposit $500 in your own ${brokerName} account using the link below:\n${linkSection}\n\nAlready trading with ${brokerName} and have $500 or more deposited? Even better, that counts too. Either way, send your account screenshot showing the deposit here and our team will confirm and unlock your free $250 mentorship course. A team member will follow up with you shortly!`,
        );
        await logOutbound(sb, lead.id, combineSendLog(rQualified));
        return;
      }

      // 21 July 2026 (Badar, live-tested): same fix as the Premium Signalling
      // Group menu option — this used to auto-dump the full deposit
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
      // qualified / declined — conversation already resolved.

      // Declined leads returning after a day restart from scratch (greeting +
      // language picker), same shape as the wasCreated flow. Qualified leads
      // get the same 24h+ restart, but via MIDFLOW_RESTART_STAGES above (it
      // runs before this switch), so they never actually reach this branch
      // once stale — this check only fires for declined leads still within
      // the window, or qualified leads that haven't gone stale yet.
      const hoursSinceTouch = (Date.now() - lastTouch) / 3600000;
      if (lead.bot_stage === "declined" && hoursSinceTouch >= DECLINED_RESTART_HOURS) {
        await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
        const greeting = matchGreeting(input) ?? "hello";
        // Sequential — same fix as the wasCreated path above, guaranteed order.
        const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
        const r2 = await sendLanguageCard(to);
        await logOutbound(sb, lead.id, `[Declined lead returned after 24h+, restarted]\n${combineSendLog(r1, r2)}`);
        return;
      }

      // A question about depositing less than $500 needs a person, not a
      // generic ack — escalate with a specific reason so the agent knows
      // exactly what to answer instead of reconstructing context later.
      if (asksAboutLowerDeposit(input)) {
        await escalate(sb, lead, to, "asked about depositing less than $500");
        return;
      }

      // A lead whose conversation already resolved (declined/qualified) used
      // to get this identical canned ack forever, no matter what they said —
      // this was the actual cause behind "why do I keep getting the same
      // reply" reports (Junaid, 21 July). Every other stuck point in the
      // funnel escalates to a human after repeated messages via
      // handleUnmatched; this branch never did. Same threshold (2) applied
      // here now. Greetings are exempt from the count, same as elsewhere —
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

      const prefix = greeting ? `${greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY} ` : "";
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
    const greetResult = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
    const rePromptResult = await rePrompt();
    await logOutbound(sb, lead.id, combineSendLog(greetResult, rePromptResult));
    return;
  }

  const retries = (lead.retry_count ?? 0) + 1;
  if (retries >= limit) {
    await escalate(sb, lead, to, `stuck at ${lead.bot_stage} after ${retries} attempt(s)`);
    return;
  }
  await sb.from("leads").update({ retry_count: retries }).eq("id", lead.id);
  const apologyResult = await sendText(to, CONFUSED_REPLY);
  const rePromptResult = await rePrompt();
  await logOutbound(sb, lead.id, combineSendLog(apologyResult, rePromptResult));
}

// Every forward step in the funnel goes through this instead of a bare
// `.update()` so bot_stage_history always has an accurate stack of where the
// lead has been — that stack is what makes "Go Back" possible. extraFields
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
    case "awaiting_broker":
      result = await sendBrokerCard(to, "Sure, which broker would you like to use?");
      break;
    case "awaiting_experience":
      result = await sendExperienceButtons(to, "No problem, are you new to trading, or already experienced?");
      break;
    case "awaiting_traded_before":
      result = await sendTradedBeforeButtons(to, "Sure, have you traded before (with any broker)?");
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
): Promise<void> {
  await sb.from("leads").update({
    needs_human:    true,
    handoff_reason: reason,
    updated_at:     new Date().toISOString(),
  }).eq("id", lead.id);

  const result = await sendText(
    to,
    "Thanks for your patience. Let me connect you with a team member who'll help you personally, please hold on a moment.",
  );
  await logOutbound(
    sb,
    lead.id,
    result.ok ? `[escalated to human: ${reason}]` : `[SEND FAILED: escalation message (still escalated: ${reason}) — ${result.error}]`,
  );
}

async function handleAgentReply(
  sb: SupabaseClient,
  agent: { id: string; name: string; phone: string },
  input: UserInput,
): Promise<void> {
  const leadId = input.selectionId?.startsWith("ack_") ? input.selectionId.slice(4) : null;
  if (!leadId) {
    console.log(`Message from agent ${agent.name} was not an ack button — ignoring.`);
    return;
  }

  const { data: lead } = await sb.from("leads").select("id, agent_acknowledged_at").eq("id", leadId).maybeSingle();
  if (!lead || lead.agent_acknowledged_at) return;

  await sb.from("leads").update({ agent_acknowledged_at: new Date().toISOString() }).eq("id", lead.id);
  await insertCommunication(sb, lead.id, "outbound", `[agent ${agent.name} acknowledged assignment]`, new Date().toISOString());
  await sendText(agent.phone, `Got it, lead marked as picked up.`);
}

// Caller is responsible for logging the result (matches every other send*
// helper) — this used to log internally, which double-logged when reused as
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
        { id: "menu_free_signals", title: "Premium Signalling Group", description: "By Badar Tanvir, bilkul free, deposit zaroori nahi" },
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

// Broker choice already had 3 options (Exness/XM/Both) — WhatsApp caps
// interactive button messages at 3, leaving no room for a 4th "Back" button,
// so this step uses a list message instead (same pattern as the menu/language
// cards) purely to fit the back option in.
async function sendBrokerCard(to: string, bodyText: string): Promise<SendResult> {
  return await sendList(
    to,
    "Choose Broker",
    bodyText,
    "Choose",
    [
      { id: "broker_exness", title: "Exness" },
      { id: "broker_xm", title: "XM" },
      { id: "broker_both", title: "Both" },
      { id: "nav_back", title: "Go Back" },
    ],
  );
}

async function sendExperienceButtons(to: string, bodyText: string): Promise<SendResult> {
  return await sendButtons(to, bodyText, [
    { id: "exp_new", title: "New to trading" },
    { id: "exp_experienced", title: "Experienced" },
    { id: "nav_back", title: "Go Back" },
  ]);
}

async function sendTradedBeforeButtons(to: string, bodyText: string): Promise<SendResult> {
  return await sendButtons(to, bodyText, [
    { id: "traded_yes", title: "Yes" },
    { id: "traded_no", title: "No" },
    { id: "nav_back", title: "Go Back" },
  ]);
}

async function logOutbound(sb: SupabaseClient, leadId: string, body: string): Promise<void> {
  await insertCommunication(sb, leadId, "outbound", body, new Date().toISOString());
}

// A lead asking whether they can deposit less than $500 (or otherwise trying
// to negotiate the amount) needs a real answer from a person, not the bot's
// generic "a team member will follow up" ack — that ack doesn't tell the
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
  // exactly this objection — found 21 July 2026 after a real lead asked
  // this and the bot never escalated it.
  const mentionsMinimumDeposit = /\bdeposit\b/.test(t) && /\b(minimum|kam se kam|kum se kum)\b/.test(t);
  return (mentionsAmount && mentionsLess) || mentionsMinimumDeposit;
}

function matchNavBack(input: UserInput): boolean {
  if (input.selectionId === "nav_back") return true;
  return /^\s*(back|previous|pichl?e|wapas)\s*$/i.test(input.text);
}

function matchGreeting(input: UserInput): "hello" | "walaikum" | null {
  const t = input.text.trim();
  if (/^(hi+|hello+|hey+)[\s!.]*$/i.test(t)) return "hello";
  if (/^(a+\s*salam(u|o)?\s*(alaikum|alieukum)?|assalam(u|o)?\s*(alaikum|alieukum)?|salam|slm|a+oa+)[\s!.]*$/i.test(t)) return "walaikum";
  return null;
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
  if (/new/i.test(input.text)) return "new";
  if (/experienc/i.test(input.text)) return "experienced";
  return null;
}

function matchYesNo(input: UserInput): "yes" | "no" | null {
  if (input.selectionId === "traded_yes" || input.selectionId === "deposit_yes") return "yes";
  if (input.selectionId === "traded_no" || input.selectionId === "deposit_no") return "no";
  if (/^\s*(yes|y|haan|ji|han)\b/i.test(input.text)) return "yes";
  if (/^\s*(no|n|nahi)\b/i.test(input.text)) return "no";
  return null;
}

async function sendText(to: string, body: string): Promise<SendResult> {
  const result = await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
  return { ...result, text: body };
}

async function sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<SendResult> {
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
  return { ...result, text: `${bodyText}\n[Buttons: ${buttons.map((b) => b.title).join(" / ")}]` };
}

async function sendList(
  to: string,
  headerText: string,
  bodyText: string,
  buttonLabel: string,
  rows: { id: string; title: string; description?: string }[],
): Promise<SendResult> {
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
  return { ...result, text: `${headerText}\n${bodyText}\n[Options: ${rows.map((r) => r.title).join(" / ")}]` };
}

// `text` is what was actually sent (or attempted), always populated —
// this is what the CRM's Conversations tab shows agents, so it must never
// be a placeholder description. See combineSendLog below, used everywhere
// this used to be replaced with a hand-typed "[thing sent]" bracket note.
type SendResult = { ok: boolean; error?: string; text: string };

// Builds one log line from one or more send attempts, real content always,
// never a description of the content. Fixed 21 July 2026 — every outbound
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

async function callGraphApi(payload: unknown): Promise<SendResult> {
  const { token, phoneId } = await getWaCredentials();
  if (!token || !phoneId) {
    const msg = "No WhatsApp access token / phone number ID available (checked env vars and settings table)";
    console.error(msg + " — skipping outbound send.");
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
