// Decides whether the AI may answer a customer whose lead is already handed
// off to a human.
//
// WHY THIS EXISTS
//
// Until 2026-08-23 the answer was a flat no. Every responder - keyword, AI,
// and the scripted funnel - returned early on `needs_human`, and for the three
// reasons in handoff_permanence.mjs that flag never clears. The intent was
// right: once a person owns a conversation, a bot talking over them is worse
// than a bot saying nothing.
//
// The cost of that rule was watched live on 2026-08-23. A lead answered "Yes,
// I'm ready" to the $500 deposit at 11:19, which is the single highest-intent
// moment the funnel has. That correctly escalated and correctly pinged the
// assigned agent. The lead then asked three questions - "kuch badar k bare
// mein btaen", "?", "minimum kitne paise jama kerwane hn?" - and a fourth
// message 70 minutes later, and got total silence for an hour and a half,
// because no agent happened to be looking. The customer most likely to convert
// is the one the system guarantees will be ignored.
//
// So the rule is now narrower rather than absent: the bot may ANSWER a
// question while escalated, but it may never re-run the funnel and it must
// never talk over an agent who is actually present.
//
// THE THREE CONDITIONS
//
// 1. An agent replying recently means a human is genuinely in the thread.
//    Stay silent - this is the case the original rule was written for, and it
//    is still absolutely right. `logged_by` is what separates an agent's
//    message from the bot's own (non-null = a person sent it).
//
// 2. Answers since the escalation are capped. A customer sending fifteen
//    messages into an unattended thread should not receive fifteen machine
//    replies - past a few answers the honest state is "nobody is here", and
//    more bot output only makes it look attended when it is not.
//
// 3. Everything else gets an answer, in the customer's own language, from the
//    approved knowledge base only, with the handover line still attached so
//    nobody is misled into thinking the human is no longer coming.
//
// Fails CLOSED, unlike handoff_permanence.mjs: if the caller cannot establish
// agent activity or the reply count, we do not answer. There the risk was a
// muted customer; here the risk is a bot interrupting a live human sales
// conversation, and silence is the cheaper mistake of the two.

// How recently an agent must have replied for the bot to treat the thread as
// actively handled and keep quiet. One hour, because agents work this inbox in
// sittings rather than continuously - a 10-minute window would call an agent
// "gone" while they are mid-conversation and still typing.
export const AGENT_ACTIVE_MINUTES = 60;

// Most AI answers allowed between one escalation and an agent arriving.
export const MAX_AI_REPLIES_WHILE_ESCALATED = 3;

/**
 * @param {{
 *   needsHuman?: boolean,
 *   agentLastRepliedAt?: string|number|Date|null,
 *   aiRepliesSinceEscalation?: number|null,
 *   now?: number,
 *   agentActiveMinutes?: number,
 *   maxReplies?: number,
 * }} [args]
 * @returns {{ answer: boolean, reason: string }}
 */
export function shouldAnswerWhileEscalated({
  needsHuman = false,
  agentLastRepliedAt = null,
  // Deliberately NOT defaulted to 0. A JS default fires on `undefined`, which
  // would quietly turn "the caller could not establish this" into "no replies
  // yet, go ahead" - the exact opposite of failing closed. Caught by the test
  // for this file, not by review.
  aiRepliesSinceEscalation,
  now = Date.now(),
  agentActiveMinutes = AGENT_ACTIVE_MINUTES,
  maxReplies = MAX_AI_REPLIES_WHILE_ESCALATED,
} = {}) {
  // Not escalated at all - this policy has no opinion, the normal AI path runs.
  if (!needsHuman) return { answer: true, reason: "not escalated" };

  // Fail closed on an unusable count rather than guessing it is zero.
  if (typeof aiRepliesSinceEscalation !== "number" || !Number.isFinite(aiRepliesSinceEscalation)) {
    return { answer: false, reason: "reply count unavailable" };
  }

  if (agentLastRepliedAt) {
    const at = new Date(agentLastRepliedAt).getTime();
    // An unparseable timestamp is not evidence the agent is absent.
    if (!Number.isFinite(at)) return { answer: false, reason: "agent activity unreadable" };
    const minutesAgo = (now - at) / 60000;
    if (minutesAgo < agentActiveMinutes) {
      return { answer: false, reason: "an agent is active in this conversation" };
    }
  }

  if (aiRepliesSinceEscalation >= maxReplies) {
    return { answer: false, reason: "already answered the maximum while waiting for an agent" };
  }

  return { answer: true, reason: "escalated but unattended" };
}
