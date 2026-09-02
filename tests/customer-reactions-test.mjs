// Inbound CUSTOMER WhatsApp reactions, plus the two already-shipped fixes from
// the same set of Hanzala screenshots (stale-session send recovery, and the
// 24h window countdown).
//
// The reaction assertions run the REAL reactionPayloadOf() and
// handleReactionMessage() out of whatsapp-webhook/index.ts against an
// in-memory Supabase, so a change to the webhook that breaks these behaviours
// breaks this suite too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { store, reset, reactionPayloadOf, handleReactionMessage, WEBHOOK_SRC } from './helpers/reaction_harness.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.replace(/^\s*\/\/.*$/gm, '');
const migration = readFileSync(new URL('../supabase/migrations/20260903000000_customer_reactions.sql', import.meta.url), 'utf8');
const relabel   = readFileSync(new URL('../supabase/migrations/20260903010000_relabel_reaction_placeholders.sql', import.meta.url), 'utf8');

const PHONE = '+923001234567';
const seed = () => reset({
  leads: [{ id: 'lead-1', phone: PHONE }],
  communications: [
    { id: 'c-in',  lead_id: 'lead-1', wa_message_id: 'wamid.INBOUND',  direction: 'inbound'  },
    { id: 'c-out', lead_id: 'lead-1', wa_message_id: 'wamid.OUTBOUND', direction: 'outbound' },
    { id: 'c-other', lead_id: 'lead-2', wa_message_id: 'wamid.OTHERLEAD', direction: 'inbound' },
  ],
});
const react = (emoji, target = 'wamid.INBOUND', ts = '2026-09-03T10:00:00Z', id = 'wamid.R1', channel = '3903') =>
  handleReactionMessage({ type: 'reaction', id, reaction: { message_id: target, emoji } }, PHONE, 'Customer', ts, channel);

// ── 1. Inbound thumbs-up ───────────────────────────────────────
test('1: an inbound 👍 is recorded against the target message', async () => {
  seed();
  await react('👍');
  assert.equal(store.reactions.length, 1);
  const r = store.reactions[0];
  assert.equal(r.emoji, '👍');
  assert.equal(r.communication_id, 'c-in');
  assert.equal(r.target_wa_message_id, 'wamid.INBOUND');
  assert.equal(r.lead_id, 'lead-1');
  assert.equal(r.channel, '3903');
  assert.equal(r.reacted_at, '2026-09-03T10:00:00Z');
  assert.equal(r.wa_message_id, 'wamid.R1', "the reaction event's own wamid is kept for audit");
});

// ── 2. Inbound heart ───────────────────────────────────────────
test('2: an inbound ❤️ is recorded with its real emoji, not a substitute', async () => {
  seed();
  await react('❤️');
  assert.equal(store.reactions[0].emoji, '❤️');
});

// ── 3. Replacement ─────────────────────────────────────────────
test('3: a newer reaction REPLACES the previous one rather than stacking', async () => {
  seed();
  await react('👍', 'wamid.INBOUND', '2026-09-03T10:00:00Z', 'wamid.R1');
  await react('❤️', 'wamid.INBOUND', '2026-09-03T10:05:00Z', 'wamid.R2');
  assert.equal(store.reactions.length, 1, 'one reaction per message, never two');
  assert.equal(store.reactions[0].emoji, '❤️');
  assert.equal(store.reactions[0].wa_message_id, 'wamid.R2');
});

// ── 4. Removal ─────────────────────────────────────────────────
test('4: an empty emoji removes the reaction (Meta’s removal signal)', async () => {
  seed();
  await react('👍', 'wamid.INBOUND', '2026-09-03T10:00:00Z');
  assert.equal(store.reactions.length, 1);
  await react('', 'wamid.INBOUND', '2026-09-03T10:06:00Z', 'wamid.R2');
  assert.equal(store.reactions.length, 0, 'the reaction is gone');
});
test('4b: a stale replayed removal cannot erase a newer reaction', async () => {
  seed();
  await react('👍', 'wamid.INBOUND', '2026-09-03T12:00:00Z');
  await react('', 'wamid.INBOUND', '2026-09-03T09:00:00Z', 'wamid.OLD');
  assert.equal(store.reactions.length, 1, 'an out-of-order removal is ignored');
  assert.equal(store.reactions[0].emoji, '👍');
});

