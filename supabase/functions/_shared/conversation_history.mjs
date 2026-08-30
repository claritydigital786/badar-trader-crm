// Turns a lead's own communications log into a clean chat-message list for
// the AI to actually see as prior conversation. Internal bookkeeping rows
// (escalation markers, agent-notify logs, flag markers, "went back to X")
// are never real customer-facing text and must never leak into what the
// model is shown as "what was already said in this conversation".
//
// WHY THIS EXISTS: found 2026-08-31 while wiring in the nudge/flag work -
// tryAIReply's OpenAI call only ever sent the system prompt plus the single
// current message, no history at all. The system prompt has always told the
// model "never repeat information you already gave earlier in this
// conversation" and "resolve references like 'these two' or 'that one'" -
// neither of those could ever actually work, because the model had zero
// visibility into anything said before the current turn. This is what
// Muhammad meant asking the bot to "remember each lead's communication
// where the user left it."

const INTERNAL_LOG_PATTERNS = [
  /^\[escalated to human:/i,
  /^\[flagged for agent:/i,
  /^\[agent .* (notified|NOT notified)/i,
  /^\[previously assigned agent/i,
  /^\[SEND FAILED:/i,
  /^\[Declined lead returned/i,
  /^\[went back to/i,
];

/** @param {string} body @returns {boolean} */
export function isInternalLogLine(body) {
  const b = (body ?? "").trim();
  if (!b) return true;
  return INTERNAL_LOG_PATTERNS.some((re) => re.test(b));
}

/**
 * Strips this session's own "[ai reply]" log tag off a stored outbound body,
 * recovering the text actually sent to the customer.
 * @param {string} body
 * @returns {string}
 */
export function stripAiReplyTag(body) {
  return (body ?? "").replace(/^\[ai reply\]\s*/i, "").trim();
}

/**
 * @param {{ direction: "inbound"|"outbound", body: string }[]} rows chronological order (oldest first)
 * @param {number} limit max turns to keep (most recent)
 * @returns {{ role: "user"|"assistant", content: string }[]}
 */
export function buildChatHistory(rows, limit = 12) {
  const out = [];
  for (const row of rows ?? []) {
    const body = row?.body ?? "";
    if (row?.direction === "inbound") {
      const content = body.trim();
      if (content) out.push({ role: "user", content });
    } else {
      if (isInternalLogLine(body)) continue;
      const content = stripAiReplyTag(body);
      if (content) out.push({ role: "assistant", content });
    }
  }
  return out.slice(-limit);
}
