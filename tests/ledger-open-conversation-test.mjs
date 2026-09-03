// Financial Ledger -> Omnichannel Inbox, straight to that lead's conversation.
//
// The point of this feature is that a staff member reading a customer's ledger
// can reach the conversation in one click instead of copying a phone number and
// hunting for it. The risks worth pinning down are that it must identify the
// lead canonically, must not become a second way to bypass RLS, and must not
// undo the Inbox paging work by fetching everything to find one row.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the action lives in the Financial Ledger and carries the canonical lead id', () => {
  const ledger = block('function buildLedgerTab', 'async function saveBalance');
  assert.match(ledger, /onclick="openConversationFromLedger\('\$\{leadId\}','\$\{ctx\}'\)"/,
    'the button must pass the lead UUID the ledger already holds');
  assert.match(ledger, /title="Open Conversation"/);
  assert.match(ledger, /&#128172; Open Conversation/, 'compact chat icon plus label');
  // Never the display fields - they are duplicated and inconsistently formatted.
  assert.ok(!/openConversationFromLedger\(\s*['"`]?\$\{(lead\.full_name|lead\.phone)/.test(ledger),
    'name or phone must never be used as the identifier');
});

test('identity is the lead UUID end to end', () => {
  const fn = block('async function openConversationFromLedger', 'function openInboxTabForScope');
  assert.match(fn, /\.eq\('lead_id', leadId\)\.limit\(1\)/,
    'the lookup is by lead_id, and fetches one row');
  assert.match(fn, /await openConversation\(leadId, scope\)/,
    'the same id opens the conversation - no re-resolution by name or phone');
});

test('authorization is inherited from RLS, never re-implemented', () => {
  const fn = block('async function openConversationFromLedger', 'function openInboxTabForScope');
  assert.match(fn, /from\('inbox_conversation_list'\)/,
    'the check reads the security_invoker view, so RLS answers it');
  assert.ok(!/service_role|supabaseAdmin|SERVICE_ROLE/.test(fn),
    'no elevated credential may appear in the browser');
  // An unauthorised id and a lead with no conversation must be indistinguishable,
  // or the response itself tells an agent that someone else's lead exists.
  assert.match(fn, /if \(!data \|\| !data\.length\) \{[\s\S]{0,400}No conversation found for this lead yet\./,
    'both cases give the same message');
  assert.equal((fn.match(/No conversation found for this lead yet\./g) || []).length, 1,
    'exactly one message covers both cases');
});

test('nothing is fabricated to make the navigation succeed', () => {
  const fn = stripJs(block('async function openConversationFromLedger', 'function openInboxTabForScope'));
  assert.ok(!/\.insert\(/.test(fn), 'it must never create a conversation or message row');
  assert.ok(!/\.update\(/.test(fn), 'and must not write anything at all');
});

test('a conversation outside the loaded pages is reachable without a full fetch', () => {
  const fn = block('async function openConversationFromLedger', 'function openInboxTabForScope');
  assert.match(fn, /\.limit\(1\)/, 'one row is fetched, not the list');
  assert.ok(!/fetchAllRows|limit\(5000\)/.test(fn), 'the whole set must never be pulled to find one row');
  const ensure = block('function ensureConvRowPresent', '\nfunction openLeadFromConversation');
  assert.match(ensure, /listEl\.insertAdjacentHTML\('afterbegin', convRowHtml\(row, scope\)\)/,
    'the row is injected using the existing card renderer, not a second one');
  assert.match(ensure, /st\.ids\.add\(row\.lead_id\)/,
    'paging must know about the injected row so a later page cannot duplicate it');
});

test('the open conversation stays visible in the list across a reconcile', () => {
  const load = block('async function loadConvPage', 'function convEmptyHtml');
  assert.match(load, /const openRow = _activeConvId && !rows\.some\(c => c\.lead_id === _activeConvId\)/,
    'a reconcile re-reads only the loaded depth and would drop an off-page open chat');
  assert.match(load, /if \(openRow\) rows = \[openRow\]\.concat\(rows\);/);
  // Only while genuinely absent, so it cannot become a permanent stowaway row.
  assert.match(load, /\? st\.rows\.find\(c => c\.lead_id === _activeConvId\)\s*\n\s*: null;/);
});

test('it reuses the Inbox stack rather than duplicating it', () => {
  const fn = block('async function openConversationFromLedger', 'function whenConvListSettled');
  for (const reused of ['openConversation(', 'convRowFromView(', 'convRowHtml(', 'CONV_LIST_COLS', 'convPaging('])
    assert.ok(html.includes(reused), `${reused} must still be the shared implementation`);
  assert.match(fn, /function openInboxTabForScope\(scope\) \{[\s\S]{0,400}agentTab\('conversations'[\s\S]{0,200}adminTab\('conversations'\)/,
    'one helper picks the shell for the signed-in role - no role-specific copy');
});

test('it waits on real state, not an arbitrary delay', () => {
  const w = block('function whenConvListSettled', 'function ensureConvRowPresent');
  assert.match(w, /listEl\.dataset\.convLoaded === '1' && !st\.loading/,
    'readiness is the list\'s own state');
  assert.match(w, /Date\.now\(\) - started > timeoutMs/, 'and it gives up rather than hanging');
});

test('no financial or business logic moved', () => {
  const ledger = block('function buildLedgerTab', 'async function saveBalance');
  // The ledger still renders the same figures through the same helpers.
  for (const keep of ['fmtMoney(lead.account_balance)', 'balance_locked', 'txTypeLabel(t.type)', 'fmtMoney(t.amount)'])
    assert.ok(ledger.includes(keep), `the ledger must still render ${keep}`);
  const fn = stripJs(block('async function openConversationFromLedger', 'function openInboxTabForScope'));
  for (const forbidden of ['account_balance', 'transactions', 'approve_deposit', 'payroll', 'wa_channel'])
    assert.ok(!fn.includes(forbidden), `navigation must not touch ${forbidden}`);
});
