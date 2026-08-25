# Meta App Review submission - whatsapp_business_management / whatsapp_business_messaging

Drafted 2026-08-20 while Muhammad was away from the keyboard, so the actual submission
is just copy-paste-record rather than composing from scratch. Written to match what this
app genuinely does - checked against `supabase/schema.sql`'s real `leads` and
`communications` tables, not invented. Read this whole file before submitting anything;
nothing here has been sent to Meta, this is draft content only.

Context for whoever submits: this is required because "Badar Trader CRM" (App ID
`4639983159657359`) is a Partner on the Trade Campus WABA (`1342908727797643`), not its
owner, and Meta requires Tech Provider status + Advanced Access before a partner app can
send/manage messages on a WABA it doesn't own. This is the same bar every working
WhatsApp integration on that WABA (e.g. WhatChimp) already cleared.

---

## Data usage explanation: `whatsapp_business_management`

> Badar Trader CRM is a lead management and customer conversation system built for a
> single business (Badar Trader / Trade Campus). We use whatsapp_business_management to
> read and manage the WhatsApp Business Account and phone number that our business uses
> for customer communication, and to manage our own message templates (creating,
> checking approval status). We do not manage WhatsApp assets on behalf of unrelated
> third parties - this permission is used solely to administer our own business's single
> WhatsApp Business Account and its message templates from within our own CRM.

## Data usage explanation: `whatsapp_business_messaging`

> Badar Trader CRM uses whatsapp_business_messaging to send and receive WhatsApp
> messages with our own business's customers (leads who have opted in by messaging our
> business first, or by submitting an inquiry form). Inbound messages are logged against
> a lead record (name, phone number, message body, timestamp) so our sales agents can see
> the full conversation history in one place. Outbound messages are either automated
> replies to qualify a lead (e.g. asking their preferred language, which trading
> instrument they're interested in) or manual replies typed by a human agent inside the
> CRM. We also use this permission to send Meta-approved message templates to reopen a
> conversation after the 24-hour customer service window has closed. No messages are sent
> to anyone who has not first contacted our business or submitted an inquiry form.

---

## Video walkthrough script (Meta requires this for whatsapp_business_messaging)

Meta's requirement, verbatim from their own docs: *"To request the whatsapp_business_messaging
permission, send a WhatsApp message from your app to a WhatsApp number. The recording
must show your app sending the message and the WhatsApp interface (either web or mobile
app) receiving the message."* They also want the app used to create a message template.

**Suggested recording steps, in order, one continuous take:**

1. Open the CRM (crm.badartrader.com), log in, land on Dashboard.
2. Open **Omnichannel Inbox**, open an existing real conversation with a lead who has
   messaged within the last 24 hours (so a free-form send is allowed).
3. Type a short reply in the message box and click Send.
4. **Immediately switch to your own phone's WhatsApp** (screen-record the phone too, or
   have it visible in frame) and show the message actually arriving in that customer's
   WhatsApp thread in real time - this is the specific proof Meta asks for.
5. Switch back to the CRM, open **Message Templates**, and show creating/viewing a
   template entry there (this covers "app used to create a message template").

Keep it short (2-3 minutes is plenty), unedited is fine, screen + phone both visible.

---

## Before recording

- Use a real, already-flowing conversation (not a fresh test lead) so the reply is inside
  WhatsApp's 24-hour window and won't get rejected.
- This does NOT require flipping `AI_REPLIES_ENABLED` or `BOT_REPLIES_ENABLED` - a manual
  agent reply from the Conversations tab is enough to prove the permission, and keeps
  this contained to a single deliberate send rather than turning bot automation on.
- Do this on Muhammad's laptop, with Muhammad present, since it's a real send to a real
  customer - same standing rule as every other live send in this repo.
