// Parses the AI's own end-of-reply tag and decides whether a repeated flag
// means a situation is not diffusing and needs a real human takeover.
//
// WHY THIS EXISTS: Muhammad's decision, 2026-08-31. A complaint or a
// discount ask should get the AI's own warm first-contact answer (apology,
// reassurance, explaining there's no fixed discount policy) - not an instant
// hard handoff. Separately, a REAL flag goes to an agent in the background
// either way, unlike the hollow "I've forwarded your query" the AI used to
// just say with nothing behind it. If the same lead flags again before an
// agent has actually stepped in, that is exactly the "situation isn't
// diffusing" signal Muhammad described - only then does the bot hand off for
// real (needs_human, permanent, agent notified), instead of quietly flagging
// again.

export const FLAG_ESCALATE_WINDOW_MINUTES = 45;

const FLAG_TAG_RE = /\n?\[\[FLAG:(none|complaint|discount|uncertain)\]\]\s*$/i;

/**
 * Splits the model's raw completion into the customer-facing reply and its
 * own judgment of whether this needs a human flagged. Fails safe: if the
 * model didn't include a well-formed tag, the whole reply is sent as-is and
 * no flag fires - a formatting slip must never block the actual answer, and
 * must never silently escalate when nothing asked for it.
 * @param {string} rawReply
 * @returns {{ reply: string, flag: "none"|"complaint"|"discount"|"uncertain" }}
 */
export function extractFlagTag(rawReply) {
  const text = (rawReply ?? "").trimEnd();
  const m = FLAG_TAG_RE.exec(text);
  if (!m) return { reply: text.trim(), flag: "none" };
  return { reply: text.slice(0, m.index).trim(), flag: m[1].toLowerCase() };
}

/**
 * @param {{ lastFlaggedAt?: string|number|Date|null, now?: number, windowMinutes?: number }} [args]
 * @returns {boolean}
 */
export function shouldEscalateOnRepeatFlag({
  lastFlaggedAt = null,
  now = Date.now(),
  windowMinutes = FLAG_ESCALATE_WINDOW_MINUTES,
} = {}) {
  if (!lastFlaggedAt) return false;
  const at = new Date(lastFlaggedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return (now - at) / 60000 <= windowMinutes;
}