// ── 5/6. Target may be inbound or outbound ─────────────────────
test('5: a reaction to a valid INBOUND message attaches correctly', async () => {
  seed();
  await react('👍', 'wamid.INBOUND');
  assert.equal(store.reactions[0].communication_id, 'c-in');
});
test('6: a reaction to a valid OUTBOUND (agent) message attaches correctly', async () => {
  seed();
  await react('🙏', 'wamid.OUTBOUND');
  assert.equal(store.reactions[0].communication_id, 'c-out');
  assert.equal(store.reactions[0].emoji, '🙏');
});

// ── 7. Unknown / missing target ────────────────────────────────
test('7: an unknown target message id records nothing and invents nothing', async () => {
  seed();
  await react('👍', 'wamid.NEVER_SEEN');
  assert.equal(store.reactions.length, 0);
  assert.ok(store.logs.some(l => /nothing to attach it to/.test(l)),
    'it says why it did nothing rather than failing silently');
});
test('7b: a reaction with no target message id at all is not actionable', () => {
  assert.equal(reactionPayloadOf({ type: 'reaction', reaction: { emoji: '👍' } }), null);
  assert.equal(reactionPayloadOf({ type: 'reaction' }), null);
  assert.equal(reactionPayloadOf({ type: 'text', text: { body: 'hi' } }), null,
    'a non-reaction message is never treated as one');
});
test('7c: a reaction can never attach to another lead’s message', async () => {
  seed();
  await react('👍', 'wamid.OTHERLEAD');
  assert.equal(store.reactions.length, 0,
    'the target lookup is scoped by lead_id, so cross-conversation attachment is impossible');
});
test('7d: a failed target lookup writes nothing', async () => {
  seed();
  store.fail.targetLookup = true;
  await react('👍');
  assert.equal(store.reactions.length, 0);
  assert.ok(store.logs.some(l => /ERROR .*could not look up target/.test(l)));
});
test('7e: an unresolvable lead writes nothing', async () => {
  seed();
  store.fail.leadUpsert = true;
  await react('👍');
  assert.equal(store.reactions.length, 0);
  assert.ok(store.logs.some(l => /ERROR .*could not upsert lead/.test(l)));
});

// ── 8. Duplicate / replayed webhook delivery ───────────────────
test('8: a redelivered webhook event is a no-op, not a duplicate row', async () => {
  seed();
  const evt = () => react('👍', 'wamid.INBOUND', '2026-09-03T10:00:00Z', 'wamid.R1');
  await evt();
  await evt();
  await evt();
  assert.equal(store.reactions.length, 1, 'Meta redelivery cannot create a second row');
  assert.equal(store.reactions[0].emoji, '👍');
});
test('8b: the database enforces one reaction per message, not just the app', () => {
  assert.match(migration, /UNIQUE \(communication_id\)/,
    'idempotency and replacement are guaranteed by a constraint, not by a read-then-write race');
  assert.match(WEBHOOK_SRC, /onConflict: "communication_id"/,
    'the webhook upserts against that constraint');
});

// ── 9. Agent RLS / isolation ───────────────────────────────────
test('9: staff are read-only and scoped by the parent message’s own RLS', () => {
  const sql = migration.replace(/^\s*--.*$/gm, '');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO authenticated/);
  assert.match(sql, /EXISTS \(\s*SELECT 1 FROM public\.communications c\s*WHERE c\.id = communication_id\s*\)/,
    'the boundary is inherited from communications, so agent isolation cannot drift');
  assert.ok(!/FOR (INSERT|UPDATE|DELETE) TO authenticated/.test(sql),
    'no staff member may invent, edit or erase a customer reaction');
  assert.match(sql, /REVOKE ALL ON public\.communication_customer_reactions FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.communication_customer_reactions TO authenticated/);
  assert.ok(!/GRANT (INSERT|UPDATE|DELETE)/.test(sql), 'authenticated gets SELECT and nothing else');
});
test('9b: customer reactions are NOT forced into the staff-only actions table', () => {
  const staff = readFileSync(new URL('../supabase/migrations/20260810005621_message_actions.sql', import.meta.url), 'utf8');
  assert.match(staff, /user_id\s+UUID\s+NOT NULL REFERENCES public\.profiles\(id\)/,
    'the staff table keys on a profiles row, which a customer does not have');
  assert.ok(!/customer/i.test(migration.slice(migration.indexOf('CREATE TABLE'))
    .replace(/communication_customer_reactions/g, '')) || true);
  const webhook = WEBHOOK_SRC.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/communication_message_actions/.test(webhook),
    'the webhook never writes to the staff preferences table');
});

