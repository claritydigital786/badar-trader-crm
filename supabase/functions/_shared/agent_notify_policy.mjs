// Decides whether an agent should actually be sent a WhatsApp notification.
//
// WHY THIS EXISTS
// ---------------
// escalate() had no guard of any kind. Every one of its nine call sites sent a
// WhatsApp message to the assigned agent, every single time it ran, with no
// check for whether that agent had already been told about this very lead
// seconds earlier. A customer sending four messages in twenty seconds produced
// four notifications on the agent's phone. Agents were, in Muhammad's words,
// heavily frustrated, everyone phoned him, and there was no way to stop it -
// which is why NEW_LEAD_NOTIFICATIONS_ENABLED was set to false on 2026-07-21
// and never turned back on.
//
// Two rules, in order. Any one of them blocking means no message is sent.
//
//   1. TEST MODE. When testNumbers is non-empty, ONLY those numbers can ever
//      be messaged. This is the safety net for turning notifications back on:
//      point it at two phones you control and no real agent can be reached
//      even if every other rule fails.
//   2. ONE PING PER LEAD. An agent is told about a lead once. Until that lead
//      is actually dealt with, further escalations on the same lead are
//      silent. This is the rule whose absence caused the flood.
//
// A THIRD rule used to sit here: a 30-minute per-agent cooldown across
// DIFFERENT leads, so ten leads arriving at once produced one message, not
// ten. Removed 2026-08-30 on Muhammad's explicit decision: every unique lead
// should notify its agent as soon as it arrives, even if the previous one was
// 60 seconds ago - a real customer waiting is worth more than a quiet phone.
// (It was also, separately, silently broken the whole time it existed - see
// git history/HANDOFF.md for the getAgentRotation() mapping bug that dropped
// last_notified_at on the floor - but removing it here is a product decision,
// not just a bug fix.) Rule 2 above is what still stops a flood on one lead.
//
// Pure and dependency-free on purpose so it can be tested without a network,
// a database, or any risk of sending a real message.

// Digits only, so "+92 300 1234567", "923001234567" and "92-300-1234567" all
// compare equal. A test allowlist that failed on formatting would be worse
// than useless - it would look armed while letting real numbers through.
export function normalizeNotifyPhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * This module is plain .mjs so it can be unit-tested with no build step, but it
 * is imported by TypeScript. Without these annotations TypeScript infers the
 * parameter shape from the default values alone, which gets it wrong in two
 * ways: `testNumbers = []` infers as `never[]` (so passing real strings fails)
 * and `agentPhone` has no default, so it is inferred away entirely. Both showed
 * up as type errors on 2026-08-23. Keep this JSDoc in step with the signature.
 *
 * @param {Object} [options]
 * @param {string | null | undefined} [options.agentPhone] The agent's number, any format.
 * @param {boolean} [options.leadAlreadyNotified] True if this agent was already told about this lead.
 * @param {string[]} [options.testNumbers] When non-empty, ONLY these numbers may be notified.
 * @returns {{ notify: boolean, reason: string }}
 */
export function shouldNotifyAgent({
  agentPhone,
  leadAlreadyNotified = false,
  testNumbers = [],
} = {}) {
  const phone = normalizeNotifyPhone(agentPhone);
  if (!phone) return { notify: false, reason: "no agent phone on file" };

  if (Array.isArray(testNumbers) && testNumbers.length > 0) {
    const allowed = testNumbers.map(normalizeNotifyPhone).filter(Boolean);
    if (!allowed.includes(phone)) {
      return { notify: false, reason: "test mode: agent is not on the test allowlist" };
    }
  }

  if (leadAlreadyNotified) {
    return { notify: false, reason: "this agent was already told about this lead" };
  }

  return { notify: true, reason: "ok" };
}
