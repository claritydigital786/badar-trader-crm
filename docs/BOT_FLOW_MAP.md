# Badar Trader WhatsApp Bot — Flow Map v1.0 (DRAFT for Muhammad's review)

Date: 20 July 2026
Source: this map is drawn 1:1 from the bot that is LIVE today (whatsapp-webhook v28).
It is the single source of truth for the v2 bot. Review it box by box.
To request a change, cite the box number: "Box 4: change wording to ..." or
"Box 6's No button should go to Box 2, not Box 8."

Nothing about the bot gets built or changed until this map is approved.

---

## How to read this map

- Every screen a customer can see is a numbered BOX.
- Each box shows: the exact message text (English and Roman Urdu), the buttons,
  and the box each button leads to.
- Typed words work as well as button taps (listed under "Also accepted typed").
- The RULES section at the end covers everything that applies across all boxes
  (retries, silence, restarts, escalation).

---

## BOX 1 — First contact (new lead, or restart)

Bot sends two messages:

1. Greeting reply:
   - If customer wrote a salam: "Walaikum Assalam! 👋"
   - Otherwise: "Hello! 👋"
2. Language picker (list card):
   - Header: "Dear Customer"
   - Body: "Welcome to Team Badar's Self-Service. Please select your preferred
     language from the Main Menu below."
   - Options:
     - "English" (Continue in English) → BOX 2 in English
     - "Roman Urdu" (Urdu mein jaari rakhein) → BOX 2 in Roman Urdu

Also accepted typed: "english" / "urdu" / "roman".
Anything else → RULE R1 (retry, then escalate).

## BOX 2 — Main menu (list card)

EN: header "Dear Customer", body "Welcome to Team Badar's Self-Service.
Please select your preferred option from the Main Menu below."
UR: header "Piyare Customer", body "Team Badar ki Self-Service mein khush
aamdeed. Braye meherbani neeche Main Menu se apna pasandeeda option chunein."

Options:
1. "Start Trading" / "Trading Shuru Karein" — subtitle "$500 offer + free
   mentorship course" → BOX 3
2. "Free Signals Group" — subtitle "By Badar Tanveer, join for free, no
   deposit required" / "bilkul free, deposit zaroori nahi" → BOX 8
3. "Talk to an Agent" / "Agent se Baat Karein" → BOX 9
4. "FAQs" → BOX 7

Also accepted typed: "trading"/"shuru" → 1; "signal" → 2; "agent"/"baat" → 3;
"faq" → 4. Anything else → RULE R1.

## BOX 3 — Broker choice (buttons)

Text: "Which broker would you like to use?"
(NOTE: English only today — no Urdu twin exists. Flagged for review.)

