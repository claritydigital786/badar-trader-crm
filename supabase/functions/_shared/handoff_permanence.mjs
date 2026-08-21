// Decides whether a lead's handoff to a human must never auto-expire.
//
// runBotStep clears `needs_human` once a lead returns after
// HANDOFF_STALE_HOURS, so a lead who merely got confused, and whom no agent
// ever answered, is not left mute forever. That rule is right for a
// confusion handoff and wrong for a conversation a human genuinely owns now.
//
// Until 2026-08-20 the only permanent case was an explicit "requested human
// agent", tested inline with a regex. Two conversion-stage handoffs were
// added that day (a lead who says yes to the $500 deposit, and a lead who
// sends a deposit screenshot) and both need the same permanence: handing a
// closing lead back to the bot two hours later would undo the handoff at the
// exact moment a person is most needed.
//
// Matching is on the reason prose, which is what escalate() already writes to
// leads.handoff_reason, so every string here must stay in sync with the reason
// text passed at the call sites in whatsapp-webhook. Substring rather than
// exact match, because two of the reasons carry a trailing detail
// ("requested human agent for Premium Signalling Group").
//
// Fails open deliberately: an unrecognised reason is treated as temporary, so
// a typo in a new reason string leaves a lead recoverable by the bot rather
// than silently muting them forever. The cost of the two directions is not
// symmetric, and being stuck with no bot and no agent is the worse one.

export const PERMANENT_HANDOFF_REASONS = [
  "requested human agent",
  "qualified, ready for the $500 deposit",
  "sent a deposit screenshot",
];

export function isPermanentHandoff(reason) {
  const text = typeof reason === "string" ? reason.toLowerCase() : "";
  if (!text) return false;
  return PERMANENT_HANDOFF_REASONS.some((r) => text.includes(r.toLowerCase()));
}
