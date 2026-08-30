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
// So the rule became narrower rather than absent: the bot may ANSWER a
// question while escalated, but it may never re-run the funnel and it must
// never talk over an agent who is actually present. That version (2026-08-23)
// still capped the AI at 3 answers per escalation, on the theory that a long
// unattended thread should eventually read as "nobody is here."
//
// REVISED 2026-08-30 (Muhammad, explicit product decision): the reply cap
// itself turned out to cost real leads. A "Trade Campus" thread hit the old
// cap of 3 and then went silent on a live customer who was still typing -
// exactly the kind of ignored high-intent lead this file was written to stop.
// Muhammad's instruction: "till the time the user remains available, the AI
// chatbot should keep it engaged" - bounded only by Meta's real 24-hour
// customer-service window (a WhatsApp platform limit this code cannot see or
// extend, so once that closes there genuinely is no other option). The
// reply-count cap is gone. What Muhammad explicitly kept, in the same
// decision: never talk over an agent who is actually present - condition 1
// below is unchanged and still absolute.
//
// THE CONDITIONS
//
// 1. An agent replying recently means a human is genuinely in the thread.
//    Stay silent - this is the case the original rule was written for, and it
//    is still absolutely right. `logged_by` is what separates an agent's
//    message from the bot's own (non-null = a person sent it).
//
// 2. Everything else gets an answer, in the customer's own language, from the
//    approved knowledge base only, with the handover line still attached so
//    nobody is misled into thinking the human is no longer coming.
//
// Fails CLOSED on agent-activity, unlike handoff_permanence.mjs: if the caller
// cannot establish whether an agent is active, we do not answer. The risk of a
// bot interrupting a live human sales conversation is worse than one missed
// customer message, which the no-cap change above already guards against on
// the other side.

// How recently an agent must have replied for the bot to treat the thread as
// actively handled and keep quiet. One hour, because agents work this inbox in
// sittings rather than continuously - a 10-minute window would call an agent
// "gone" while they are mid-conversation and still typing.
export const AGENT_ACTIVE_MINUTES = 60;

/**
 * @param {{
 *   needsHuman?: boolean,
 *   agentLastRepliedAt?: string|number|Date|null,
 *   now?: number,
 *   agentActiveMinutes?: number,
 * }} [args]
 * @returns {{ answer: boolean, reason: string }}
 */
export function shouldAnswerWhileEscalated({
  needsHuman = false,
  agentLastRepliedAt = null,
  now = Date.now(),
  agentActiveMinutes = AGENT_ACTIVE_MINUTES,
} = {}) {
  // Not escalated at all - this policy has no opinion, the normal AI path runs.
  if (!needsHuman) return { answer: true, reason: "not escalated" };

  if (agentLastRepliedAt) {
    const at = new Date(agentLastRepliedAt).getTime();
    // An unparseable timestamp is not evidence the agent is absent.
    if (!Number.isFinite(at)) return { answer: false, reason: "agent activity unreadable" };
    const minutesAgo = (now - at) / 60000;
    if (minutesAgo < agentActiveMinutes) {
      return { answer: false, reason: "an agent is active in this conversation" };
    }
  }

  // No cap: keep the customer engaged for as long as they remain reachable.
  // The only real ceiling is Meta's own 24-hour customer-service window,
  // which this function cannot see - that is enforced by WhatsApp itself on
  // the send, not by this policy.
  return { answer: true, reason: "escalated but unattended - no reply cap" };
}
