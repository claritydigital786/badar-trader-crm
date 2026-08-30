// Tests for the rule that lets the AI answer a customer whose lead is already
// handed off to a human. The failure this guards against is real and was
// watched live: a lead said "Yes, I'm ready" to the $500 deposit, escalated
// correctly, then asked three questions and got 93 minutes of silence.
import assert from "node:assert/strict";
import {
  shouldAnswerWhileEscalated,
  AGENT_ACTIVE_MINUTES,
  MAX_AI_REPLIES_WHILE_ESCALATED,
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

check("THE BUG: escalated, nobody replying, question unanswered -> answer it", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: null,
    aiRepliesSinceEscalation: 0,
    now: NOW,
  });
  assert.equal(d.answer, true, "this is the exact case that produced 93 minutes of silence");
  assert.equal(d.reason, "escalated but unattended");
});

check("an agent who replied a minute ago is not talked over", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: minutesAgo(1),
    aiRepliesSinceEscalation: 0,
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
      aiRepliesSinceEscalation: 0,
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
      aiRepliesSinceEscalation: 0,
      now: NOW,
    }).answer,
    true,
  );
});

check("the cap stops an unattended thread being answered forever", () => {
  for (let n = 0; n < MAX_AI_REPLIES_WHILE_ESCALATED; n++) {
    assert.equal(
      shouldAnswerWhileEscalated({ needsHuman: true, aiRepliesSinceEscalation: n, now: NOW }).answer,
      true,
      `reply ${n + 1} should still be allowed`,
    );
  }
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    aiRepliesSinceEscalation: MAX_AI_REPLIES_WHILE_ESCALATED,
    now: NOW,
  });
  assert.equal(d.answer, false);
  assert.match(d.reason, /maximum/);
});

check("FAILS CLOSED: an unreadable reply count declines rather than guessing zero", () => {
  for (const bad of [null, undefined, NaN, "2"]) {
    assert.equal(
      shouldAnswerWhileEscalated({ needsHuman: true, aiRepliesSinceEscalation: bad, now: NOW }).answer,
      false,
      `${String(bad)} must not be read as "no replies yet"`,
    );
  }
});

check("FAILS CLOSED: an unparseable agent timestamp is not read as 'agent absent'", () => {
  const d = shouldAnswerWhileEscalated({
    needsHuman: true,
    agentLastRepliedAt: "not a date",
    aiRepliesSinceEscalation: 0,
    now: NOW,
  });
  assert.equal(d.answer, false);
  assert.match(d.reason, /unreadable/);
});

check("no arguments at all does not throw and does not answer an escalated lead", () => {
  assert.equal(shouldAnswerWhileEscalated().answer, true, "defaults to not-escalated");
  assert.equal(shouldAnswerWhileEscalated({ needsHuman: true, aiRepliesSinceEscalation: null }).answer, false);
});

console.log(`\n${passed} passed\n`);
