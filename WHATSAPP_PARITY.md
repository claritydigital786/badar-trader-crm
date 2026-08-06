# Conversations vs. WhatsApp - feature parity audit

_Answering Muhammad's question (2026-08-06): "Have you added all of the features
which we could see on WhatsApp?" This is a feature-by-feature comparison of the
CRM's Conversations / Omnichannel Inbox against the real WhatsApp interface.
Audit done by reading the live code in `index.html` (the Conversations block,
roughly lines 7200-8100) and the `whatsapp-webhook` function._

## Short answer

Most of the day-to-day WhatsApp chat experience is already there: the two-panel
inbox, message bubbles in WhatsApp's own colours, the 24-hour reply window, reply
-to-a-message, image screenshots inline, contact panel, and live updates. The one
big thing that was visibly missing is **delivery ticks** (the grey/blue check
marks). The backend for those was already built weeks ago but nothing drew them on
screen - I built that rendering this session (details at the bottom). After that,
the remaining gaps are smaller: sending an image or emoji from the CRM, and a few
cosmetic touches. None of them block using the inbox.

## Already built (present in the live CRM)

| WhatsApp feature | Status in CRM |
| --- | --- |
| Chat list with avatar, name, number, last-message preview, timestamp | Present |
| Unread indicator (blue dot) + unread count badge in the sidebar | Present |
| Search the conversation list | Present |
| Filter chips (All / Unread / New / Warm / Hot / Converted) | Present (CRM tiers, not WhatsApp labels) |
| Open a chat into a full message thread | Present |
| Incoming vs. outgoing bubbles, WhatsApp green/white colours, bubble tails | Present |
| Per-message timestamp | Present |
| Received images shown inline in the bubble | Present (deposit screenshots, signed URLs) |
| Reply to a specific message (quote) | Present (the small reply arrow on each bubble) |
| Auto-growing compose box, Enter to send, Shift+Enter for newline | Present |
| Live incoming messages appear without refresh | Present (Supabase realtime) |
| Contact info panel (status, source, agent, email, created, reply window) | Present |
| Mobile: opening a chat switches to a single full-width view with a back button | Present |
| Blue-tick read receipts sent to the customer for their messages | Present (webhook `markAsRead`) |
| Dark mode across the whole inbox | Present |

CRM-only extras WhatsApp does not have (worth keeping): the live 24-hour reply
window countdown with the composer auto-disabling when it closes, assign-a-chat
-to-an-agent from the inbox, per-lead tier selector, "copy direct link to this
conversation", and "open full lead record".

## Gaps (WhatsApp has it, CRM did not)

Ordered by how much they matter for real agent use.

1. **Delivery ticks on our own sent messages - BUILT THIS SESSION.** Grey tick =
   sent, double grey = delivered, double blue = read, clock = pending, red mark =
   failed. See the section below. This was the most visible gap.
2. **Send an image / file from the CRM.** Agents can only send text from the
   Conversations box today; they can receive images but not send one. Real WhatsApp
   lets you attach. This needs an upload control plus media support in the
   `send-wa-message` function. Medium effort, and a clear real-use gap (e.g. sending
   a lead a chart or an account-setup screenshot). Recommended as the next real build.
3. **Emoji picker in the compose box.** Minor. Agents can still type/paste emoji from
   their own keyboard, so this is convenience only. Low effort if wanted.
4. **Day dividers ("Today / Yesterday / date") between messages - BUILT THIS SESSION
   for live threads.** See below.
5. **Voice notes / audio messages.** The webhook handles image attachments but not
   inbound audio. Only matters if leads actually send voice notes. Low priority
   until we see that happening.
6. **In-chat search (find text inside one conversation).** WhatsApp has it; the CRM
   only searches the chat list. Low priority.
7. **"Scroll to bottom" / new-message jump button when scrolled up.** Cosmetic.
8. **Customer's WhatsApp profile photo.** WhatsApp shows it; the CRM uses coloured
   initials. The Cloud API does not readily expose profile photos, so this is
   effectively not available to us. Not worth pursuing.
9. **Forward / star / pin a message.** WhatsApp power-user features with little value
   in a CRM inbox. Not recommended.

## What I built this session (2026-08-06)

Both are **local only - verified in demo mode, not committed to git, not deployed.**
They are staged in the working tree (`index.html`) for your review first.

### Delivery ticks (catalog B3/B4 frontend)
- The backend was already done: `communications.delivery_status` and the webhook
  writing `sent`/`delivered`/`read`/`failed` with an ordering guard so a late
  "delivered" can never overwrite a "read". Nothing drew it on screen.
- Added `waTicks()` plus a `renderConvMessages()` helper, wired into the live thread,
  the demo thread, and the realtime handlers. A new realtime UPDATE listener patches
  the tick in place as the status advances (sent -> delivered -> read arrive as
  separate callbacks after the bubble is already on screen).
- Verified in demo mode in the browser: the read state renders `✓✓` in
  `rgb(83,189,235)`, WhatsApp's exact read-blue; all five states (sent, delivered,
  read, failed, pending) render with the right glyph and colour in both themes.

### Day dividers
- `convDayLabel()` + `renderConvMessages()` insert a centred "Today / Yesterday /
  full date" pill whenever the calendar day changes in a thread. Live-mode only
  (real timestamps); the demo threads use fixed time strings so they do not show it.
  Verified by code read, not by a live screenshot.

### Rollout ordering (important - do NOT push the frontend first)
The tick rendering reads `communications.delivery_status`. That column is not on the
live database yet (its migration has not been applied). If the frontend is pushed to
`main` before the column exists, the live `openConversation` query asks for a column
that is not there and the inbox fails to load for real agents. Correct order, all on
your laptop with you present:
1. Apply `supabase/migrations/20260806020000_communications_delivery_status.sql`.
2. Deploy `whatsapp-webhook` (`--no-verify-jwt`) so it starts writing statuses.
3. Only then commit + push the `index.html` frontend (auto-deploys via Vercel).

This is the same order already written in `REMAINING_TODOS.md` for B3/B4.

## Recommendation
Delivery ticks are the parity gap worth closing first, and the code is ready pending
the three-step rollout above. After that, "send an image from the CRM" is the only
remaining gap with real day-to-day value; everything else is cosmetic or low-value.
