# Badar Trader WhatsApp Bot — Flow Map v1.1 (DRAFT for Muhammad's review)

Date: 21 July 2026
Source: drawn from the bot live today plus the review round on 21 July.
Single source of truth for the v2 bot. Review it box by box.
To request a change, cite the box number: Box 4, change wording to ... or
Box 6's No button should go to Box 2, not Box 8.

Nothing about the bot gets built or changed until this map is approved.
Items marked PROPOSED below still need a final yes before they're built.

---

## How to read this map

- Every screen a customer can see is a numbered BOX.
- Each box shows the exact message text (English and Roman Urdu), the buttons,
  and the box each button leads to.
- Typed words work as well as button taps, listed under Also accepted typed,
  meaning the bot recognizes that typed word as the same as tapping the
  matching button, so a customer can type instead of tapping and it still works.
- The RULES section at the end covers everything that applies across all boxes:
  retries, silence, restarts, escalation.

---

## BOX 1 — First contact (new lead, or restart)

Bot sends two messages:

1. Greeting reply, matched to how the customer greeted (updated 21 July,
   Muhammad — reply in kind to whoever greets in their own language or
   community's greeting):
   - AOA or Assalamu alaikum, any capitalization: Wa alaikum assalam
   - Namaste: Namaste
   - Sat Sri Akal (Sikh community greeting): Sat Sri Akal
   - An Arabic greeting: Marhaba
   - Plain hi or hello: Hello
   NOTE: these are draft phrasings for the non-Urdu, non-English replies.
   Please have a native speaker confirm Namaste, Sat Sri Akal, and Marhaba
   before this goes live, exact wording matters here.
2. Language picker (list card):
   - Header: Dear Customer
   - Body: Welcome to Team Badar's self-service. Please select your
     preferred language from the main menu below.
   - Options:
     - English, continue in English, goes to BOX 2 in English
     - Roman Urdu, Urdu mein jaari rakhein, goes to BOX 2 in Roman Urdu

Also accepted typed: english, urdu, roman.
Anything else goes to RULE R1 (retry, then escalate).

## BOX 2 — Main menu (list card)

EN: header Dear Customer, body Welcome to Team Badar's self-service. Please
select your preferred option from the main menu below.

UR (changed 21 July, Muhammad — "Pyaare Customer" was too dramatic, a
plainer form used instead, PROPOSED, confirm the exact phrase): header
Mohtaram Customer, body Team Badar ki self-service mein khush aamdeed.
Baraye meherbani neeche main menu se apna pasandeeda option chunein.

Options:
1. Start Trading, Trading Shuru Karein, subtitle $500 offer plus free
   mentorship course, goes to BOX 3
2. Premium Signalling Group (changed 21 July, Muhammad — this is Badar's
   named WhatsApp community for signals; selecting it now goes straight to
   a human agent instead of an automatic message, see BOX 8A below),
   subtitle by Badar Tanvir, join free, no deposit required, goes to BOX 8A
3. Talk to an Agent, Agent se Baat Karein, goes to BOX 9
4. FAQs, goes to BOX 7 (also reachable from any box, see below)

Also accepted typed: trading or shuru goes to option 1; signal goes to
option 2; agent or baat goes to option 3; faq goes to option 4, and faq is
recognized at every box, not just here, so a customer can ask for it
mid-flow without losing their place. Anything else goes to RULE R1.

## BOX 3 — New or existing trader (PROPOSED restructure, needs your confirm)

Muhammad's 21 July feedback: ask this before broker choice, not after, so
someone who already has a live account on Exness or XM skips straight to
the screenshot step instead of being walked through account opening they
don't need.

Text: Have you already opened a trading account with Exness or XM, or would
this be your first time?

Buttons: Already have an account, goes to BOX 3B · First time, goes to
BOX 3A

### BOX 3A — Broker choice for a first-time trader

Text: Which broker would you like to use?

Buttons: Exness, goes to BOX 4 · XM, goes to BOX 4 · Both, goes to BOX 4
Also accepted typed: exness, xm, both. Anything else goes to RULE R1
(re-ask wording: Sorry, I did not catch that, which broker would you like
to use?)

While guiding a first-time trader through opening a new account, any
confused or unclear reply escalates to a human agent quickly rather than
retrying multiple times, since getting stuck while opening a real account
is higher-stakes than getting stuck picking a menu option.

### BOX 3B — Which broker for an existing trader

Text: Which one, Exness or XM, or both?

Buttons: Exness, goes to BOX 6 · XM, goes to BOX 6 · Both, goes to BOX 6
(An existing trader skips the experience and traded-before questions
entirely and goes straight to the deposit/screenshot step, since they
already have an account and likely already have funds in it.)

NOTE: whether someone wants the free course only, or the free course plus
the Premium Signalling Group, the requirement is the same either way, a
screenshot. The Signalling Group itself is a separate thing from the
course, joining one does not require joining the other.

## BOX 4 — Experience (buttons, first-time traders only)

Text: Great choice. Are you new to trading, or already experienced?

Buttons: New to trading, goes to BOX 5 · Experienced, goes to BOX 6
Also accepted typed: new, experienced. Anything else goes to RULE R1.

## BOX 5 — Traded before? (buttons, only for New to trading)

Text: No problem. Have you traded before, with any broker?

Buttons: Yes, goes to BOX 6 · No, goes to BOX 6
(Both answers continue to BOX 6, the answer is recorded on the lead.)
Anything else goes to RULE R1.

## BOX 6 — Deposit confirmation (buttons)

Text: This offer needs a $500 deposit with Exness or XM to unlock Badar's
free $250 course. Ready to proceed?

Buttons:
- Yes, I'm ready, goes to BOX 10, qualified
- Not right now, goes to BOX 8, declined path

Also accepted typed: yes, haan, ji, han goes to BOX 10; no, nahi goes to
BOX 8.

Special case, less than $500: if the customer asks about depositing less
than $500, it goes straight to BOX 9 with the reason attached, so the agent
knows exactly what to answer (RULE R5). This is already working today, no
change needed.

Special case, a different broker entirely: if the customer already trades
with a broker other than Exness or XM, that is handled in BOX 8's text,
Talk to an Agent, and the team helps them switch over. Already working
today, no change needed.

Anything else gets one clarifying re-ask (Sorry, just a yes or no, are you
ready to proceed with the $500 deposit?), then RULE R1.

Requirements for the free $250 course, summarized:
- $500 deposited, either freshly or already in the account
- If the account already exists, show it via screenshot
- If trading with a broker other than Exness or XM, must switch to one of
  these two first, an agent helps with that
- Submit a screenshot of the deposit
- Team verifies it before the course unlocks

## BOX 7 — FAQs

Bot sends the FAQ text, then re-sends BOX 2, the customer stays at the menu.
Also reachable from any box by typing faq, not only from the menu.

EN text:
Quick FAQs.
Is the $250 course really free? Yes, deposit $500 with our partner broker
and it unlocks automatically.
Can I deposit less than $500? The minimum is $500. If you already have less
deposited, just top it up, there is no upper limit either.
Is my deposit safe? Yes, it stays in your own broker account, Badar Trader
never collects payments directly.
How do I withdraw? Directly from your broker account, anytime, no
restrictions from us.
Need more help? Choose Talk to an Agent to reach our team.

UR text: same five answers in Roman Urdu, as deployed.

## BOX 8 — Declined path (long text, EN + UR)

Sent when the customer answers Not right now at BOX 6.

EN text (cleaned up 21 July, em-dashes and emojis removed per Muhammad's
note, this is the second pass on this box):
"Join Badar's Premium Signalling Group, free, plus unlock our Forex Trading
Mastery Course, worth $250, at no cost.

Here is how it works.

1. Deposit $500 in your own Exness or XM trading account. This is your
money, in your own account, not a payment to us.

2. Already have $500 or more deposited with Exness or XM? Even better, that
counts too. Have less than $500 already deposited? Just top it up to $500
and you are good to go.

3. Send us a screenshot of your account showing your Account ID and the
deposit amount clearly visible.

4. We verify it and you are added to the Premium Signalling Group and
unlock the full Forex Trading Mastery Course, both completely free.

New to Exness or XM? Create your account through our link:
[Exness link] · [XM link]

Already have an account under a different partner? Choose Talk to an Agent
and we will help you switch it over.

Verification form: crm.badartrader.com/join.html

You can withdraw your funds anytime, directly from your own broker account.
We never collect or hold your money."

UR text: full Roman Urdu twin, as deployed, same cleanup applied.

After BOX 8 the conversation is internally marked declined (see RULE R4).

## BOX 8A — Premium Signalling Group interest (changed 21 July, Muhammad)

Sent when the customer picks Premium Signalling Group from the menu.
No longer an automatic text dump, goes straight to a human agent.

Text, during office hours (9am to 6pm PKT): Thank you for your interest in
the Premium Signalling Group. One of our team members will assist you
personally, please hold on a moment.

Text, after 6pm PKT: Thank you for your interest in the Premium Signalling
Group. Our team will get back to you first thing tomorrow during working
hours.

The lead is flagged for a human the same way BOX 9 works.

## BOX 9 — Talk to an agent (escalation)

Text: Thank you for your patience. Let me connect you with a team member
who will help you personally, please hold on a moment.

After 6pm PKT, same after-hours wording as BOX 8A applies here too: our
team will get back to you first thing tomorrow.

The lead is flagged for a human, the bot goes silent for this customer.
- If the customer explicitly asked for an agent: silence holds until a
  human takes over, no expiry.
- If escalation came from confusion or being stuck: silence auto-expires
  after 2 hours, the customer's next message resumes the flow from their
  current box (RULE R3).

## BOX 10 — Qualified (the goal)

Text: Perfect. Deposit $500 in your own Exness or XM account using the link
below.
[link]
Referral / partner code: [code]
Already trading with Exness or XM and have $500 or more deposited? Even
better, that counts too. Either way, send your account screenshot showing
the deposit here and our team will confirm and unlock your free $250
course. A team member will follow up with you shortly.

If the customer picked Both at broker choice: the label reads Exness or
XM, and both brokers' links and referral/partner codes are listed together
instead of just one.

Internally: lead status becomes QUALIFIED, a summary card, name, broker,
experience, ready-for-deposit, phone, is logged for the team.

Screenshot verification (Muhammad's 21 July concern, flagged as a real,
unresolved problem, not brushed aside): agents currently review every
screenshot by hand, and some submitted images are not real screenshots at
all. Properly automating this would need Exness and XM to give access to
verify deposits against their own records, a third-party dependency, not
something buildable in-house alone. Staying manual for now per Muhammad's
call. Logged as a real backlog item, not dropped.

## BOX 11 — Screenshot received (works at any point)

When the customer sends an image:
Text: Got it. Your deposit screenshot has been received, our team will
confirm it shortly.
The image is saved to the lead's file and the assigned agent gets a
WhatsApp ping: A deposit screenshot just came in from a lead in the CRM,
please review.

## BOX 12 — After the conversation is resolved, qualified or declined

Any later message from the customer gets: Thanks for the message. A team
member will follow up with you shortly. (with a greeting reply first if
they greeted).

Exceptions:
- Declined customer returning after 24+ hours: fresh start at BOX 1 (RULE R4).
- Mid-flow abandoned customer returning after 24+ hours: fresh start at
  BOX 1 (RULE R6).
- Question about depositing less than $500: BOX 9 with specific reason
  (RULE R5).
- Qualified customers never restart, they already hold their next steps.

---

## RULES (apply across all boxes)

R1 — Unrecognized input: bot apologizes (This is Team Badar Tanvir. We are
ever ready to serve for our brand's purpose. We are really sorry, but we
could not quite understand your message.) and re-asks the current box,
resending the same question the customer was already looking at. After 2
failed attempts at the same box, goes to BOX 9, escalate, reason stuck.
(Spelling note, Muhammad 21 July: Tanvir, not Tanveer, standardized
throughout this document.)

R2 — Greetings are always understood: hi, hello, salam, or any of the
greetings in BOX 1, at any box, gets the matching greeting reply plus a
re-ask of the current box, and does not count as a failed attempt.

R3 — Silence expiry: confusion or inactivity escalations expire after 2
hours, meaning the bot resumes the conversation on its own if the customer
messages again after that window, no human required. Explicit talk-to-an-
agent requests never expire this way.

R4 — Declined restart: a declined customer, someone who said not right now
to depositing, who returns after 24+ hours is treated as a fresh
opportunity, full restart at BOX 1. Within 24 hours they just get the
BOX 12 acknowledgement.

R5 — Deposit negotiation detector: a message mentioning the amount and a
less, lower, kam, or discount word goes straight to a human with the reason
attached, so the agent knows exactly what to answer.

R6 — Mid-flow abandonment restart: a customer sitting at any box between
the main menu and deposit confirmation who goes quiet and returns after
24+ hours gets a full restart at BOX 1, same shape as R4's declined
restart, instead of having their new message misread as an answer to
whatever question they left hanging days or weeks earlier.

R7 — New lead handling. STATUS: NOTIFICATION DISABLED 21 July 2026, per
Muhammad's instruction, kept inactive until further notice. Normally: every
brand-new lead is auto-assigned to an agent, round-robin between Ehsan and
Hanzala, switching every 10 leads, and the agent gets a WhatsApp ping with
an I've got this button. The lead assignment itself still happens, only
the WhatsApp ping notification is turned off for now.

R8 — WhatsApp's 24-hour rule, this is Meta's rule, not ours: the bot can
reply freely only within 24 hours of the customer's last message. Reaching
out after that requires a Meta-approved template, fixed wording, approved
in advance. Practically, this means any future follow-up or reminder
feature cannot just send whatever free-form text we want once that 24-hour
window has passed, it is limited to whatever template Meta has approved.

---

## OPEN ITEMS still needing your answer

1. Box 2, "divide it into three" — could not identify what this refers to,
   need the specific detail to act on it.
2. Two form URLs — only one exists today (crm.badartrader.com/join.html).
   Is a second, separate form actually wanted, or was this about the one
   form serving both broker paths?
3. Box 3/3A/3B restructure above is PROPOSED, needs a final yes before it
   replaces the current live flow.
4. Design Q4, the IB-switch walkthrough — this is the top priority per
   Muhammad, but the actual broker-specific steps (Exness and XM's real
   process for switching an account's partner code) are not known yet.
   Needs those real steps, from Ehsan or directly from the brokers, before
   this can be built as a real bot path rather than an agent handoff.
5. "Mohtaram Customer" is a draft replacement for "Pyaare Customer,"
   needs Muhammad's final word on the exact phrase.
6. All newly drafted Roman Urdu and non-Urdu greeting text in this version
   should be checked by a native speaker before going live.