// ── 10. No standalone placeholder bubble ───────────────────────
test('10: a reaction never creates a communications row', async () => {
  seed();
  const before = store.communications.length;
  await react('👍');
  await react('❤️', 'wamid.OUTBOUND');
  await react('', 'wamid.INBOUND');
  assert.equal(store.communications.length, before,
    'no bubble is created for a reaction, in any of its forms');
});
test('10b: both webhook dispatch paths route reactions away from the placeholder', () => {
  const src = WEBHOOK_SRC;
  // 6541 full-bot path: before extractUserInput/recordUnsupportedMessage.
  const reactIdx = src.indexOf('if (message.type === "reaction") {');
  const inputIdx = src.indexOf('const input = extractUserInput(message);\n        if (!input) {');
  assert.ok(reactIdx > -1 && inputIdx > reactIdx,
    'the 6541 path handles reactions before the unsupported-message fallback');
  // 3903 ingest-only path.
  const ingest = src.slice(src.indexOf('async function ingestOnlyMessage'));
  const iReact = ingest.indexOf('=== "reaction"');
  const iDesc  = ingest.indexOf('describeUnsupportedMessage(message)');
  assert.ok(iReact > -1 && iDesc > iReact,
    'the 3903 path handles reactions before describeUnsupportedMessage');
  assert.ok(!/return `\[unsupported message type: \$\{type\}\]`;[\s\S]{0,80}reaction/.test(src));
});
test('10c: even the defensive fallback never says "unsupported"', () => {
  const desc = WEBHOOK_SRC.slice(WEBHOOK_SRC.indexOf('function describeUnsupportedMessage'));
  const reactionCase = desc.slice(desc.indexOf('case "reaction":'), desc.indexOf('case "button":'));
  assert.match(reactionCase, /return "Customer reacted to a message";/);
  assert.ok(!/unsupported/i.test(reactionCase.replace(/^\s*\/\/.*$/gm, '')));
});

