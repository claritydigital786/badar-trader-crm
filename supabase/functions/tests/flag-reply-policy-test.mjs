// Tests for the AI's own end-of-reply flag tag and the repeat-flag ->
// real-escalation decision. Muhammad's decision, 2026-08-31: a complaint or
// discount ask gets the AI's own answer plus a real silent flag to an agent;
// a SECOND flag before an agent has stepped in means it's not diffusing and
// the bot hands off for real.
import assert from "node:assert/strict";
import {
  extractFlagTag,
  shouldEscalateOnRepeatFlag,
  FLAG_ESCALATE_WINDOW_MINUTES,
} from "../_shared/flag_reply_policy.mjs";

const NOW = Date.parse("2026-08-31T12:00:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("flag reply policy");

check("a well-formed tag is parsed and stripped from the customer-facing reply", () => {
  const raw = "Samajh gaya, discount ka koi fixed policy nahi hai abhi, main team ko bata deta hoon.\n[[FLAG:discount]]";
  const { reply, flag } = extractFlagTag(raw);
  assert.equal(flag, "discount");
  assert.equal(reply, "Samajh gaya, discount ka koi fixed policy nahi hai abhi, main team ko bata deta hoon.");
  assert.ok(!reply.includes("[[FLAG"));
});

check("all four tag values parse correctly", () => {
  for (const tag of ["none", "complaint", "discount", "uncertain"]) {
    assert.equal(extractFlagTag(`Some answer.\n[[FLAG:${tag}]]`).flag, tag);
  }
});

check("a missing tag fails safe: whole reply sent as-is, flag is none", () => {
  const raw = "Minimum deposit is $500.";
  const { reply, flag } = extractFlagTag(raw);
  assert.equal(flag, "none");
  assert.equal(reply, "Minimum deposit is $500.");
});

check("no reply cap: not escalated without a prior flag", () => {
  assert.equal(shouldEscalateOnRepeatFlag({ lastFlaggedAt: null, now: NOW }), false);
});

check("a repeat flag inside the window means it's not diffusing - escalate for real", () => {
  assert.equal(
    shouldEscalateOnRepeatFlag({ lastFlaggedAt: minutesAgo(10), now: NOW }),
    true,
  );
});

check("a repeat flag right at the edge of the window still counts", () => {
  assert.equal(
    shouldEscalateOnRepeatFlag({ lastFlaggedAt: minutesAgo(FLAG_ESCALATE_WINDOW_MINUTES), now: NOW }),
    true,
  );
});

check("a flag well outside the window is treated as a fresh episode, not a repeat", () => {
  assert.equal(
    shouldEscalateOnRepeatFlag({ lastFlaggedAt: minutesAgo(FLAG_ESCALATE_WINDOW_MINUTES + 1), now: NOW }),
    false,
  );
});

check("an unparseable timestamp never crashes and never wrongly escalates", () => {
  assert.equal(shouldEscalateOnRepeatFlag({ lastFlaggedAt: "not a date", now: NOW }), false);
});

console.log(`\n${passed} passed\n`);
