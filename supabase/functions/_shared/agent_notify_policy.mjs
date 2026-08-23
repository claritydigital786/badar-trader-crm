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
// Three rules, in order. Any one of them blocking means no message is sent.
//
//   1. TEST MODE. When testNumbers is non-empty, ONLY those numbers can ever
//      be messaged. This is the safety net for turning notifications back on:
//      point it at two phones you control and no real agent can be reached
//      even if every other rule fails.
//   2. ONE PING PER LEAD. An agent is told about a lead once. Until that lead
//      is actually dealt with, further escalations on the same lead are
//      silent. This is the rule whose absence caused the flood.
//   3. PER-AGENT COOLDOWN. Even across different leads, one agent receives at
//      most one notification per cooldown window. Ten leads arriving at once
//      produce one message, not ten.
//
// Pure and dependency-free on purpose so it can be tested without a network,
// a database, or any risk of sending a real message.

export const DEFAULT_COOLDOWN_MINUTES = 30;

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
 * @param {string | null} [options.agentLastNotifiedAt] ISO timestamp of this agent's last notification.
 * @param {number} [options.now] Epoch ms, injectable for tests.
 * @param {number} [options.cooldownMinutes] Minimum gap between notifications to one agent.
 * @param {string[]} [options.testNumbers] When non-empty, ONLY these numbers may be notified.
 * @returns {{ notify: boolean, reason: string }}
 */
export function shouldNotifyAgent({
  agentPhone,
  leadAlreadyNotified = false,
  agentLastNotifiedAt = null,
  now = Date.now(),
  cooldownMinutes = DEFAULT_COOLDOWN_MINUTES,
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

  if (agentLastNotifiedAt) {
    const last = new Date(agentLastNotifiedAt).getTime();
    // An unparseable timestamp must not be read as "long ago" and open the
    // floodgates - fail closed, stay quiet, and let the next valid one decide.
    if (!Number.isFinite(last)) {
      return { notify: false, reason: "unreadable last-notified timestamp, staying quiet" };
    }
    const minutesSince = (now - last) / 60000;
    if (minutesSince < cooldownMinutes) {
      return {
        notify: false,
        reason: `cooldown: agent was notified ${Math.floor(minutesSince)}m ago, limit is one per ${cooldownMinutes}m`,
      };
    }
  }

  return { notify: true, reason: "ok" };
}
