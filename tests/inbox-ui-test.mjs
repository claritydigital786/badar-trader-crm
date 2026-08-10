import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sendFunction = readFileSync(new URL('../supabase/functions/send-wa-message/index.ts', import.meta.url), 'utf8');
const messageActionsMigration = readFileSync(new URL('../supabase/migrations/20260810005621_message_actions.sql', import.meta.url), 'utf8');

assert.match(
  html,
  /\.msg-bubble\s*\{[^}]*white-space:normal[^}]*\}/,
  'Bubble template whitespace must collapse so indentation cannot inflate messages.',
);
assert.match(
  html,
  /\.msg-body\s*\{[^}]*white-space:pre-wrap[^}]*\}/,
  'The real message body must still preserve intentional customer line breaks.',
);
assert.match(
  html,
  /\.msg-day-sep\s*\{[^}]*position:sticky[^}]*top:8px[^}]*\}/,
  'The WhatsApp-style day label must remain visible at the top while scrolling.',
);

const messageBodyUses = html.match(/class="msg-body"/g) || [];
assert.equal(
  messageBodyUses.length,
  4,
  'Demo, optimistic demo send, full live render, and realtime insert must all isolate message-body whitespace.',
);
assert.doesNotMatch(
  html,
  /class="msg-time">\$\{fmtConvTime\(m\.created_at\)\}/,
  'A message bubble must not replace an old message time with a calendar date.',
);
assert.match(
  html,
  /class="msg-time">[\s\S]{0,140}\$\{fmtConvMessageTime\(m\.created_at\)\}/,
  'The full live render must use the message-only clock formatter.',
);
assert.match(
  html,
  /class="msg-time">[\s\S]{0,140}\$\{fmtConvMessageTime\(payload\.new\.created_at\)\}/,
  'Realtime messages must use the same clock formatter.',
);
assert.match(
  html,
  /appendConvDaySeparatorIfNeeded\(msgArea, payload\.new\.created_at\)/,
  'Realtime messages must create a new day divider when the calendar day changes.',
);

for (const label of ['Message info', 'Reply', 'Copy', 'React', 'Forward', 'Pin', 'Star', 'Add text to note', 'Delete']) {
  assert.match(html, new RegExp(`>${label}<|['"]${label}['"]`), `The message menu must include ${label}.`);
}
assert.match(
  html,
  /messageActionButtonHtml\(\{ id:payload\.new\.id/,
  'Realtime messages must receive the same dropdown as existing messages.',
);
assert.match(
  html,
  /This does not delete or unsend the message on WhatsApp/,
  'Delete must be described honestly as a recoverable CRM-only hide.',
);
assert.match(
  html,
  /sb\.from\('lead_activity'\)\.insert/,
  'Add text to note must use the durable lead activity log.',
);
assert.match(
  messageActionsMigration,
  /ALTER TABLE public\.communication_message_actions ENABLE ROW LEVEL SECURITY/,
  'Per-user message actions must have RLS enabled.',
);
assert.match(
  messageActionsMigration,
  /user_id = \(SELECT auth\.uid\(\)\)[\s\S]*public\.communications/,
  'Message-action policies must bind the user and verify access to the parent communication.',
);
assert.match(
  messageActionsMigration,
  /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO authenticated/,
  'The new table must be explicitly exposed to authenticated Data API clients.',
);
assert.match(
  sendFunction,
  /type: "reaction"[\s\S]*message_id: reactionToWaMessageId[\s\S]*emoji: reactionEmoji/,
  'The Edge Function must use Meta reaction messages rather than a fake CRM-only reaction.',
);
assert.match(
  sendFunction,
  /lead\.assigned_agent_id === user\.id/,
  'The service-role send path must repeat the assigned-agent authorization boundary.',
);
assert.match(
  sendFunction,
  /\.eq\("lead_id", leadId\)[\s\S]*\.eq\("wa_message_id", reactionToWaMessageId\)/,
  'A reaction WAMID must belong to the active lead before it is sent.',
);

const formatter = html.match(
  /function fmtConvMessageTime\(isoStr\) \{([\s\S]*?)\n\}/,
);
assert.ok(formatter, 'Message timestamp formatter must exist.');
const formatMessageTime = new Function('isoStr', formatter[1]);
const oldMessageTime = formatMessageTime('2026-07-27T09:05:00Z');
assert.match(
  oldMessageTime,
  /^\d{1,2}:\d{2}\s(?:AM|PM)$/,
  'Even an old message must display a clock time, not Jul 27.',
);

const inlineScripts = [];
let cursor = 0;
while (true) {
  const start = html.indexOf('<script>', cursor);
  if (start < 0) break;
  const end = html.indexOf('</script>', start + 8);
  assert.notEqual(end, -1, 'Inline script block must close.');
  inlineScripts.push(html.slice(start + 8, end));
  cursor = end + 9;
}
assert.ok(inlineScripts.length > 0, 'At least one inline script must exist.');
inlineScripts.forEach((source) => new Function(source));

console.log('Inbox UI regression checks passed.');
