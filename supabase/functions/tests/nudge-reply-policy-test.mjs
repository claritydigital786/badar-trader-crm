// Tests for the "are you there?" nudge classifier and the full-vs-short reply
// decision. Real case, 2026-08-30: a customer sent two "are you there" style
// messages back to back and correctly got one combined answer; a third such
// message right after should get something short and different, not the same
// script again.
import assert from "node:assert/strict";
import {
  isImpatienceNudge,
  chooseNudgeReplyStyle,
  pickNudgeShortReply,
  NUDGE_SHORT_REPLIES_EN,
  NUDGE_SHORT_REPLIES_UR,
} from "../_shared/nudge_reply_policy.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("nudge reply policy");

check("real nudges from the actual transcript are recognised", () => {
  assert.equal(isImpatienceNudge("Are you still there? I need an answer"), true);
  assert.equal(isImpatienceNudge("Is anybody there?"), true);
});

check("common Roman Urdu nudges are recognised", () => {
  assert.equal(isImpatienceNudge("koi hai?"), true);
  assert.equal(isImpatienceNudge("jawab dein please"), true);
});

check("a real question is never misread as a nudge", () => {
  assert.equal(isImpatienceNudge("What is the minimum deposit required with XM?"), false);
  assert.equal(isImpatienceNudge("Yeh $500 offer kya hai?"), false);
  assert.equal(isImpatienceNudge(""), false);
  assert.equal(isImpatienceNudge(undefined), false);
});

check("a long message containing a short trigger phrase is not short-changed", () => {
  const long = "Hello, are you there? I wanted to ask about the deposit process and whether XM or Exness is better for a beginner like me.";
  assert.equal(isImpatienceNudge(long), false);
});

check("first nudge of a wait gets the full answer", () => {
  assert.equal(
    chooseNudgeReplyStyle({ isNudge: true, alreadyAnsweredSinceEscalation: false }),
    "full",
  );
});

check("a repeat nudge after one has already been answered gets the short reply", () => {
  assert.equal(
    chooseNudgeReplyStyle({ isNudge: true, alreadyAnsweredSinceEscalation: true }),
    "short",
  );
});

check("a non-nudge always runs the normal path, regardless of history", () => {
  assert.equal(chooseNudgeReplyStyle({ isNudge: false, alreadyAnsweredSinceEscalation: true }), "normal");
  assert.equal(chooseNudgeReplyStyle({ isNudge: false, alreadyAnsweredSinceEscalation: false }), "normal");
});

check("short replies never self-identify as AI, a bot, or an assistant", () => {
  for (const line of [...NUDGE_SHORT_REPLIES_EN, ...NUDGE_SHORT_REPLIES_UR]) {
    assert.doesNotMatch(line.toLowerCase(), /\b(ai|bot|assistant|chatbot)\b/);
  }
});

check("pickNudgeShortReply always returns a real pool entry for both languages", () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(NUDGE_SHORT_REPLIES_EN.includes(pickNudgeShortReply("en")));
    assert.ok(NUDGE_SHORT_REPLIES_UR.includes(pickNudgeShortReply("ur")));
  }
});

console.log(`\n${passed} passed\n`);
