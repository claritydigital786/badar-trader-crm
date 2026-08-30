// Tests for turning the raw communications log into real chat history for
// the AI. Real gap found 2026-08-31: the AI call never sent any history at
// all, only the current message - these tests guard the fix.
import assert from "node:assert/strict";
import { isInternalLogLine, stripAiReplyTag, buildChatHistory } from "../_shared/conversation_history.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("conversation history");

check("internal bookkeeping rows are recognised and excluded", () => {
  assert.equal(isInternalLogLine("[escalated to human: qualified]"), true);
  assert.equal(isInternalLogLine("[flagged for agent: complaint] unhappy about delay"), true);
  assert.equal(isInternalLogLine("[agent Farwa Qazi notified of escalation]"), true);
  assert.equal(isInternalLogLine("[agent Farwa Qazi NOT notified - already notified]"), true);
  assert.equal(isInternalLogLine("[previously assigned agent is no longer active - reassigned to X]"), true);
  assert.equal(isInternalLogLine("[SEND FAILED: agent escalation notification - timeout]"), true);
  assert.equal(isInternalLogLine("[went back to awaiting_broker]"), true);
  assert.equal(isInternalLogLine(""), true);
  assert.equal(isInternalLogLine("   "), true);
});

check("real customer-facing text is never mistaken for an internal row", () => {
  assert.equal(isInternalLogLine("Perfect! Deposit $500 in your own XM account using the link below:"), false);
  assert.equal(isInternalLogLine("Yes, I'm ready"), false);
});

check("the [ai reply] tag is stripped, real text is untouched", () => {
  assert.equal(stripAiReplyTag("[ai reply] Sure, minimum deposit is $500."), "Sure, minimum deposit is $500.");
  assert.equal(stripAiReplyTag("Sure, minimum deposit is $500."), "Sure, minimum deposit is $500.");
});

check("a real conversation builds into alternating user/assistant turns, internal rows dropped", () => {
  const rows = [
    { direction: "inbound", body: "Hi" },
    { direction: "outbound", body: "Walikum Salam, kaise madad karoon?" },
    { direction: "inbound", body: "course kya hai" },
    { direction: "outbound", body: "[ai reply] $250 ka course free hai, $500 deposit par unlock hota hai." },
    { direction: "outbound", body: "[flagged for agent: discount] asked for a lower deposit" },
    { direction: "inbound", body: "discount mil sakta hai?" },
  ];
  const history = buildChatHistory(rows);
  assert.deepEqual(history, [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Walikum Salam, kaise madad karoon?" },
    { role: "user", content: "course kya hai" },
    { role: "assistant", content: "$250 ka course free hai, $500 deposit par unlock hota hai." },
    { role: "user", content: "discount mil sakta hai?" },
  ]);
});

check("only the most recent `limit` turns are kept", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ direction: i % 2 === 0 ? "inbound" : "outbound", body: `msg ${i}` }));
  const history = buildChatHistory(rows, 4);
  assert.equal(history.length, 4);
  assert.equal(history[0].content, "msg 16");
  assert.equal(history[3].content, "msg 19");
});

check("an empty or all-internal history returns an empty array, never throws", () => {
  assert.deepEqual(buildChatHistory([]), []);
  assert.deepEqual(buildChatHistory([{ direction: "outbound", body: "[escalated to human: x]" }]), []);
  assert.deepEqual(buildChatHistory(undefined), []);
});

console.log(`\n${passed} passed\n`);
