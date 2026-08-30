// Tests for the rule that lets the AI answer a customer whose lead is already
// handed off to a human. The failure this guards against is real and was
// watched live twice: (1) 2026-08-23 - a lead said "Yes, I'm ready" to the
// $500 deposit, escalated correctly, asked three questions, got 93 minutes of
// silence because the old rule answered nobody at all. (2) 2026-08-30 - after
// that fix added a 3-reply cap, a real "Trade Campus" thread hit the cap and
// went silent on a still-active customer. This file now asserts the no-cap,
// defer-only-to-a-present-agent version Muhammad approved on 2026-08-30.
import assert from "node:assert/strict";
import {
  shouldAnswerWhileEscalated,
  AGENT_ACTIVE_MINUTES,
} from "../_shared/escalated_reply_policy.mjs";

const NOW = Date.parse("2026-08-23T12:00:00Z");
const minutesAgo = (m) => new Date(NOW - m * 60000).toISOString();

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("escalated reply policy");

check("a lead that is not escalated is none of this policy's business", () => {
  assert.equal(shouldAnswerWhileEscalated({ needsHuman: false, now: NOW }).answer, true);
});

check("THE ORIGINAL BUG: escalated, nobody replying, question unanswered -> answer it", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: null,
    now: NOW,
  });
  assert.equal(d.answer, true, "this is the exact case that produced 93 minutes of silence");
  assert.match(d.reason, /unattended/);
});

check("an agent who replied a minute ago is not talked over", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: minutesAgo(1),
    now: NOW,
  });
  assert.equal(d.answer, false);
  assert.match(d.reason, /agent is active/);
});

check("an agent still counts as present at the edge of the window", () => {
  assert.equal(
    shouldAnswerWhileEscalated({
      needsHuman: true,
      agentLastRepliedAt: minutesAgo(AGENT_ACTIVE_MINUTES - 1),
      now: NOW,
    }).answer,
    false,
  );
});

check("an agent who has been gone longer than the window is treated as absent", () => {
  assert.equal(
    shouldAnswerWhileEscalated({
      needsHuman: true,
      agentLastRepliedAt: minutesAgo(AGENT_ACTIVE_MINUTES + 1),
      now: NOW,
    }).answer,
    true,
  );
});

check("THE 2026-08-30 FIX: there is no reply cap - a long unattended thread keeps getting answered", () => {
  // The old rule stopped answering after MAX_AI_REPLIES_WHILE_ESCALATED (3).
  // A real unattended thread should keep being answered well past that, as
  // long as no agent is active and the customer is still reachable.
  for (let n = 0; n < 25; n++) {
    const d = shouldAnswerWhileEscalated({ needsHuman: true, now: NOW });
    assert.equal(d.answer, true, `answer ${n + 1} should still be allowed - no cap`);
  }
});

check("FAILS CLOSED: an unparseable agent timestamp is not read as 'agent absent'", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: "not a date",
    now: NOW,
  });
  assert.equal(d.answer, false);
  assert.match(d.reason, /unreadable/);
});

check("no arguments at all does not throw and does not treat escalation as blocking", () => {
  assert.equal(shouldAnswerWhileEscalated().answer, true, "defaults to not-escalated");
  assert.equal(shouldAnswerWhileEscalated({ needsHuman: true }).answer, true, "escalated, no agent activity given -> answer");
});

console.log(`\n${passed} passed\n`);
