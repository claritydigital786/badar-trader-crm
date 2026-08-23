// The double-reply bug Muhammad's wife found 2026-08-23: a genuine question at
// a button stage got the apology AND the same button prompt re-sent in one
// breath. Option 1's fix - stay quiet on the prompt for exactly one turn when
// the customer typed free text, re-show it only on the next unmatched turn.
import assert from 'node:assert/strict';
import { shouldSuppressRePrompt } from '../_shared/unmatched_reprompt_policy.mjs';

// ── The exact reported scenario: free text, first unmatched attempt ────────
assert.equal(
  shouldSuppressRePrompt({ text: 'Ya offer kya hai', selectionId: null }, 1),
  true,
  'A genuine question on the first unmatched turn must not get a re-prompt piled on top of the apology.'
);

// ── The next unmatched message DOES get the re-prompt back ─────────────────
assert.equal(
  shouldSuppressRePrompt({ text: 'Ya offer kya hai', selectionId: null }, 2),
  false,
  'A second unmatched turn in a row must re-show the prompt, not stay silent forever.'
);

// ── A stray tap on a button that did not match anything is not "free text" ─
// (selectionId present) - reminding them of the menu immediately is still the
// right move here, this is a mis-tap, not someone asking a question.
assert.equal(
  shouldSuppressRePrompt({ text: 'Something Else', selectionId: 'menu_unknown' }, 1),
  false,
  'An unmatched button/list selection must still get an immediate re-prompt.'
);

// ── Empty or whitespace-only text is not free text either ──────────────────
for (const text of ['', '   ', undefined, null]) {
  assert.equal(
    shouldSuppressRePrompt({ text, selectionId: null }, 1),
    false,
    `Empty input (${JSON.stringify(text)}) must not suppress the re-prompt.`
  );
}

// ── Never suppresses past the first attempt, however high retries climbs ───
for (const retries of [2, 3, 4]) {
  assert.equal(
    shouldSuppressRePrompt({ text: 'still confused', selectionId: null }, retries),
    false,
    `retries=${retries} must not suppress - only the very first unmatched attempt does.`
  );
}

// ── Missing input entirely never throws, just behaves like empty text ──────
assert.equal(shouldSuppressRePrompt(undefined, 1), false);
assert.equal(shouldSuppressRePrompt(null, 1), false);

console.log('unmatched-reprompt-policy: stays quiet for exactly one free-text turn, never longer.');
