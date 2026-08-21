import assert from "node:assert/strict";
import { isPermanentHandoff, PERMANENT_HANDOFF_REASONS } from "../_shared/handoff_permanence.mjs";

// The three reasons the webhook actually writes for an explicit request. The
// first two carry a trailing detail, which is why this is a substring test.
assert.equal(isPermanentHandoff("requested human agent from main menu"), true);
assert.equal(isPermanentHandoff("requested human agent for Premium Signalling Group"), true);
assert.equal(isPermanentHandoff("requested human agent after declining $500 deposit"), true);

// send-wa-message writes this one when an agent replies by hand. Worded to
// match the explicit-request pattern on purpose, so a manual takeover is a
// permanent handoff and the bot never talks over the agent.
assert.equal(
  isPermanentHandoff("requested human agent, an agent manually took over this conversation"),
  true,
);

// The two conversion-stage handoffs added 2026-08-20. These are the whole
// reason this module exists: without them, a lead who just said yes to the
// deposit would be handed back to the bot two hours later.
assert.equal(isPermanentHandoff("qualified, ready for the $500 deposit"), true);
assert.equal(isPermanentHandoff("sent a deposit screenshot"), true);

// Confusion handoffs must stay temporary, so a lead no agent answered is not
// left mute. These are the exact strings handleUnmatched and the resolved
// conversation branch build.
assert.equal(isPermanentHandoff("stuck at awaiting_broker after 2 attempt(s)"), false);
assert.equal(isPermanentHandoff("sent 2 messages after conversation resolved (declined)"), false);

// A real objection escalates, but the lead should still be recoverable by the
// bot if nobody picks it up.
assert.equal(isPermanentHandoff("asked about depositing less than $500"), false);

// Missing or non-string reasons are temporary, never permanent. Failing open
// keeps an unrecognised reason recoverable rather than silently muting a lead.
assert.equal(isPermanentHandoff(null), false);
assert.equal(isPermanentHandoff(undefined), false);
assert.equal(isPermanentHandoff(""), false);
assert.equal(isPermanentHandoff("   "), false);
assert.equal(isPermanentHandoff(42), false);
assert.equal(isPermanentHandoff({}), false);

// Case differences in stored prose must not defeat the match.
assert.equal(isPermanentHandoff("REQUESTED HUMAN AGENT FROM MAIN MENU"), true);
assert.equal(isPermanentHandoff("Qualified, Ready For The $500 Deposit"), true);

// An unrelated reason nobody writes today stays temporary.
assert.equal(isPermanentHandoff("agent went on holiday"), false);

// Guard against someone editing the list into uselessness: an empty string in
// the list would make every reason permanent via includes("").
assert.ok(PERMANENT_HANDOFF_REASONS.length > 0);
assert.ok(PERMANENT_HANDOFF_REASONS.every((r) => typeof r === "string" && r.trim().length > 0));

console.log("handoff-permanence-test: all assertions passed");
