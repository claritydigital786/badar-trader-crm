# Conversations Inbox - Full Feature Catalog

What a mature WhatsApp Business inbox actually does, itemised so Muhammad can pick
what this CRM should build. Compiled 2026-08-06 from the WhatsApp Business App,
WhatsApp Business Manager, the WhatsApp Cloud API surface, and the WhatChimp
Omnichannel Inbox screens Muhammad has already shared. **No live account was opened
to build this list**, per the standing rule in `CLAUDE.md`.

## How to use this file

Every item has an ID. Tell Claude the IDs you want (for example "build A3, C1, C4")
and they get copied into `REMAINING_TODOS.md` as real work items. Nothing here is
built just because it is listed.

**Status key**
- `BUILT` - already working in this CRM today.
- `PARTIAL` - some of it exists, the gap is named.
- `NONE` - not built at all.

**Cost key** is rough build effort, not money: `S` under a day, `M` a few days,
`L` a week or more, `XL` a project of its own.

**Blocked** means something outside our code has to happen first (Meta approval, a
paid tier, a deploy that touches live traffic).

---

## A. Conversation list and triage

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| A1 | Conversation list | Every thread, newest activity first, with last message preview. | BUILT | - |
| A2 | Search conversations | Find a thread by name or number. | BUILT | - |
| A3 | Status filters | All / New / Unread / Warm / Hot / Converted tabs. | BUILT | - |
| A4 | Search *inside* a conversation | Find a phrase within one thread's history. Matters once a thread is hundreds of messages long. | NONE | S |
| A5 | Unread badge per thread | A count on each row, not just a filter. Agents currently cannot see at a glance which of their threads are unread. | PARTIAL - filter exists, per-row count does not | S |
| A6 | Sort options | Newest, oldest, longest-waiting. Longest-waiting is the one that prevents a lead going cold. | NONE | S |
| A7 | Snooze / remind me | Hide a thread until a chosen time, then resurface it. Stops the list being a permanent guilt pile. | NONE | M |
| A8 | Pin / star a conversation | Keep important threads at the top. | NONE | S |
| A9 | Archive / close | Move a resolved thread out of the working list without deleting it. | PARTIAL - Converted filter is close, no explicit archive | S |
| A10 | Bulk selection | Tick several threads, then act on all of them at once. | NONE | M |
| A11 | Saved views | Store a filter combination, for example "my hot leads unanswered over 2 hours". | NONE | M |
| A12 | Folders / inboxes | Split traffic by number, by team, or by campaign. Relevant because there are two live numbers. | NONE | M |

## B. The message thread

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| B1 | Full message history | The whole back and forth, both directions. | BUILT | - |
| B2 | Live incoming messages | New customer messages appear without a refresh. | BUILT | - |
| B3 | Delivery status ticks | Sent / delivered / read, per message. WhatsApp sends these on the webhook; the CRM currently ignores them, so an agent cannot tell a failed send from a delivered one. | NONE | M |
| B4 | Failed-send surfacing | Show clearly when Meta rejected a message and why. Today a failure is close to invisible. | NONE | M |
| B5 | Media in the thread | Show images, documents, audio and video the customer sends, not just text. Real customers send screenshots of trades constantly. | NONE | M |
| B6 | Voice note playback | Play a customer's voice note in the thread. | NONE | M |
| B7 | Timestamps and day separators | Readable time grouping across long threads. | PARTIAL - times shown, no day separators | S |
| B8 | Message reactions | The emoji reactions WhatsApp supports, shown and sendable. | NONE | M |
| B9 | Reply-to-quote | Show which earlier message a reply refers to. | NONE | M |
| B10 | Forward a message | Pass a message to another thread or agent. | NONE | M |
| B11 | Export transcript | Download a thread as a file, for disputes or compliance. | NONE | S |
| B12 | System events inline | Show "assigned to Bilal", "status changed to Hot" inside the thread, so the history explains itself. | NONE | M |

## C. Composing and sending

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| C1 | Send a text reply | Type and send to the customer. | BUILT | - |
| C2 | 24-hour window timer | A visible countdown showing how long free-form replies are still allowed on this thread, and a block once it closes. **This is the single biggest source of silent failure in any WhatsApp inbox.** | NONE | M |
| C3 | Send an approved template | Reopen a thread outside the 24-hour window using a Meta-approved template. Templates are already tracked in Bot Manager; the composer cannot send one. | PARTIAL - storage built, sending not | M, Blocked on Meta approval |
| C4 | Canned / quick replies | Insert a saved answer in one click. Agents retype the same deposit and referral answers all day. | PARTIAL - Quick Links exist, not true canned replies | S |
| C5 | Send an attachment | Send an image, PDF or document to a customer. | NONE | M |
| C6 | Emoji picker | Insert emoji without the OS picker. | NONE | S |
| C7 | Typing indicator | Show the customer that an agent is typing. | NONE | M |
| C8 | Draft persistence | Keep a half-typed reply if the agent switches threads. | NONE | S |
| C9 | Send-and-set-status | One action that replies and moves the lead's status. | NONE | S |
| C10 | Schedule a message | Queue a reply for later, respecting business hours. | NONE | M |
| C11 | Character and template variable validation | Catch a broken `{{1}}` before Meta rejects it. | NONE | S |

