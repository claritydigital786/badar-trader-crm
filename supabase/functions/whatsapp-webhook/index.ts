// Badar Trader CRM — WhatsApp Cloud API Webhook
// Supabase Edge Function (Deno / TypeScript)
//
// Required environment variables (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
//   WHATSAPP_VERIFY_TOKEN     — must match what you enter in Meta Developer Portal
//   WHATSAPP_ACCESS_TOKEN     — System User permanent token (whatsapp_business_messaging + whatsapp_business_management)
//   WHATSAPP_PHONE_NUMBER_ID  — Phone Number ID of the number leads message (currently +92 371 5773903)
//   SUPABASE_URL              — automatically injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — from Supabase Dashboard → Settings → API (use the service_role key, NOT anon)
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GRAPH_VERSION = "v21.0";

// The real WhatsApp credentials live in the `settings` table (wa_access_token,
// wa_phone_number_id) rather than as Edge Function secrets. Env vars are tried
// first (in case they get configured properly later) and the settings table is
// the fallback that actually has working values today. Cached per warm instance.
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

// Referral links — kept in sync with simulator.html
const LINKS = {
  exness: "https://one.exnesstrack.org/a/eatgh2cl7y",
  exnessCode: "eatgh2cl7y",
  doprime: "https://my.dooprime.com/links/go/45031",
  doprimeCode: "45031",
  form: "https://forms.gle/ivBDDYQSLPvKHzXM9",
};

type Lang = "en" | "ur";

const HELLO_REPLY = "Hello! 👋";
const WALAIKUM_REPLY = "Walaikum Assalam! 👋";
const CONFUSED_REPLY = "This is Team Badar Tanvir. We are ever ready to serve for our brand's purpose. We're really sorry, but we couldn't quite understand your message. 🙏";

function freeSignalsText(lang: Lang): string {
  if (lang === "ur") {
    return `Koi masla nahi! Aap phir bhi hamara Free Premium Signals Group By Badar Tanveer FREE join kar sakte hain:\n\n1️⃣ Hamare link se apna account banayein (zaroori)\n2️⃣ $500 deposit karein (ye aapka trading capital hai, fee nahi)\n3️⃣ Deposit ka screenshot yahan bhejein\n4️⃣ Verification form submit karein: ${LINKS.form}\n\nAap 48 ghanton mein add ho jayenge ✅`;
  }
  return `No problem at all! You can still join our Free Premium Signals Group By Badar Tanveer for FREE:\n\n1️⃣ Create your account through our link (mandatory)\n2️⃣ Deposit $500 (this is YOUR trading capital, not a fee)\n3️⃣ Send your deposit screenshot here\n4️⃣ Submit the verification form: ${LINKS.form}\n\nYou'll be added within 48 hours ✅`;
}

function faqText(lang: Lang): string {
  if (lang === "ur") {
    return `❓ Mukhtasar FAQs:\n\n• Kya $250 course waqai free hai? Haan — hamare partner broker ke saath $500 deposit karein, course khud unlock ho jayega.\n• Kya mera deposit mahfooz hai? Haan, ye aapke apne broker account mein rehta hai; Badar Trader kabhi khud payment nahi leta.\n• Withdraw kaise karoon? Seedha apne broker account se, kabhi bhi — hamari taraf se koi rok nahi.\n• Aur madad chahiye? "Talk to an Agent" chunein, hamari team se baat karein.`;
  }
  return `❓ Quick FAQs:\n\n• Is the $250 course really free? Yes — deposit $500 with our partner broker and it unlocks automatically.\n• Is my deposit safe? Yes, it stays in your own broker account; Badar Trader never collects payments directly.\n• How do I withdraw? Directly from your broker account, anytime — no restrictions from us.\n• Need more help? Choose "Talk to an Agent" to reach our team.`;
}

function makeSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // ── GET: Webhook verification handshake (Meta calls this once on setup) ──
  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      console.log("Webhook verified successfully.");
      return new Response(challenge, { status: 200 });
    }

    console.error("Webhook verification failed — token mismatch or wrong mode.");
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Incoming WhatsApp message notification ─────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      await handleIncomingMessage(body);
    } catch (err) {
      // Log but never return non-200 to Meta (it would retry endlessly).
      console.error("Error processing WhatsApp webhook payload:", err);
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

// ---------------------------------------------------------------------------
// handleIncomingMessage
// Parses the WhatsApp Cloud API payload, upserts the lead, logs the inbound
// message, then drives the qualification bot's next step.
// ---------------------------------------------------------------------------
async function handleIncomingMessage(payload: unknown): Promise<void> {
  const entries = (payload as any)?.entry ?? [];

  for (const entry of entries) {
    const changes = entry?.changes ?? [];

    for (const change of changes) {
      const messages: any[] = change?.value?.messages ?? [];
      const contacts: any[] = change?.value?.contacts ?? [];
      const statuses: any[] = change?.value?.statuses ?? [];

      // Meta reports delivery outcome (sent/delivered/read/failed) asynchronously via
      // this same webhook, separately from the initial "accepted" response to our send
      // call. Previously nothing read this, so a send that Meta accepted but later
      // failed to deliver looked identical, in our logs, to a successful one.
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
        const input = extractUserInput(message);
        if (!input) {
          console.log(`Skipping unsupported message of type: ${message.type}`);
          continue;
        }

        const senderPhone: string = normalisePhone(message.from ?? "");
        const timestamp: string   = message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        const contactName: string =
          contacts.find((c: any) => c.wa_id === message.from)?.profile?.name ??
          senderPhone;

        if (!senderPhone) {
          console.error("Message has no sender phone number — skipping.");
          continue;
        }

        console.log(`Incoming WhatsApp from ${senderPhone}: "${input.text}"`);

        const sb = makeSupabase();

        const { lead, wasCreated } = await upsertLead(sb, senderPhone, contactName, timestamp);
        if (!lead) continue;

        await insertCommunication(sb, lead.id, "inbound", input.text, timestamp);

        await runBotStep(sb, lead, wasCreated, input);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// extractUserInput
// Normalises a text message, a button reply, or a list reply into a single
// shape the bot logic can match against.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Round-robin lead assignment
// Every ROTATION_BATCH_SIZE new leads go to the same agent, then rotation
// moves to the next one in AGENT_ROTATION, looping back to the start.
// ---------------------------------------------------------------------------
const AGENT_ROTATION = [
  { id: "9bfb2f92-658b-4868-90b9-dd041515d111", name: "Ehsan Wazir", phone: "923342224925" },
  { id: "2bc20292-76bb-467b-a2a1-7bfa0cad4421", name: "Muhammad Hanzala", phone: "923235163874" },
  { id: "1a066f51-445e-45e9-816b-cfd921205b80", name: "Syed Hamza", phone: "923201946494" },
];
const ROTATION_BATCH_SIZE = 5;

async function assignAgentRoundRobin(sb: SupabaseClient): Promise<typeof AGENT_ROTATION[number]> {
  const { count } = await sb.from("leads").select("id", { count: "exact", head: true });
  const totalLeads = count ?? 1;
  const agentIndex = Math.floor((totalLeads - 1) / ROTATION_BATCH_SIZE) % AGENT_ROTATION.length;
  return AGENT_ROTATION[agentIndex];
}

// ---------------------------------------------------------------------------
// upsertLead
// Looks up an existing lead by phone number; creates a new one if not found.
// Returns the full lead row plus whether it was just created.
// ---------------------------------------------------------------------------
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

  // Notifying the agent is internal housekeeping — it must never delay the
  // customer's own greeting, which waits on this function returning. Fired
  // in the background via waitUntil rather than awaited inline.
  const notifyAgent = (async () => {
    const pingResult = await sendText(
      agent.phone,
      `🔔 New lead assigned to you: ${newLead.full_name} (${newLead.phone}). Please follow up.`,
    );
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

// ---------------------------------------------------------------------------
// insertCommunication
// ---------------------------------------------------------------------------
async function insertCommunication(
  sb: SupabaseClient,
  leadId: string,
  direction: "inbound" | "outbound",
  body: string,
  timestamp: string,
): Promise<void> {
  const { error } = await sb.from("communications").insert({
    lead_id:    leadId,
    type:       "whatsapp",
    direction:  direction,
    body:       body,
    created_at: timestamp,
  });

  if (error) {
    console.error("Error inserting communication:", error.message);
  }
}

// ---------------------------------------------------------------------------
// runBotStep
// The qualification state machine. `lead.bot_stage` tracks which question
// we're waiting on an answer for. A brand-new lead gets a greeting plus the
// language picker immediately, without trying to interpret their first
// message beyond checking whether it was itself a greeting.
// ---------------------------------------------------------------------------
async function runBotStep(
  sb: SupabaseClient,
  lead: any,
  wasCreated: boolean,
  input: UserInput,
): Promise<void> {
  const to = lead.phone.replace(/^\+/, "");

  // Once a conversation has been handed to a human, the bot stays silent so it
  // never talks over the agent. The inbound message is still logged for the CRM.
  if (lead.needs_human) return;

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
          { id: "broker_doprime", title: "Do Prime" },
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

      // faqs — answer, then resend the menu so they can pick again
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
            { id: "broker_doprime", title: "Do Prime" },
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
        // Highest-value moment: if someone hesitates or asks a question right when
        // asked to deposit $500, get a human on immediately (threshold 1, not 2).
        await handleUnmatched(sb, lead, to, input, 1, "deposit confirmation", () =>
          sendButtons(to, "Sorry, just a Yes or No — are you ready to proceed with the $500 deposit?", [
            { id: "deposit_yes", title: "Yes, I'm ready" },
            { id: "deposit_no", title: "Not right now" },
          ]),
        );
        return;
      }

      if (yesNo === "yes") {
        const link = lead.broker_choice === "doprime" ? LINKS.doprime : LINKS.exness;
        const code = lead.broker_choice === "doprime" ? LINKS.doprimeCode : LINKS.exnessCode;
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

        const rQualified = await sendText(
          to,
          `Perfect! 🎉 Create your account with ${lead.broker_choice === "doprime" ? "Do Prime" : "Exness"} here 👇\n${link}\n\nReferral / partner code: ${code}\n\nAfter depositing $500, send your deposit screenshot here — our team will confirm and unlock your free $250 mentorship course. A team member will follow up with you shortly!`,
        );
        await logOutbound(sb, lead.id, rQualified.ok ? "[qualified: signup link + course unlock sent]" : `[SEND FAILED: qualified signup link — ${rQualified.error}]`);
        return;
      }

      // No — fall back to the free-signals path instead of losing the lead
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
      // qualified / declined — conversation already resolved, hand off to a human
      const greeting = matchGreeting(input);
      const prefix = greeting ? `${greeting === "walaikum" ? WALAIKUM_REPLY : HELLO_REPLY} ` : "";
      const r = await sendText(to, `${prefix}Thanks for the message! 🙏 A team member will follow up with you shortly.`);
      await logOutbound(sb, lead.id, r.ok ? "[post-resolution acknowledgement sent]" : `[SEND FAILED: post-resolution ack — ${r.error}]`);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// handleUnmatched
// Called when the user's reply doesn't match what the current step expects.
// A plain greeting ("Hi", "Aoa", "Salam", ...) is never treated as a wrong
// answer — it gets a matching greeting reply and the current question is
// simply re-sent, with no effect on the retry counter. Anything else counts
// as a miss: the per-step retry counter increments (reset to 0 whenever a
// lead advances a stage), and once it reaches `limit` the lead is escalated
// to a human instead of being re-prompted again. `limit` is 2 for most steps,
// 1 for the deposit step (see runBotStep).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// escalate
// Hands the conversation to a human: flags the lead, tells the user a person is
// taking over, and (via the needs_human guard in runBotStep) stops the bot from
// replying further so it never talks over the agent.
// ---------------------------------------------------------------------------
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

async function sendDepositConfirm(to: string, sb: SupabaseClient, leadId: string, brokerChoice: string): Promise<SendResult> {
  const brokerLabel = brokerChoice === "doprime" ? "Do Prime" : "Exness";
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

// ---------------------------------------------------------------------------
// Matchers — accept either a button/list reply id or loose free-text
// ---------------------------------------------------------------------------
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

function matchBroker(input: UserInput): "exness" | "doprime" | null {
  if (input.selectionId === "broker_exness") return "exness";
  if (input.selectionId === "broker_doprime") return "doprime";
  if (/exness/i.test(input.text)) return "exness";
  if (/do\s*prime|d\s*prime/i.test(input.text)) return "doprime";
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

// ---------------------------------------------------------------------------
// WhatsApp Cloud API senders
// ---------------------------------------------------------------------------
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

  // Wrapped in try/catch deliberately: a non-2xx response from Meta is handled below,
  // but fetch() itself can throw (network blip, timeout, DNS) — without this, that
  // exception would propagate all the way up and abort the bot step entirely, with
  // no record of the send ever having been attempted.
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

// ---------------------------------------------------------------------------
// normalisePhone
// ---------------------------------------------------------------------------
function normalisePhone(raw: string): string {
  if (!raw) return "";
  return raw.startsWith("+") ? raw : `+${raw}`;
}