Buttons: "Exness" → BOX 4 · "XM" → BOX 4 · "Both" → BOX 4
Also accepted typed: "exness", "xm", "both". Anything else → RULE R1
(re-ask wording: "Sorry, I didn't catch that — which broker would you like
to use?").

## BOX 4 — Experience (buttons)

Text: "Great choice! Are you new to trading, or already experienced?"
(English only today — flagged.)

Buttons: "New to trading" → BOX 5 · "Experienced" → BOX 6
Also accepted typed: "new", "experienced". Anything else → RULE R1.

## BOX 5 — Traded before? (buttons; only for "New to trading")

Text: "No problem! Have you traded before (with any broker)?"
(English only today — flagged.)

Buttons: "Yes" → BOX 6 · "No" → BOX 6
(Both answers continue to BOX 6; the answer is recorded on the lead.)
Anything else → RULE R1.

## BOX 6 — Deposit confirmation (buttons)

Text: "This offer needs a $500 deposit with [Exness / XM] to unlock
Badar's free $250 mentorship course. Ready to proceed?"
(English only today — flagged.)

Buttons:
- "Yes, I'm ready" → BOX 10 (QUALIFIED)
- "Not right now" → BOX 8 (declined path)

Also accepted typed: yes/haan/ji/han → BOX 10; no/nahi → BOX 8.
Special: if the customer asks about depositing LESS than $500 → BOX 9
immediately, with the reason "asked about depositing less than $500"
(RULE R5). Anything else → one clarifying re-ask ("Sorry, just a Yes or
No — are you ready to proceed with the $500 deposit?"), then RULE R1.

## BOX 7 — FAQs

Bot sends the FAQ text, then re-sends BOX 2 (customer stays at the menu).

EN text:
"❓ Quick FAQs:
• Is the $250 course really free? Yes — deposit $500 with our partner broker
  and it unlocks automatically.
• Can I deposit less than $500? The minimum is $500. If you already have less
  deposited, just top it up — there's no upper limit either.
• Is my deposit safe? Yes, it stays in your own broker account; Badar Trader
  never collects payments directly.
• How do I withdraw? Directly from your broker account, anytime — no
  restrictions from us.
• Need more help? Choose 'Talk to an Agent' to reach our team."

UR text: (same five answers in Roman Urdu, as deployed.)

## BOX 8 — Free Signals / declined path (long text, EN + UR)

Sent when the customer picks "Free Signals Group" from the menu, or answers
"Not right now" at BOX 6.

EN text (deployed 14 July, finalized with Badar):
"🎓 Join Badar's Premium Signals Group, FREE, plus unlock our Forex Trading
Mastery Course (worth $250) at no cost.

Here's how it works:
1️⃣ Deposit $500 in your own Exness or XM trading account. This is your
money, in your own account — not a payment to us.
2️⃣ Already have $500 or more deposited with Exness or XM? Even better,
that counts too. Have less than $500 already deposited? Just top it up to
$500 and you're good to go.
3️⃣ Send us a screenshot of your account showing your Account ID and the
deposit amount clearly visible.
4️⃣ We verify it and you're added to the Premium Signals Group and unlock the
full Forex Trading Mastery Course, both completely free.

New to Exness or XM? Create your account through our link:
[Exness link] · [XM link]

Already have an account under a different partner? Choose 'Talk to an Agent'
and we'll help you switch it over.

Verification form: crm.badartrader.com/join.html

You can withdraw your funds anytime, directly from your own broker account.
We never collect or hold your money ✅"

UR text: full Roman Urdu twin, as deployed.

After BOX 8 the conversation is INTERNALLY marked "declined" (see RULE R4
and DESIGN QUESTION Q2 below).

## BOX 9 — Talk to an agent (escalation)

Text: "Thanks for your patience! 🙏 Let me connect you with a team member
who'll help you personally — please hold on a moment."

The lead is flagged for a human; the bot goes SILENT for this customer.
- If the customer explicitly asked for an agent: silence holds until a human
  takes over (no expiry).
- If escalation came from confusion/being stuck: silence auto-expires after
  2 hours; the customer's next message resumes the flow from their current
  box (RULE R3).

## BOX 10 — Qualified (the goal)

Text (updated 21 July 2026, Badar — a lead may already be trading on this
broker, so a fresh deposit and an existing $500+ balance both count; the
screenshot is what actually matters, that's the real signal a lead has
closed, not the verbal "yes"):
"Perfect! 🎉 Deposit $500 in your own [Exness / XM] account using the link
below 👇
[link]
Referral / partner code: [code]
Already trading with [Exness / XM] and have $500 or more deposited? Even
better, that counts too. Either way, send your account screenshot showing
the deposit here and our team will confirm and unlock your free $250
mentorship course. A team member will follow up with you shortly!"

If the customer picked "Both" at BOX 3 (added 21 July 2026, Muhammad): the
[Exness / XM] label reads "Exness or XM", and both brokers' links and
referral/partner codes are listed together instead of just one.

Internally: lead status becomes QUALIFIED; a summary card (name, broker,
experience, ready-for-deposit, phone) is logged for the team.

## BOX 11 — Screenshot received (works at ANY point)

When the customer sends an image:
Text: "Got it! ✅ Your deposit screenshot has been received — our team will
confirm it shortly."
The image is saved to the lead's file and the assigned agent gets a WhatsApp
ping: "📸 A deposit screenshot just came in from a lead in the CRM. Please
review."

## BOX 12 — After the conversation is resolved (qualified or declined)

Any later message from the customer gets:
"Thanks for the message! 🙏 A team member will follow up with you shortly."
(with a greeting reply first if they greeted).

Exceptions:
- DECLINED customer returning after 24+ hours → fresh start at BOX 1 (RULE R4).
- Question about depositing less than $500 → BOX 9 with specific reason
  (RULE R5).
- QUALIFIED customers never restart (they already hold their next steps).

---

## RULES (apply across all boxes)

R1 — Unrecognized input: bot apologizes ("This is Team Badar Tanvir. We are
ever ready to serve for our brand's purpose. We're really sorry, but we
couldn't quite understand your message. 🙏") and re-asks the current box.
After 2 failed attempts at the same box → BOX 9 (escalate, reason "stuck").

R2 — Greetings are always understood: "hi/hello/salam" at any box gets the
matching greeting reply plus a re-ask of the current box, and does NOT count
as a failed attempt.

R3 — Silence expiry: confusion/inactivity escalations expire after 2 hours;
explicit "talk to an agent" requests never expire.

R4 — Declined restart: a declined customer who returns after 24+ hours is
treated as a fresh opportunity — full restart at BOX 1. Within 24 hours they
just get the BOX 12 acknowledgement.

R5 — Deposit negotiation detector: a message mentioning the amount AND a
"less/lower/kam/discount" word goes straight to a human with the reason
attached, so the agent knows exactly what to answer.

R6 — Mid-flow abandonment restart (added 21 July 2026, from a real bug found
testing with multiple phone numbers): a customer sitting at BOX 2, 3, 4, 5,
or 6 (main menu through deposit confirmation) who goes quiet and returns
after 24+ hours gets a full restart at BOX 1, same shape as R4's declined
restart, instead of having their new message misread as an answer to
whatever question they left hanging days or weeks earlier. Before this
rule, only declined customers ever restarted — anyone abandoned mid-flow
stayed stuck on that question forever.

R6 — New lead handling: every brand-new lead is auto-assigned to an agent
(round-robin between Ehsan and Hanzala, switching every 10 leads) and the
agent gets a WhatsApp ping with an "I've got this" button.

R7 — WhatsApp's 24-hour rule (Meta's rule, not ours): the bot can reply
freely only within 24 hours of the customer's last message. Reaching out
after that requires a Meta-approved template. This shapes what any follow-up
feature can promise.

---

## DESIGN QUESTIONS for Muhammad (answer by number)

Q1 — Boxes 3, 4, 5, 6 exist in English only. A customer who chose Roman Urdu
falls back to English mid-flow. Should v2 add the Urdu twins? (Recommended:
yes.)

Q2 — Choosing "Free Signals Group" from the menu internally marks the lead
"declined" — same as refusing the deposit. Per your definition, these people
are future community subscribers, not decliners. Should v2 give them their
own track (e.g. "signals interest") so the team can see them as a separate
group? (Recommended: yes.)

Q3 — BOX 9's promise "please hold on a moment" is only true in office hours.
After 6 p.m. nobody answers until morning. Should the after-hours version
say something honest like "our team will reach you first thing tomorrow"?

Q4 — The old simulator page (Simulator v3) contains a DIFFERENT flow with an
IB-change walkthrough (Exness live-chat steps). That flow exists nowhere in
the real bot — switching an existing account is currently agent-assisted via
BOX 9. Should the IB-change walkthrough become a real bot path in v2, or
stay with agents?