## D. Customer context beside the chat

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| D1 | Contact panel | Name, number, status, source, owner, shown next to the thread so the agent is not guessing who they are talking to. | NONE | M |
| D2 | Jump to the full lead record | Open this contact's lead detail without leaving the inbox. | NONE | S |
| D3 | Internal notes | Notes only the team sees, attached to the conversation. The lead record has notes; the inbox does not surface them. | PARTIAL | S |
| D4 | Tags / labels | Free-form labels for segmentation, the way WhatsApp Business App labels chats. | NONE | M |
| D5 | Previous conversation history | Every earlier thread with the same person. | NONE | M |
| D6 | Order / payment context | Their ledger and KYC state inline. The data already exists in this CRM. | NONE | M |
| D7 | Custom fields | Arbitrary per-contact fields shown in the panel. | NONE | M |

## E. Assignment, routing and team

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| E1 | Assign a conversation to an agent | From inside the inbox. This is the exact gap that has been causing WhatChimp trouble with Faisal Shah. | NONE | M |
| E2 | Reassign / transfer | Hand a thread to a colleague, with the reason recorded. | NONE | M |
| E3 | See who else is viewing | Prevent two agents replying at once. A real problem with five agents on one number. | NONE | L |
| E4 | Auto-assignment rules | Round-robin or by campaign. Round-robin already exists for leads; the inbox does not use it. | PARTIAL | M |
| E5 | Agent availability | Online / away / offline, so unassigned threads do not sit with someone who has gone home. | NONE | M |
| E6 | Internal mentions | Tag a colleague on a thread and notify them. | NONE | M |
| E7 | Escalate to admin | A one-click hand-up path. Escalation notifications already exist in the webhook. | PARTIAL | S |

## F. Automation that touches the inbox

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| F1 | Keyword auto-reply | Already built in Bot Manager, gated off in the deployed webhook. | PARTIAL | Blocked on a live deploy |
| F2 | AI auto-reply | Built, gated off by `AI_REPLIES_ENABLED`. | PARTIAL | Blocked on a live deploy |
| F3 | Greeting / away message | Automatic first reply, or an out-of-hours message. | NONE | M, needs business hours first |
| F4 | Business hours | Define open hours per day. Nothing else out-of-hours works without this. | NONE | M |
| F5 | Handoff bot to human | Bot steps aside cleanly when an agent takes over, and does not talk over them. **This is the WhatChimp double-reply risk that has been flagged repeatedly.** | PARTIAL - handoff exists in schema | M |
| F6 | Auto-tagging from message content | Label a thread automatically from what the customer says. | NONE | M |

## G. Measurement and quality

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| G1 | First response time | How long a customer waited for a human. The metric Badar will actually ask about. Nothing in the schema tracks it today. | NONE | M |
| G2 | Response time by agent | Per-agent comparison. | NONE | M |
| G3 | Unanswered-thread alert | Flag anything past a threshold. | NONE | M |
| G4 | Conversation volume over time | Load by hour and day, which is how you decide staffing. | NONE | M |
| G5 | Resolution / conversion rate per agent | Which conversations turned into deposits. | NONE | M |
| G6 | Meta conversation cost tracking | Meta bills per 24-hour conversation window. Nothing tracks this spend. | NONE | L |

## H. Platform limits you cannot design around

These are Meta's rules. They are listed so nothing above gets planned as if they
do not exist.

| ID | Constraint | What it means |
|----|-----------|---------------|
| H1 | 24-hour customer service window | Free-form replies are only allowed within 24 hours of the customer's last message. After that, only an approved template. Drives C2 and C3. |
| H2 | Template approval | Every out-of-window message must be a template Meta reviewed. Approval takes hours to days and can be rejected. |
| H3 | Business-initiated conversation tier | This number's tier was 250 per rolling 24 hours as of 2026-07-20. Broadcast Signal is already capped at 200 because of it. |
| H4 | Quality rating | Meta scores the number. Blocks and reports drag it down and can cut the tier. |
| H5 | One number, one connection | A number connected to the Cloud API cannot also be used in the WhatsApp Business App. Relevant to any WhatChimp overlap. |

## I. Account and admin level

| ID | Feature | What it does | Status | Cost |
|----|---------|--------------|--------|------|
| I1 | Multiple numbers in one inbox | Both live numbers in a single view, clearly labelled. | NONE | M |
| I2 | Other channels alongside WhatsApp | Facebook, Instagram, web chat in the same inbox. | NONE | XL |
| I3 | Per-agent inbox permissions | Who sees which conversations. RLS and the agent role already enforce a version of this. | PARTIAL | M |
| I4 | Full audit trail | Who sent what, who reassigned what, when. | PARTIAL - Comm Log covers some | M |
| I5 | Retention and deletion policy | How long transcripts are kept. | NONE | M |

---

## Claude's read, for what it is worth

If the goal is an inbox agents can work in all day without silent failures, the
items that matter most are not the exciting ones:

1. **C2, the 24-hour window timer.** Without it agents type replies that Meta
   silently refuses to deliver, and nobody finds out until the lead goes quiet.
2. **B3 and B4, delivery status and failed sends.** Same problem from the other
   side: right now a message that never arrived looks identical to one that did.
3. **E1, assignment from the inbox.** This is exactly what has been going wrong in
   WhatChimp with Faisal Shah for two days.
4. **D1, the contact panel.** Cheap to build, and it stops agents working blind.
5. **G1, first response time.** The number Badar will ask for, and it needs
   tracking built before it can ever be reported.

C3 and F1/F2 are already most of the way built but sit behind a live deploy and
Meta approval, so they are decisions rather than coding work.
