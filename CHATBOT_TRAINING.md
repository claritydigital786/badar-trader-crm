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

_(nothing pending)_

---

## Applied

_(most recent first)_

- **2026-08-31 - Never claim the Signals Group is free with no condition. [PROMPT] + [PRINCIPLE].** Caught live in a real customer's own transcript (Hanzala's test lead): the AI said "premium signals group free hai" outright. Real rule: the $250 course AND the Premium Signals Group share the exact same one condition - Badar's own referral/IB link, $500 deposited into the customer's own broker account (their money, their account, never Badar's). Meeting it unlocks either reward for free; the $500 is never condition-free. Traced and fixed in three places that all said or implied otherwise: (1) [PROMPT] `ai_knowledge_base.knowledge_notes`'s "PREMIUM SIGNALLING GROUP" section literally said "completely free and requires no deposit at all, separate from the $500 course offer" - directly contradicted the system prompt's own correct "WHAT WE OFFER" section; rewritten to match, plus its "HOW TO ANSWER" line that said to "mention the free signals group needs no deposit." (2) [PROMPT] added a new CRITICAL paragraph to the system prompt itself, right after WHAT WE OFFER, naming the real transcript and stating the rule plainly, so it can't be missed or contradicted again. (3) [PRINCIPLE] the scripted main-menu list (`sendMainMenuCard` in `whatsapp-webhook/index.ts`) had "join for free, no deposit required" as the Premium Signalling Group row's own description text, shown to every customer before they even pick anything - fixed to state the $500-via-referral condition for both menu rows. `deno check` clean, all 12 suites pass, deployed as `whatsapp-webhook` v110; the prompt/knowledge-base fix applied via `supabase db query --linked` and confirmed live via REST read-back.
- **2026-08-31 - this file itself.** Muhammad's request: a dedicated place to drop chatbot training changes as they come up in conversation, applied the same day where possible, always tagged [PROMPT] or [PRINCIPLE], reconciled at end of session like `HANDOFF.md`. No prior entries exist - everything logged in `REMAINING_TODOS.md`'s Questions Log before today (the AI-identity rules, the nudge/flag policies, the reasoning-token fix, etc.) predates this file and stays there; only new chatbot-training asks from here on get logged in this one too.
