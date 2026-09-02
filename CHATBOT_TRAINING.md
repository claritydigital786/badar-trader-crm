# Chatbot Training Log

The single place to propose a change to how the AI chatbot talks or decides
things - from Badar, from Muhammad, from anyone on the team. This is
deliberately separate from `HANDOFF.md` (build history) and
`REMAINING_TODOS.md` (the raw questions log for the whole CRM) - this file
is only about the chatbot's own behavior: what it says, what it knows, when
it's allowed to speak, when it hands off to a human.

**How this works, every session:** the moment a training change is proposed
- typed into a session's chat, not just written in this file by hand -
Claude logs it under "Requested" immediately, in that same turn, before
doing anything else with it. It is then evaluated and, where possible,
applied the same session. Every entry, requested or applied, is tagged with
exactly which kind of change it is:

- **[PROMPT]** - a change to what the AI knows or how it's instructed to
  talk: the system prompt / knowledge base in `ai_knowledge_base` (the
  "Train AI" tab). Takes effect on the very next real customer message,
  no deploy needed.
- **[PRINCIPLE]** - a change to the code that decides *whether* and *when*
  the AI is allowed to answer, escalate, flag, or stay silent - the policy
  files in `supabase/functions/_shared/` (`escalated_reply_policy.mjs`,
  `nudge_reply_policy.mjs`, `flag_reply_policy.mjs`, etc.) and the dispatch
  logic in `whatsapp-webhook/index.ts`. Needs `deno check`, its own tests,
  and a real deploy before it's live.

Claude always says which tag applies out loud in chat too - never leaves it
implicit. At the end of each session (the same moment `HANDOFF.md` gets its
own update), every entry here gets reconciled: applied entries get their
real outcome recorded (what changed, tested how, deployed as what version),
and anything still open gets flagged to Muhammad directly rather than left
to look finished when it isn't.

---

## Requested (not yet applied)

- **2026-09-02 - Automate the 24h WhatsApp window keep-alive with a Time-In/Time-Out shift feature, instead of relying on agents manually texting the number. [PRINCIPLE].** Raised in the "Chatbot Training | CRM Rectifications" WhatsApp group by whoever is messaging as "Badar Sales Agent Hanzala," addressed to Muhammad Shoaib: "we need to replace the manual 24-hour agent messaging habit with an automated (Time-In / Time-Out) ... shift tracking feature in the CRM. When an agent clocks in bot should automatically detect their WhatsApp window status and trigger any required session refresh so lead notifications never fail silently. Please implement this duty status detection to handle session keep-alives automatically during active shifts," followed by "otherwise notification tu atyy rahay ga plus un leads ka kia banay ga jo off duties ayin gee" (concern: notifications will keep failing, and what happens to leads that come in while an agent is off-duty). Real, well-motivated request - directly follows from the same-day finding that every notification to Ehsan and Hanzala was failing delivery due to WhatsApp's 24h customer-service-window rule, and from `AGENT_WHATSAPP_GUIDELINES.md`'s manual "text the number every 24h" workaround. Not evaluated or built yet - this is a real code/architecture question (what "clocks in" means in this CRM, whether a bot-triggered keep-alive message to a customer-service number is even something WhatsApp's own rules permit a business to send proactively without it counting as a template, and how "off-duty" leads should route) that needs to be scoped out with Muhammad before any implementation starts.

---

## Applied

_(most recent first)_

- **2026-08-31 - Reply should match how specific the customer's question already is. [PROMPT].** Muhammad worked through five example customer questions paired against five generic-greeting bot replies, then asked for the rule this points at: a generic reply is right when the customer's message is generic (a greeting, a vague "need help"), but if the customer has already named something specific (the offer, the course, a particular problem), the bot should answer that directly instead of falling back to "what do you need" and making them repeat themselves. Confirmed with Muhammad before touching the live prompt this time (he corrected an earlier same-session change I applied without asking first). Added as a new CRITICAL paragraph right after the existing greeting-variety rule. Applied via `supabase db query --linked`, confirmed live via a direct read-back of the exact inserted text (no duplication, no corruption).
- **2026-08-31 - Greeting/"are you a bot" opener always coming out as the exact same fixed sentence. [PROMPT].** Muhammad sent a real transcript (his wife's own test chat) where the bot replied "Walikum assalam, main yahan aap ki madad ke liye hoon. Bataiye kya puchna hai?" - flagged because it "sounds too AI," always starting from one fixed sentence. Root cause: the system prompt's own "are you a bot" instruction gave exactly one example reply, which the model was copying near-verbatim as its default opener instead of treating it as one example among several. Fixed by replacing that single fixed example with five natural variants plus an explicit instruction to vary which one is used and never repeat the same wording twice to the same customer. Applied via `supabase db query --linked`, confirmed live via length check on the row. **Note:** this specific edit was applied without stopping to ask Muhammad first, which he flagged as wrong given it touches the live customer-facing prompt - going forward, a prompt change gets shown to him and confirmed before it's applied, not logged-then-run.
- **2026-08-31 - Never claim the Signals Group is free with no condition. [PROMPT] + [PRINCIPLE].** Caught live in a real customer's own transcript (Hanzala's test lead): the AI said "premium signals group free hai" outright. Real rule: the $250 course AND the Premium Signals Group share the exact same one condition - Badar's own referral/IB link, $500 deposited into the customer's own broker account (their money, their account, never Badar's). Meeting it unlocks either reward for free; the $500 is never condition-free. Traced and fixed in three places that all said or implied otherwise: (1) [PROMPT] `ai_knowledge_base.knowledge_notes`'s "PREMIUM SIGNALLING GROUP" section literally said "completely free and requires no deposit at all, separate from the $500 course offer" - directly contradicted the system prompt's own correct "WHAT WE OFFER" section; rewritten to match, plus its "HOW TO ANSWER" line that said to "mention the free signals group needs no deposit." (2) [PROMPT] added a new CRITICAL paragraph to the system prompt itself, right after WHAT WE OFFER, naming the real transcript and stating the rule plainly, so it can't be missed or contradicted again. (3) [PRINCIPLE] the scripted main-menu list (`sendMainMenuCard` in `whatsapp-webhook/index.ts`) had "join for free, no deposit required" as the Premium Signalling Group row's own description text, shown to every customer before they even pick anything - fixed to state the $500-via-referral condition for both menu rows. `deno check` clean, all 12 suites pass, deployed as `whatsapp-webhook` v110; the prompt/knowledge-base fix applied via `supabase db query --linked` and confirmed live via REST read-back.
- **2026-08-31 - this file itself.** Muhammad's request: a dedicated place to drop chatbot training changes as they come up in conversation, applied the same day where possible, always tagged [PROMPT] or [PRINCIPLE], reconciled at end of session like `HANDOFF.md`. No prior entries exist - everything logged in `REMAINING_TODOS.md`'s Questions Log before today (the AI-identity rules, the nudge/flag policies, the reasoning-token fix, etc.) predates this file and stays there; only new chatbot-training asks from here on get logged in this one too.
