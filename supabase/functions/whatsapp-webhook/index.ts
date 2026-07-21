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

const HELLO_REPLY = "Hello! 👋";
const WALAIKUM_REPLY = "Walaikum Assalam! 👋";
const CONFUSED_REPLY = "This is Team Badar Tanvir. We are ever ready to serve for our brand's purpose. We're really sorry, but we couldn't quite understand your message. 🙏";

// Finalized with Badar 2026-07-14: $250 course, 1 month, free once $500+ is
// deposited with Exness or XM — new OR existing account/deposit both
// count. Leads with the Signals Group per Badar's stated campaign priority
// (subscriber growth), course is the added incentive. The real, hosted
// verification form (LINKS.form) replaces the old broken Google Form.
// Switching an existing account to Badar's IB code is a real thing agents
// help with manually — not a self-service bot flow yet — so that case routes
// to "Talk to an Agent" instead of promising steps the bot can't actually walk
// someone through.
// Do Prime dropped 2026-07-21 (Badar), replaced by XM — Ehsan supplied the
// XM referral link/code.
function freeSignalsText(lang: Lang): string {
  if (lang === "ur") {
    return `🎓 Badar ke Premium Signals Group mein FREE join karein, aur hamara Forex Trading Mastery Course ($250 ki value) bhi bilkul free unlock karein.\n\nYe kaise kaam karta hai:\n\n1️⃣ Apne Exness ya XM trading account mein $500 deposit karein. Ye aapka apna paisa hai, aapke apne account mein — hamein koi payment nahi.\n2️⃣ Pehle se $500 ya zyada deposit hai Exness ya XM mein? Aur bhi behtar, wo bhi chalega. $500 se kam hai? Bas $500 tak top up kar lein.\n3️⃣ Apne account ka screenshot bhejein jisme Account ID aur deposit amount saaf nazar aa raha ho.\n4️⃣ Hum verify karenge aur aap Premium Signals Group mein add ho jayenge aur poora Forex Trading Mastery Course bhi unlock ho jayega, dono bilkul free.\n\nExness ya XM par naye hain? Hamare link se account banayein:\n${LINKS.exness} (Exness)\n${LINKS.xm} (XM)\n\nPehle se kisi aur partner ke tehet account hai? "Agent se Baat Karein" chunein, hum switch karne mein madad karenge.\n\nVerification form: ${LINKS.form}\n\nAap apna paisa kabhi bhi apne broker account se withdraw kar sakte hain. Hum kabhi paisa nahi lete ✅`;
  }
  return `🎓 Join Badar's Premium Signals Group, FREE, plus unlock our Forex Trading Mastery Course (worth $250) at no cost.\n\nHere's how it works:\n\n1️⃣ Deposit $500 in your own Exness or XM trading account. This is your money, in your own account — not a payment to us.\n2️⃣ Already have $500 or more deposited with Exness or XM? Even better, that counts too. Have less than $500 already deposited? Just top it up to $500 and you're good to go.\n3️⃣ Send us a screenshot of your account showing your Account ID and the deposit amount clearly visible.\n4️⃣ We verify it and you're added to the Premium Signals Group and unlock the full Forex Trading Mastery Course, both completely free.\n\nNew to Exness or XM? Create your account through our link:\n${LINKS.exness} (Exness)\n${LINKS.xm} (XM)\n\nAlready have an account under a different partner? Choose "Talk to an Agent" and we'll help you switch it over.\n\nVerification form: ${LINKS.form}\n\nYou can withdraw your funds anytime, directly from your own broker account. We never collect or hold your money ✅`;
}