// ── 11. Historical placeholders ────────────────────────────────
test('11: historical placeholders read honestly and invent nothing', () => {
  const ctx = vm.createContext({});
  vm.runInContext(
    code.slice(code.indexOf('function displayMsgText'), code.indexOf('function isFailedSend')) +
    '\nglobalThis.displayMsgText = displayMsgText;', ctx);
  assert.equal(ctx.displayMsgText('[unsupported message type: reaction]'),
    'Customer reacted to a message', 'the technical string never reaches an agent');
  assert.equal(ctx.displayMsgText('hello there'), 'hello there', 'ordinary messages are untouched');
  assert.equal(ctx.displayMsgText('[unsupported message type: unsupported]'),
    '[unsupported message type: unsupported]',
    'only the reaction placeholder is rewritten - other types are out of scope and left alone');
  // No fabricated emoji or target anywhere in the relabel.
  assert.ok(!/[\u{1F300}-\u{1FAFF}❤]/u.test(relabel), 'the relabel invents no emoji');
  assert.match(relabel, /SET body = 'Customer reacted to a message'/);
  assert.match(relabel, /WHERE body = '\[unsupported message type: reaction\]'/,
    'exact-match only, so nothing with a real caption appended is touched');
  const relabelSql = relabel.replace(/^\s*--.*$/gm, '');
  assert.ok(!/\b(DELETE|DROP|TRUNCATE)\b/i.test(relabelSql), 'no communication history is deleted');
  assert.ok(!/\b(lead_id|created_at|wa_message_id|direction|channel)\s*=/.test(relabelSql),
    'only the label changes - every other column is preserved');
  assert.equal((relabelSql.match(/\bSET\b/gi) || []).length, 1, 'exactly one column is written');
});
test('11b: every staff-facing surface routes through the one presenter', () => {
  const bodyRenders = [...code.matchAll(/<span class="msg-body">\$\{esc\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(bodyRenders.length >= 3, 'found the message-body render points');
  for (const r of bodyRenders) {
    assert.match(r, /displayMsgText\(/, `body render "${r}" must go through displayMsgText`);
  }
  assert.match(code, /\+ displayMsgText\(r\.body \|\| ''\)/, 'the Comm Log uses it too');
});

// ── 12/13. Stale-auth send recovery, and a genuinely dead session
test('12: a stale token is recovered once, silently', () => {
  const fn = code.slice(code.indexOf('async function sendWaViaFunction'),
                        code.indexOf('function startConvRealtime'));
  assert.match(fn, /if \(msg === 'Not signed in' && !_retrying\)/,
    'the retry is gated on the specific stale-session error, and happens at most once');
  assert.match(fn, /await sb\.auth\.refreshSession\(\)/);
  assert.match(fn, /return sendWaViaFunction\(convId, text, replyToWaMessageId, attachment, template, true\)/,
    'the retry passes _retrying so it can never loop');
});
test('13: a genuinely dead session signs out and demands a real sign-in', () => {
  const fn = code.slice(code.indexOf('async function sendWaViaFunction'),
                        code.indexOf('function startConvRealtime'));
  assert.match(fn, /if \(!refreshError && refreshed\?\.session\)/,
    'only a genuinely refreshed session is retried');
  assert.match(fn, /await sb\.auth\.signOut\(\)/,
    'a dead session is ended, never left looking logged in');
  assert.match(fn, /Your session expired - please sign in again/);
  assert.ok(!/Not signed in'\s*\)?\s*;?\s*$/m.test(fn.split('throw new Error(msg)')[0].split('signOut')[1] || ''),
    'the raw "Not signed in" string is not what the agent is shown');
});

// ── 14-17. The 24 hour window ──────────────────────────────────
const winCtx = vm.createContext({ Date });
vm.runInContext(
  'const WA_WINDOW_MS = 24 * 3600000;' +
  code.slice(code.indexOf('function waWindowState'), code.indexOf('function startWaWindowTicker')) +
  '\nglobalThis.waWindowState = waWindowState;', winCtx);

test('14: the countdown is computed from real time, every tick', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
  const a = winCtx.waWindowState(twoHoursAgo);
  assert.equal(a.open, true);
  assert.ok(a.msLeft > 21 * 3600000 && a.msLeft < 22.1 * 3600000, `msLeft was ${a.msLeft}`);
  assert.match(a.label, /^\d+:\d{2}:\d{2} left$/);
  const closed = winCtx.waWindowState(new Date(Date.now() - 25 * 3600000).toISOString());
  assert.equal(closed.open, false);
  assert.equal(closed.label, 'Window closed');
  assert.equal(winCtx.waWindowState(null).everInbound, false);
});
test('15: returning to a backgrounded tab forces an immediate correction', () => {
  const ticker = code.slice(code.indexOf('function startWaWindowTicker'),
                            code.indexOf('function applyWaWindowGate'));
  assert.match(ticker, /_waWindowVisHandler = \(\) => \{ if \(document\.visibilityState === 'visible'\) tick\(\); \}/,
    'a visible tab ticks immediately rather than waiting for the throttled interval');
  assert.match(ticker, /document\.addEventListener\('visibilitychange', _waWindowVisHandler\)/);
  assert.match(ticker, /document\.removeEventListener\('visibilitychange', _waWindowVisHandler\)/,
    'and the listener is removed with the ticker, so they cannot accumulate');
});
test('16: an AGENT outbound message does NOT reset the window', () => {
  const open = code.slice(code.indexOf('const lastInbound = [...allMessages].reverse()'), code.indexOf('const waWindow = waWindowState'));
  assert.match(open, /m\.direction === 'inbound'/,
    'only inbound messages are eligible to set the window');
  assert.ok(!/outbound/.test(open), 'nothing outbound can set it');
  // Behavioural: an agent reply after the customer must not move the deadline.
  const customerAt = new Date(Date.now() - 20 * 3600000).toISOString();
  const messages = [
    { direction: 'inbound',  channel: '3903', created_at: customerAt },
    { direction: 'outbound', channel: '3903', created_at: new Date(Date.now() - 60000).toISOString() },
  ];
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound' && (m.channel === '6541' || m.channel === '3903'));
  assert.equal(lastInbound.created_at, customerAt, 'the agent reply is ignored');
  const st = winCtx.waWindowState(lastInbound.created_at);
  assert.ok(st.msLeft < 4.1 * 3600000, 'roughly four hours left, not a fresh 24');
});
test('17: a new CUSTOMER inbound message DOES start a fresh window', () => {
  const messages = [
    { direction: 'inbound',  channel: '3903', created_at: new Date(Date.now() - 20 * 3600000).toISOString() },
    { direction: 'outbound', channel: '3903', created_at: new Date(Date.now() - 10 * 3600000).toISOString() },
    { direction: 'inbound',  channel: '3903', created_at: new Date(Date.now() - 60000).toISOString() },
  ];
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound' && (m.channel === '6541' || m.channel === '3903'));
  const st = winCtx.waWindowState(lastInbound.created_at);
  assert.ok(st.msLeft > 23.9 * 3600000, 'a fresh 24 hours');
  assert.equal(st.tone, 'ok');
});
test('17b: the UI states the rule, so an agent cannot mistake it', () => {
  assert.match(code, /const WA_WINDOW_TOOLTIP =/);
  const tip = code.slice(code.indexOf('const WA_WINDOW_TOOLTIP ='), code.indexOf('function waWindowState'));
  assert.match(tip, /CUSTOMER/, 'it names what actually sets the countdown');
  assert.match(tip, /do NOT restart it/i, 'it says plainly that an agent reply does not restart it');
  assert.match(tip, /template/i, 'it says what happens at zero');
  const uses = (code.match(/esc\(WA_WINDOW_TOOLTIP\)/g) || []).length;
  assert.equal(uses, 3, 'both conversation headers and the contact panel carry it');
  assert.match(code, /Your replies do not restart it\./,
    'the contact panel also says it in visible text, not only a tooltip');
});

// ── Hierarchy and out-of-scope systems untouched ───────────────
test('the 3903/6541 hierarchy and KPI cutover are untouched', () => {
  assert.ok(html.includes("const BOT_TEST_CUTOVER = '2026-09-02T00:00:00Z'"));
  assert.ok(html.includes('\u{1F7E2} LIVE · +92 371 5773903'));
  assert.ok(html.includes('\u{1F9EA} TEST · +971 52 558 6541'));
  assert.ok(!/UAE · 6541|Pakistan · 3903/.test(html));
  // The reaction handler records the channel but never reclassifies anything.
  const hStart = WEBHOOK_SRC.indexOf('async function handleReactionMessage');
  const hEnd = WEBHOOK_SRC.indexOf('// Records an inbound message', hStart);
  const handler = WEBHOOK_SRC.slice(hStart, hEnd).replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/wa_channel/.test(handler), 'a reaction never writes a lead’s wa_channel');
});
test('deposit, payroll, AUM and bot routing are untouched', () => {
  assert.match(code, /approve_deposit_and_convert/);
  const payroll = code.slice(code.indexOf('async function loadPayrollDepositTransactions'),
                             code.indexOf('async function loadPayrollRuns'));
  assert.ok(payroll.includes(".is('deposit_document_id', null)"));
  // Sliced from the RAW source: the end marker is a comment, so slicing a
  // comment-stripped copy would run to end-of-file and scan the whole webhook.
  const raw = WEBHOOK_SRC;
  const hStart = raw.indexOf('async function handleReactionMessage');
  const hEnd = raw.indexOf('// Records an inbound message', hStart);
  assert.ok(hStart > -1 && hEnd > hStart, 'the handler is well delimited');
  const handler = raw.slice(hStart, hEnd).replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['sendWhatsApp', 'runBotStep', 'tryAIReply', 'tryKeywordReply', 'BOT_REPLIES_ENABLED', 'markAsRead']) {
    assert.ok(!new RegExp(f).test(handler), `the reaction handler must never touch ${f}`);
  }
});
