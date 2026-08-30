// A customer who picks Roman Urdu must stay in Roman Urdu for the WHOLE funnel.
//
// Found by Muhammad's wife in five minutes of real testing on 2026-08-23: she
// chose Roman Urdu, got the greeting and menu in Urdu, then the entire rest of
// the flow in English. Cause: the four button/card senders took a plain string
// and all fifteen call sites passed English only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../whatsapp-webhook/index.ts', import.meta.url), 'utf8');

// ── No prompt may reach a sender as a bare English string ───────────────────
// sendDepositConfirm joined this list on 2026-08-23. It was missed by the
// first sweep because its signature ends in an OPTIONAL body string, so it was
// almost always called as sendDepositConfirm(to, broker) with no literal for
// the bare-string check below to catch. The result was visible in Junaid's
// live test: the whole funnel in Roman Urdu, and then the single most
// important question in it - the $500 deposit - in English.
const SENDERS = [
  'sendTraderStatusButtons', 'sendBrokerCard',
  'sendExperienceButtons', 'sendTradedBeforeButtons',
  'sendDepositConfirm',
];
for (const fn of SENDERS) {
  const bare = new RegExp(`${fn}\\(\\s*to\\s*,\\s*["\`]`, 'g');
  const hits = src.match(bare) || [];
  assert.equal(hits.length, 0,
    `${fn} is being handed a raw string. Every prompt must go through t(lang, en, ur) or a Roman Urdu customer gets English.`);
}

// ── Every sender must accept a language ─────────────────────────────────────
for (const fn of SENDERS) {
  assert.match(src, new RegExp(`async function ${fn}\\([^)]*lang: Lang`),
    `${fn} must take a lang argument so its button labels can be translated.`);
}

// ── Button labels must be translated, not left English ──────────────────────
for (const [en, ur] of [
  ['I have an account', 'Account hai'],
  ['First time', 'Pehli baar'],
  ['New to trading', 'Naya hun'],
  ['Experienced', 'Tajurba hai'],
  ['Yes', 'Haan'],
  ['No', 'Nahi'],
  ['Both', 'Dono'],
  ['Go Back', 'Peeche Jayein'],
]) {
  assert.ok(src.includes(`t(lang, "${en}", "${ur}")`),
    `Button "${en}" has no Roman Urdu label.`);
}

// ── WhatsApp's own limits, which silently truncate if broken ────────────────
// List row titles cap at 24 characters and button titles at 20. A prompt that
// renders truncated on a customer's phone is worse than an untranslated one.
const rowTitles = [...src.matchAll(/\{ id: "(?:menu|broker)_[a-z_]+", title: (?:t\(lang, )?"([^"]+)"(?:, "([^"]+)")?/g)];
assert.ok(rowTitles.length > 0, 'Expected to find list row titles to check.');
for (const m of rowTitles) {
  for (const title of [m[1], m[2]].filter(Boolean)) {
    assert.ok(title.length <= 24, `List row title "${title}" is ${title.length} chars, over WhatsApp's 24 limit.`);
  }
}
const buttonTitles = [...src.matchAll(/\{ id: "(?:trader|exp|traded|nav)_[a-z_]+", title: t\(lang, "([^"]+)", "([^"]+)"\)/g)];
assert.ok(buttonTitles.length >= 7, 'Expected the reply-button titles to be found.');
for (const m of buttonTitles) {
  for (const title of [m[1], m[2]]) {
    assert.ok(title.length <= 20, `Reply button title "${title}" is ${title.length} chars, over WhatsApp's 20 limit.`);
  }
}

// ── The helper itself picks the right side ──────────────────────────────────
assert.match(src, /function t\(lang: Lang, en: string, ur: string\): string \{\s*return lang === "ur" \? ur : en;/,
  't() must return the Urdu string for "ur" and English otherwise.');

console.log('flow-language: every prompt and button is bilingual and within WhatsApp limits.');

// -- The deposit step specifically, because it is the one that got missed ----
// A sender with an optional trailing string is exactly the shape the
// bare-string regex above cannot see, so check the copy itself, not the call.
for (const [en, ur] of [
  ["Yes, I'm ready", 'Ji haan, tayyar hun'],
  ['Not right now', 'Abhi nahi'],
]) {
  const pattern = new RegExp('t\\(lang, "' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '", "' + ur + '"\\)');
  assert.match(src, pattern, `The deposit confirmation button "${en}" has no Roman Urdu label.`);
}

// WhatsApp truncates a reply-button title over 20 characters, which would
// silently mangle the funnel's most important buttons rather than error.
for (const label of ['Ji haan, tayyar hun', 'Abhi nahi', 'Peeche Jayein']) {
  assert.ok(label.length <= 20, `Button label "${label}" is ${label.length} chars; WhatsApp's limit is 20.`);
}

// The deposit question and the post-qualification instructions must both be
// bilingual - the second is what a lead reads at the moment they convert.
assert.match(src, /Is offer ke liye .* \$500 deposit karna hoga/,
  'The $500 deposit question has no Roman Urdu version.');
assert.match(src, /Zabardast! Neeche diye gaye link se/,
  'The post-qualification deposit instructions have no Roman Urdu version.');

console.log("  ok  the deposit step speaks the customer's language");