function faqText(lang: Lang): string {
  if (lang === "ur") {
    return `❓ Mukhtasar FAQs:\n\n• Kya $250 course waqai free hai? Haan — hamare partner broker ke saath $500 deposit karein, course khud unlock ho jayega.\n• Kya main $500 se kam deposit kar sakta hoon? Minimum $500 hai. Agar pehle se kam hai to top up kar lein — upar ki koi limit nahi hai.\n• Kya mera deposit mahfooz hai? Haan, ye aapke apne broker account mein rehta hai; Badar Trader kabhi khud payment nahi leta.\n• Withdraw kaise karoon? Seedha apne broker account se, kabhi bhi — hamari taraf se koi rok nahi.\n• Aur madad chahiye? "Talk to an Agent" chunein, hamari team se baat karein.`;
  }
  return `❓ Quick FAQs:\n\n• Is the $250 course really free? Yes — deposit $500 with our partner broker and it unlocks automatically.\n• Can I deposit less than $500? The minimum is $500. If you already have less deposited, just top it up — there's no upper limit either.\n• Is my deposit safe? Yes, it stays in your own broker account; Badar Trader never collects payments directly.\n• How do I withdraw? Directly from your broker account, anytime — no restrictions from us.\n• Need more help? Choose "Talk to an Agent" to reach our team.`;
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

        await insertCommunication(sb, lead.id, "inbound", input.text, timestamp, undefined, message.id);

        await runBotStep(sb, lead, wasCreated, input);
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
    await sb.from("leads").update({ is_unread: true }).eq("id", existing.id);
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

  const agent = await assignAgentRoundRobin(sb);
  await sb.from("leads").update({ assigned_agent_id: agent.id }).eq("id", newLead.id);
  newLead.assigned_agent_id = agent.id;

  const notifyAgent = (async () => {
    const pingResult = await sendButtons(
      agent.phone,
      `🔔 A new lead is waiting for you in the CRM. Please follow up.`,
      [{ id: `ack_${newLead.id}`, title: "✅ I've got this" }],
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
    "Got it! ✅ Your deposit screenshot has been received — our team will confirm it shortly.",
  );
  await logOutbound(sb, lead.id, ackResult.ok ? "[screenshot ack sent]" : `[SEND FAILED: screenshot ack — ${ackResult.error}]`);

  if (lead.assigned_agent_id) {
    const assignedAgent = AGENT_ROTATION.find((a) => a.id === lead.assigned_agent_id);
    if (assignedAgent) {
      const pingResult = await sendText(assignedAgent.phone, "📸 A deposit screenshot just came in from a lead in the CRM. Please review.");
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

async function runBotStep(
  sb: SupabaseClient,
  lead: any,
  wasCreated: boolean,
  input: UserInput,
): Promise<void> {
  const to = lead.phone.replace(/^\+/, "");

  // Handoff behaviour:
  //  - Explicit "talk to an agent" requests keep the bot silent (human owns it).
  //  - Confusion/inactivity handoffs auto-expire: a lead returning after a gap
  //    has the flag cleared and resumes the flow from their current stage, so a
  //    lead who got stuck once (and whom no agent answered) is never left mute.
  const lastTouch = new Date(lead.updated_at ?? lead.created_at ?? Date.now()).getTime();
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
    const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
    const r2 = await sendLanguageCard(to);
    const ok = r1.ok && r2.ok;
    const errorDetail = [!r1.ok ? r1.error : null, !r2.ok ? r2.error : null].filter(Boolean).join("; ");
    await logOutbound(sb, lead.id, ok ? "[greeting + language picker card sent]" : `[SEND FAILED: greeting + language picker — ${errorDetail}]`);
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
  const MIDFLOW_RESTART_STAGES = [
    "awaiting_menu", "awaiting_broker", "awaiting_experience",
    "awaiting_traded_before", "awaiting_deposit_confirm",
  ];
  const hoursIdle = (Date.now() - lastTouch) / 3600000;
  if (!wasCreated && MIDFLOW_RESTART_STAGES.includes(lead.bot_stage) && hoursIdle >= DECLINED_RESTART_HOURS) {
    await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
    const greeting = matchGreeting(input) ?? "hello";
    const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
    const r2 = await sendLanguageCard(to);
    const ok = r1.ok && r2.ok;
    const errorDetail = [!r1.ok ? r1.error : null, !r2.ok ? r2.error : null].filter(Boolean).join("; ");
    await logOutbound(sb, lead.id, ok
      ? `[stale mid-flow lead (was ${lead.bot_stage}) returned after 24h+ — flow restarted: greeting + language picker sent]`
      : `[SEND FAILED: mid-flow restart — ${errorDetail}]`);
    return;
  }

  switch (lead.bot_stage) {
    case "awaiting_language": {
      const chosen = matchLanguage(input);
      if (!chosen) {
        await handleUnmatched(sb, lead, to, input, 2, "language choice", () => sendLanguageCard(to));
        return;
      }
      await sb.from("leads").update({ language: chosen, bot_stage: "awaiting_menu", retry_count: 0 }).eq("id", lead.id);
      const rMenu = await sendMainMenuCard(to, chosen);
      await logOutbound(sb, lead.id, rMenu.ok ? "[main menu card sent]" : `[SEND FAILED: main menu card — ${rMenu.error}]`);
      return;
    }

    case "awaiting_menu": {
      const choice = matchMenuChoice(input);
      if (!choice) {
        await handleUnmatched(sb, lead, to, input, 2, "main menu choice", () => sendMainMenuCard(to, lang));
        return;
      }

      if (choice === "start_trading") {
        await sb.from("leads").update({ bot_stage: "awaiting_broker", retry_count: 0 }).eq("id", lead.id);
        const r = await sendButtons(to, "Which broker would you like to use?", [
          { id: "broker_exness", title: "Exness" },
          { id: "broker_xm", title: "XM" },
          { id: "broker_both", title: "Both" },
        ]);
        await logOutbound(sb, lead.id, r.ok ? "[broker choice buttons sent]" : `[SEND FAILED: broker choice buttons — ${r.error}]`);
        return;
      }

      if (choice === "free_signals") {
        await sb.from("leads").update({ bot_stage: "declined", retry_count: 0 }).eq("id", lead.id);
        const r = await sendText(to, freeSignalsText(lang));
        await logOutbound(sb, lead.id, r.ok ? "[free signals info sent from menu]" : `[SEND FAILED: free signals info — ${r.error}]`);
        return;
      }

      if (choice === "talk_agent") {
        await escalate(sb, lead, to, "requested human agent from main menu");
        return;
      }

      {
        const r1 = await sendText(to, faqText(lang));
        const r2 = await sendMainMenuCard(to, lang);
        const ok = r1.ok && r2.ok;
        const errorDetail = [!r1.ok ? r1.error : null, !r2.ok ? r2.error : null].filter(Boolean).join("; ");
        await logOutbound(sb, lead.id, ok ? "[faq answer + menu resent]" : `[SEND FAILED: faq answer + menu — ${errorDetail}]`);
      }
      return;
    }

    case "awaiting_broker": {
      const broker = matchBroker(input);
      if (!broker) {
        await handleUnmatched(sb, lead, to, input, 2, "broker choice", () =>
          sendButtons(to, "Sorry, I didn't catch that — which broker would you like to use?", [
            { id: "broker_exness", title: "Exness" },
            { id: "broker_xm", title: "XM" },
            { id: "broker_both", title: "Both" },
          ]),
        );
        return;
      }
      await sb.from("leads").update({ broker_choice: broker, bot_stage: "awaiting_experience", retry_count: 0 }).eq("id", lead.id);
      const rExp = await sendButtons(to, "Great choice! Are you new to trading, or already experienced?", [
        { id: "exp_new", title: "New to trading" },
        { id: "exp_experienced", title: "Experienced" },
      ]);
      await logOutbound(sb, lead.id, rExp.ok ? "[experience buttons sent]" : `[SEND FAILED: experience buttons — ${rExp.error}]`);
      return;
    }

    case "awaiting_experience": {
      const experience = matchExperience(input);
      if (!experience) {
        await handleUnmatched(sb, lead, to, input, 2, "experience level", () =>
          sendButtons(to, "Just to confirm — are you new to trading, or already experienced?", [
            { id: "exp_new", title: "New to trading" },
            { id: "exp_experienced", title: "Experienced" },
          ]),
        );
        return;
      }

      if (experience === "new") {
        await sb.from("leads").update({ bot_stage: "awaiting_traded_before", retry_count: 0 }).eq("id", lead.id);
        const r = await sendButtons(to, "No problem! Have you traded before (with any broker)?", [
          { id: "traded_yes", title: "Yes" },
          { id: "traded_no", title: "No" },
        ]);
        await logOutbound(sb, lead.id, r.ok ? "[traded-before buttons sent]" : `[SEND FAILED: traded-before buttons — ${r.error}]`);
        return;
      }

      await sb.from("leads").update({ trader_experience: "experienced", bot_stage: "awaiting_deposit_confirm", retry_count: 0 }).eq("id", lead.id);
      await sendDepositConfirm(to, sb, lead.id, lead.broker_choice);
      return;
    }

    case "awaiting_traded_before": {
      const yesNo = matchYesNo(input);
      if (!yesNo) {
        await handleUnmatched(sb, lead, to, input, 2, "traded-before answer", () =>
          sendButtons(to, "Sorry — have you traded before with any broker?", [
            { id: "traded_yes", title: "Yes" },
            { id: "traded_no", title: "No" },
          ]),
        );
        return;
      }
      await sb.from("leads").update({ trader_experience: "new", bot_stage: "awaiting_deposit_confirm", retry_count: 0 }).eq("id", lead.id);
      await sendDepositConfirm(to, sb, lead.id, lead.broker_choice);
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
          sendButtons(to, "Sorry, just a Yes or No — are you ready to proceed with the $500 deposit?", [
            { id: "deposit_yes", title: "Yes, I'm ready" },
            { id: "deposit_no", title: "Not right now" },
          ]),
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

        const summary = `🔔 New Lead — Badar Funnel\nName: ${lead.full_name}\nBroker: ${lead.broker_choice}\nTrader type: ${lead.trader_experience}\nReady for $500 deposit: Yes\nWhatsApp: ${lead.phone}`;
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
          `Perfect! 🎉 Deposit $500 in your own ${brokerName} account using the link below 👇\n${linkSection}\n\nAlready trading with ${brokerName} and have $500 or more deposited? Even better, that counts too. Either way, send your account screenshot showing the deposit here and our team will confirm and unlock your free $250 mentorship course. A team member will follow up with you shortly!`,
        );
        await logOutbound(sb, lead.id, rQualified.ok ? "[qualified: signup link + course unlock sent]" : `[SEND FAILED: qualified signup link — ${rQualified.error}]`);
        return;
      }

      await sb.from("leads").update({
        ready_to_deposit: false,
        bot_stage: "declined",
        retry_count: 0,
      }).eq("id", lead.id);

      const rDeclined = await sendText(to, freeSignalsText(lang));
      await logOutbound(sb, lead.id, rDeclined.ok ? "[declined $500: free-signals fallback sent]" : `[SEND FAILED: declined fallback — ${rDeclined.error}]`);
      return;
    }

    default: {
      // qualified / declined — conversation already resolved.

      // Declined leads returning after a day restart from scratch (greeting +
      // language picker), same shape as the wasCreated flow. Qualified leads
      // are exempt: they already hold concrete next steps (deposit + send the
      // screenshot here) and restarting would wipe that context.
      const hoursSinceTouch = (Date.now() - lastTouch) / 3600000;
      if (lead.bot_stage === "declined" && hoursSinceTouch >= DECLINED_RESTART_HOURS) {
        await sb.from("leads").update({ bot_stage: "awaiting_language", retry_count: 0 }).eq("id", lead.id);
        const greeting = matchGreeting(input) ?? "hello";
        const r1 = await sendText(to, greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY);
        const r2 = await sendLanguageCard(to);
        const ok = r1.ok && r2.ok;
        const errorDetail = [!r1.ok ? r1.error : null, !r2.ok ? r2.error : null].filter(Boolean).join("; ");
        await logOutbound(sb, lead.id, ok
          ? "[declined lead returned after 24h+ — flow restarted: greeting + language picker sent]"
          : `[SEND FAILED: 24h restart greeting — ${errorDetail}]`);
        return;
      }

      // A question about depositing less than $500 needs a person, not a
      // generic ack — escalate with a specific reason so the agent knows
      // exactly what to answer instead of reconstructing context later.
      if (asksAboutLowerDeposit(input)) {
        await escalate(sb, lead, to, "asked about depositing less than $500");
        return;
      }

      // Otherwise acknowledge and let an agent follow up; do NOT flag for
      // handoff (avoids silent leads).
      const greeting = matchGreeting(input);
      const prefix = greeting ? `${greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY} ` : "";
      const r = await sendText(to, `${prefix}Thanks for the message! 🙏 A team member will follow up with you shortly.`);
      await logOutbound(sb, lead.id, r.ok ? "[post-resolution acknowledgement sent]" : `[SEND FAILED: post-resolution ack — ${r.error}]`);
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
    const ok = greetResult.ok && rePromptResult.ok;
    const errorDetail = [
      !greetResult.ok ? `greeting: ${greetResult.error}` : null,
      !rePromptResult.ok ? `re-prompt: ${rePromptResult.error}` : null,
    ].filter(Boolean).join("; ");
    await logOutbound(sb, lead.id, ok ? `[greeting ack + re-prompt: ${label}]` : `[SEND FAILED: greeting ack + re-prompt: ${label} — ${errorDetail}]`);
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
  const ok = apologyResult.ok && rePromptResult.ok;
  const errorDetail = [
    !apologyResult.ok ? `apology: ${apologyResult.error}` : null,
    !rePromptResult.ok ? `re-prompt: ${rePromptResult.error}` : null,
  ].filter(Boolean).join("; ");
  await logOutbound(sb, lead.id, ok ? `[confused apology + re-prompt: ${label}]` : `[SEND FAILED: confused apology + re-prompt: ${label} — ${errorDetail}]`);
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
    "Thanks for your patience! 🙏 Let me connect you with a team member who'll help you personally — please hold on a moment.",
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
  await sendText(agent.phone, `✅ Got it — lead marked as picked up.`);
}

async function sendDepositConfirm(to: string, sb: SupabaseClient, leadId: string, brokerChoice: string): Promise<SendResult> {
  const brokerLabel = brokerChoice === "xm" ? "XM" : brokerChoice === "both" ? "Exness or XM" : "Exness";
  const result = await sendButtons(
    to,
    `This offer needs a $500 deposit with ${brokerLabel} to unlock Badar's free $250 mentorship course. Ready to proceed?`,
    [
      { id: "deposit_yes", title: "Yes, I'm ready" },
      { id: "deposit_no", title: "Not right now" },
    ],
  );
  await logOutbound(sb, leadId, result.ok ? "[deposit confirm buttons sent]" : `[SEND FAILED: deposit confirm buttons — ${result.error}]`);
  return result;
}

async function sendLanguageCard(to: string): Promise<SendResult> {
  return await sendList(
    to,
    "Dear Customer",
    "Welcome to Team Badar's Self-Service.\n\nPlease select your preferred language from the Main Menu below.",
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
      "Piyare Customer",
      "Team Badar ki Self-Service mein khush aamdeed.\n\nBraye meherbani neeche Main Menu se apna pasandeeda option chunein.",
      "Menu",
      [
        { id: "menu_start_trading", title: "Trading Shuru Karein", description: "$500 offer + free mentorship course" },
        { id: "menu_free_signals", title: "Free Signals Group", description: "By Badar Tanveer, bilkul free, deposit zaroori nahi" },
        { id: "menu_talk_agent", title: "Agent se Baat Karein", description: "Hamari team se rabta karein" },
        { id: "menu_faqs", title: "FAQs", description: "Aam sawalat ke jawabat" },
      ],
    );
  }

  return await sendList(
    to,
    "Dear Customer",
    "Welcome to Team Badar's Self-Service.\n\nPlease select your preferred option from the Main Menu below.",
    "Menu",
    [
      { id: "menu_start_trading", title: "Start Trading", description: "$500 offer + free mentorship course" },
      { id: "menu_free_signals", title: "Free Signals Group", description: "By Badar Tanveer, join for free, no deposit required" },
      { id: "menu_talk_agent", title: "Talk to an Agent", description: "Connect with our team" },
      { id: "menu_faqs", title: "FAQs", description: "Common questions answered" },
    ],
  );
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
  return mentionsAmount && mentionsLess;
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
  return await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

async function sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<SendResult> {
  return await callGraphApi({
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
}

async function sendList(
  to: string,
  headerText: string,
  bodyText: string,
  buttonLabel: string,
  rows: { id: string; title: string; description?: string }[],
): Promise<SendResult> {
  return await callGraphApi({
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
}

type SendResult = { ok: boolean; error?: string };

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
