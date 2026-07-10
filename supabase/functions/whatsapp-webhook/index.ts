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

// Referral links — kept in sync with simulator.html
const LINKS = {
  exness: "https://one.exnesstrack.org/a/eatgh2cl7y",
  exnessCode: "eatgh2cl7y",
  doprime: "https://my.dooprime.com/links/go/45031",
  doprimeCode: "45031",
  form: "https://forms.gle/ivBDDYQSLPvKHzXM9",
};

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
// Normalises a text message or an interactive button reply into a single
// shape the bot logic can match against.
// ---------------------------------------------------------------------------
type UserInput = { text: string; buttonId: string | null };

function extractUserInput(message: any): UserInput | null {
  if (message.type === "text") {
    return { text: message.text?.body ?? "", buttonId: null };
  }
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return {
      text: message.interactive.button_reply?.title ?? "",
      buttonId: message.interactive.button_reply?.id ?? null,
    };
  }
  return null;
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
// we're waiting on an answer for. A brand-new lead gets the opening question
// immediately, without trying to interpret their first message.
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
    await sendText(
      to,
      "Assalam o Alaikum! 👋 This is Badar Tanveer's team — mein Team Badar ka official assistant hoon.\n\nInvest $500 with us and get Badar's $250 mentorship course absolutely FREE 🎓\n\nWhich broker would you like to use?",
    );
    await sendButtons(to, "Please choose your broker:", [
      { id: "broker_exness", title: "Exness" },
      { id: "broker_doprime", title: "Do Prime" },
    ]);
    await logOutbound(sb, lead.id, "[broker choice buttons sent]");
    return;
  }

  switch (lead.bot_stage) {
    case "awaiting_broker": {
      const broker = matchBroker(input);
      if (!broker) {
        if (await handleMiss(sb, lead, to, 2)) return;
        await sendButtons(to, "Sorry, I didn't catch that — which broker would you like to use?", [
          { id: "broker_exness", title: "Exness" },
          { id: "broker_doprime", title: "Do Prime" },
        ]);
        await logOutbound(sb, lead.id, "[re-prompt: broker choice]");
        return;
      }
      await sb.from("leads").update({ broker_choice: broker, bot_stage: "awaiting_experience", retry_count: 0 }).eq("id", lead.id);
      await sendButtons(to, "Great choice! Are you new to trading, or already experienced?", [
        { id: "exp_new", title: "New to trading" },
        { id: "exp_experienced", title: "Experienced" },
      ]);
      await logOutbound(sb, lead.id, "[experience buttons sent]");
      return;
    }

    case "awaiting_experience": {
      const experience = matchExperience(input);
      if (!experience) {
        if (await handleMiss(sb, lead, to, 2)) return;
        await sendButtons(to, "Just to confirm — are you new to trading, or already experienced?", [
          { id: "exp_new", title: "New to trading" },
          { id: "exp_experienced", title: "Experienced" },
        ]);
        await logOutbound(sb, lead.id, "[re-prompt: experience]");
        return;
      }

      if (experience === "new") {
        await sb.from("leads").update({ bot_stage: "awaiting_traded_before", retry_count: 0 }).eq("id", lead.id);
        await sendButtons(to, "No problem! Have you traded before (with any broker)?", [
          { id: "traded_yes", title: "Yes" },
          { id: "traded_no", title: "No" },
        ]);
        await logOutbound(sb, lead.id, "[traded-before buttons sent]");
        return;
      }

      await sb.from("leads").update({ trader_experience: "experienced", bot_stage: "awaiting_deposit_confirm", retry_count: 0 }).eq("id", lead.id);
      await sendDepositConfirm(to, sb, lead.id, lead.broker_choice);
      return;
    }

    case "awaiting_traded_before": {
      const yesNo = matchYesNo(input);
      if (!yesNo) {
        if (await handleMiss(sb, lead, to, 2)) return;
        await sendButtons(to, "Sorry — have you traded before with any broker?", [
          { id: "traded_yes", title: "Yes" },
          { id: "traded_no", title: "No" },
        ]);
        await logOutbound(sb, lead.id, "[re-prompt: traded-before]");
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
        if (await handleMiss(sb, lead, to, 1)) return;
        await sendButtons(to, "Sorry, just a Yes or No — are you ready to proceed with the $500 deposit?", [
          { id: "deposit_yes", title: "Yes, I'm ready" },
          { id: "deposit_no", title: "Not right now" },
        ]);
        await logOutbound(sb, lead.id, "[re-prompt: deposit confirm]");
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

        await sendText(
          to,
          `Perfect! 🎉 Create your account with ${lead.broker_choice === "doprime" ? "Do Prime" : "Exness"} here 👇\n${link}\n\nReferral / partner code: ${code}\n\nAfter depositing $500, send your deposit screenshot here — our team will confirm and unlock your free $250 mentorship course. A team member will follow up with you shortly!`,
        );
        await logOutbound(sb, lead.id, "[qualified: signup link + course unlock sent]");
        return;
      }

      // No — fall back to the free-signals path instead of losing the lead
      await sb.from("leads").update({
        ready_to_deposit: false,
        bot_stage: "declined",
        retry_count: 0,
      }).eq("id", lead.id);

      await sendText(
        to,
        `No problem at all! You can still join our Premium Signalling Group for FREE:\n\n1️⃣ Create your account through our link (mandatory)\n2️⃣ Deposit $500 (this is YOUR trading capital, not a fee)\n3️⃣ Send your deposit screenshot here\n4️⃣ Submit the verification form: ${LINKS.form}\n\nYou'll be added within 48 hours ✅`,
      );
      await logOutbound(sb, lead.id, "[declined $500: free-signals fallback sent]");
      return;
    }

    default: {
      // qualified / declined — conversation already resolved, hand off to a human
      await sendText(to, "Thanks for the message! 🙏 A team member will follow up with you shortly.");
      await logOutbound(sb, lead.id, "[post-resolution acknowledgement sent]");
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// handleMiss
// Called when the user's reply doesn't match what the current step expects.
// Increments the per-step retry counter (reset to 0 whenever a lead advances a
// stage). When the counter reaches `limit`, the lead is escalated to a human and
// this returns true so the caller stops instead of re-prompting again.
// `limit` is 2 for most steps, 1 for the deposit step (see runBotStep).
// ---------------------------------------------------------------------------
async function handleMiss(
  sb: SupabaseClient,
  lead: any,
  to: string,
  limit: number,
): Promise<boolean> {
  const retries = (lead.retry_count ?? 0) + 1;
  if (retries >= limit) {
    await escalate(sb, lead, to, `stuck at ${lead.bot_stage} after ${retries} attempt(s)`);
    return true;
  }
  await sb.from("leads").update({ retry_count: retries }).eq("id", lead.id);
  return false;
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

  await sendText(
    to,
    "Thanks for your patience! 🙏 Let me connect you with a team member who'll help you personally — please hold on a moment.",
  );
  await logOutbound(sb, lead.id, `[escalated to human: ${reason}]`);
}

async function sendDepositConfirm(to: string, sb: SupabaseClient, leadId: string, brokerChoice: string): Promise<void> {
  const brokerLabel = brokerChoice === "doprime" ? "Do Prime" : "Exness";
  await sendButtons(
    to,
    `This offer needs a $500 deposit with ${brokerLabel} to unlock Badar's free $250 mentorship course. Ready to proceed?`,
    [
      { id: "deposit_yes", title: "Yes, I'm ready" },
      { id: "deposit_no", title: "Not right now" },
    ],
  );
  await logOutbound(sb, leadId, "[deposit confirm buttons sent]");
}

async function logOutbound(sb: SupabaseClient, leadId: string, body: string): Promise<void> {
  await insertCommunication(sb, leadId, "outbound", body, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Matchers — accept either a button reply id or loose free-text
// ---------------------------------------------------------------------------
function matchBroker(input: UserInput): "exness" | "doprime" | null {
  if (input.buttonId === "broker_exness") return "exness";
  if (input.buttonId === "broker_doprime") return "doprime";
  if (/exness/i.test(input.text)) return "exness";
  if (/do\s*prime|d\s*prime/i.test(input.text)) return "doprime";
  return null;
}

function matchExperience(input: UserInput): "new" | "experienced" | null {
  if (input.buttonId === "exp_new") return "new";
  if (input.buttonId === "exp_experienced") return "experienced";
  if (/new/i.test(input.text)) return "new";
  if (/experienc/i.test(input.text)) return "experienced";
  return null;
}

function matchYesNo(input: UserInput): "yes" | "no" | null {
  if (input.buttonId === "traded_yes" || input.buttonId === "deposit_yes") return "yes";
  if (input.buttonId === "traded_no" || input.buttonId === "deposit_no") return "no";
  if (/^\s*(yes|y|haan|ji|han)\b/i.test(input.text)) return "yes";
  if (/^\s*(no|n|nahi)\b/i.test(input.text)) return "no";
  return null;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API senders
// ---------------------------------------------------------------------------
async function sendText(to: string, body: string): Promise<void> {
  await callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

async function sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<void> {
  await callGraphApi({
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

async function callGraphApi(payload: unknown): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error("WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — skipping outbound send.");
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`WhatsApp send failed (${res.status}):`, errBody);
  }
}

// ---------------------------------------------------------------------------
// normalisePhone
// ---------------------------------------------------------------------------
function normalisePhone(raw: string): string {
  if (!raw) return "";
  return raw.startsWith("+") ? raw : `+${raw}`;
}
