// Phase 39 - deposit-confirmation idempotency and the Pending Approval alert.
//
// Two of these checks are behavioural, not textual: the idempotency key and the
// replay decision are reimplemented here from the same rules the Edge Function
// uses and exercised against real inputs, because "the source contains a hash
// call" would not have caught a key that splits on decimal formatting or a
// guard that runs after the side effects instead of before them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hook      = read('../supabase/functions/conversion-hook/index.ts');
const notifier  = read('../supabase/functions/notify-admin-pending-approval/index.ts');
const migration = read('../supabase/migrations/20260831050000_deposit_submission_idempotency.sql');
const join      = read('../join.html');
const thankyou  = read('../thankyou.html');
const html      = read('../index.html');

// ── A faithful model of the function's key + claim rules ───────
// Mirrors submissionKey() in conversion-hook and claim_deposit_submission().
function submissionKey(leadId, platform, amount, acct) {
  const canonical = [
    'v1', leadId, platform,
    (Number.isFinite(amount) ? amount : 0).toFixed(2),
    String(acct ?? '').trim().toLowerCase(),
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}
function makeLedger() {
  const rows = new Map();
  return {
    rows,
    // Returns true exactly once per key, as the ON CONFLICT / xmax=0 claim does.
    claim(key) {
      if (rows.has(key)) { rows.get(key).replay_count += 1; return false; }
      rows.set(key, { replay_count: 0 });
      return true;
    },
  };
}
// One request through the hook, reduced to the effects that must not repeat.
function submit(state, { leadId, platform, amount, acct }) {
  const key = submissionKey(leadId, platform, amount, acct);
  if (!state.ledger.claim(key)) return { processed: false, duplicate: true };
  state.transitions += 1;
  state.activity += 1;
  // The alert reuses pending_approval_notifications, keyed by the lead and the
  // status transition, so it fires once per pending-approval episode.
  const notifyKey = `${leadId}|${state.statusChangedAt}`;
  if (!state.notified.has(notifyKey)) { state.notified.add(notifyKey); state.alerts += 1; }
  return { processed: true, duplicate: false };
}
const freshState = () => ({
  ledger: makeLedger(), transitions: 0, activity: 0, alerts: 0,
  notified: new Set(), statusChangedAt: 'T1',
});

const LEAD = '11111111-1111-4111-8111-111111111111';
const CLAIM = { leadId: LEAD, platform: 'exness', amount: 500, acct: 'ACC-9001' };

// ── 1 + 2. First valid submission: one event, one notification ──
test('1+2: a first valid submission produces exactly one event and one alert', () => {
  const s = freshState();
  const r = submit(s, CLAIM);
  assert.equal(r.processed, true);
  assert.equal(s.transitions, 1, 'exactly one state transition');
  assert.equal(s.activity, 1, 'exactly one activity entry');
  assert.equal(s.alerts, 1, 'exactly one admin notification');
});

// ── 3 + 4. Exact replay: no duplicate event, no second alert ────
test('3+4: replaying the same submission adds no event and no second alert', () => {
  const s = freshState();
  submit(s, CLAIM);
  // The real double-call: join.html submits, thankyou.html re-fires on load,
  // then the customer refreshes it three more times.
  for (let i = 0; i < 4; i += 1) {
    const replay = submit(s, CLAIM);
    assert.equal(replay.duplicate, true, 'a repeat of the same claim is a replay');
    assert.equal(replay.processed, false, 'a replay must not be processed');
  }
  assert.equal(s.transitions, 1, 'still exactly one state transition after 4 replays');
  assert.equal(s.activity, 1, 'still exactly one activity entry after 4 replays');
  assert.equal(s.alerts, 1, 'still exactly one admin notification after 4 replays');
  assert.equal(s.ledger.rows.get(submissionKey(LEAD, 'exness', 500, 'ACC-9001')).replay_count, 4,
    'the ledger counts the replays rather than silently discarding them');
});

test('3: the key is stable across the formatting the two pages actually produce', () => {
  // join.html sends the typed string, thankyou.html round-trips it through a
  // URL. "500", "500.00" and " acc-9001 " must not become separate claims.
  const a = submissionKey(LEAD, 'exness', Number('500'), 'ACC-9001');
  const b = submissionKey(LEAD, 'exness', Number('500.00'), ' acc-9001 ');
  assert.equal(a, b, 'decimal formatting and account casing must not split one claim');
});

// ── 5. A genuinely new claim is still processable ───────────────
test('5: a genuinely different deposit claim is still processed', () => {
  const s = freshState();
  submit(s, CLAIM);
  for (const [label, next] of [
    ['a larger second deposit', { ...CLAIM, amount: 1000 }],
    ['a different broker account', { ...CLAIM, acct: 'ACC-7777' }],
    ['a different platform', { ...CLAIM, platform: 'dooprime' }],
    ['a different lead', { ...CLAIM, leadId: '22222222-2222-4222-8222-222222222222' }],
  ]) {
    const before = s.transitions;
    const r = submit(s, next);
    assert.equal(r.processed, true, `${label} must still be processed`);
    assert.equal(s.transitions, before + 1, `${label} must produce its own event`);
  }
  assert.equal(s.activity, 5, 'one activity entry per distinct claim');
});

test('5: a new claim after an approval alerts the admin again', () => {
  const s = freshState();
  submit(s, CLAIM);
  assert.equal(s.alerts, 1);
  // Admin approves, lead converts, the customer later deposits again. The lead
  // re-enters pending_approval, so status_changed_at advances and the alert
  // ledger key is new.
  s.statusChangedAt = 'T2';
  submit(s, { ...CLAIM, amount: 2500 });
  assert.equal(s.alerts, 2, 'a new pending-approval episode must alert again');
});

// ── The gate is wired in the right order in the real source ─────
test('the idempotency claim runs BEFORE any side effect', () => {
  const claimAt   = hook.indexOf('claim_deposit_submission');
  const updateAt  = hook.indexOf('status: "pending_approval"');
  const logAt     = hook.indexOf('communication_logs');
  const notifyAt  = hook.indexOf('await notifyAdminPendingApproval(');
  for (const [name, at] of [['the leads update', updateAt], ['the activity log', logAt], ['the admin alert', notifyAt]]) {
    assert.ok(claimAt > 0 && at > claimAt, `${name} must happen after the idempotency claim, not before it`);
  }
  assert.match(hook, /if \(isFirst !== true\)/, 'a replay must return early rather than falling through');
  assert.match(hook, /duplicate: true/, 'a replay must be reported as a duplicate, not as a fresh submission');
});

test('an invalid or rejected submission never notifies', () => {
  const notifyAt = hook.indexOf('await notifyAdminPendingApproval(');
  for (const rejection of [
    'lead_id or phone required',
    'lead not found',
  ]) {
    const at = hook.indexOf(rejection);
    assert.ok(at > 0 && at < notifyAt, `"${rejection}" must return before the notification is sent`);
  }
  assert.match(hook, /release_deposit_submission/,
    'a claim that could not be completed must be released so the customer can retry');
});

// ── The alert reuses the one existing mechanism ─────────────────
test('the hook reuses notify-admin-pending-approval rather than a second notifier', () => {
  assert.match(hook, /functions\/v1\/notify-admin-pending-approval/,
    'the hook must call the existing notification function');
  assert.doesNotMatch(hook, /graph\.facebook\.com/,
    'the hook must not send WhatsApp itself - that is the notifier function\'s job');
  // Naming the ledger in a comment is fine and useful; writing to it is not.
  assert.doesNotMatch(hook, /\.from\(["']pending_approval_notifications["']\)/,
    'the hook must not write the notification ledger directly - the notifier owns it');
  assert.match(hook, /INTERNAL_SECRET_HEADER/,
    'the hook must authenticate over the repo\'s existing internal-call path');
});

test('the notifier accepts an internal caller without weakening the browser path', () => {
  assert.match(notifier, /verifyInternalRequest/, 'the internal path must use the shared verifier');
  const internalAt = notifier.indexOf('isInternalCaller = true');
  const jwtAt = notifier.indexOf('Not signed in');
  assert.ok(internalAt > 0 && jwtAt > internalAt,
    'the internal check runs first, and the JWT path still rejects an unauthenticated browser');
  assert.match(notifier, /if \(!isInternalCaller\) \{[\s\S]{0,600}?Your account cannot notify for this lead/,
    'the per-user permission check must still guard the browser path');
  assert.match(notifier, /requested_by: user\?\.id \?\? null/,
    'an internal call has no user, so requested_by must be null rather than crashing');
  assert.doesNotMatch(notifier, /requested_by: user\.id/, 'no unguarded user.id may remain');
  // The dedup rule itself must be untouched.
  assert.match(notifier, /\.eq\("status_changed_at", statusChangedAt\)/,
    'the existing (lead_id, status_changed_at) dedup must still be in force');
  assert.match(notifier, /already_notified: true/, 'a duplicate alert must still short-circuit');
});

test('the internal path cannot be reached by simply omitting a JWT', () => {
  assert.match(notifier, /req\.headers\.get\("x-internal-function-secret"\) !== null/,
    'the internal path must be entered only when the header is actually present');
  assert.match(notifier, /if \(!internalAuth\.authorized\) \{[\s\S]{0,200}?return json/,
    'a present but wrong secret must be rejected, never fall through to the user path');
});

// ── The database mechanism is real, atomic and locked down ──────
test('the migration defines a deterministic, service-role-only claim', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.deposit_submissions/);
  assert.match(migration, /submission_key TEXT PRIMARY KEY/,
    'the key must be the primary key - that is what makes the claim atomic');
  assert.match(migration, /ON CONFLICT \(submission_key\) DO UPDATE/);
  assert.match(migration, /RETURNING \(xmax = 0\)/,
    'insert-versus-conflict must be decided by the database, not by a prior read');
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.deposit_submissions FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.deposit_submissions TO service_role/);
  assert.doesNotMatch(migration, /CREATE POLICY/,
    'no client-facing policy - this ledger is service role only');
  // It must not build a competing notification system. Assert on what the
  // migration actually creates, not on the word appearing in a comment.
  const createdTables = [...migration.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(createdTables, ['public.deposit_submissions'],
    'this migration must create exactly one table and never a second notification ledger');
});

test('the dedup is database-backed, not an in-memory cooldown', () => {
  assert.doesNotMatch(hook, /setTimeout|Date\.now\(\) - last|new Map\(\)|new Set\(\)/,
    'no process-local cooldown - an Edge Function may cold start on every request');
  assert.match(hook, /await sb\.rpc\("claim_deposit_submission"/,
    'the claim must be made in the database');
});

// ── 6. pending_approval still shows under Qualified ─────────────
test('6: pending_approval still displays under Qualified', () => {
  assert.match(html, /if \(status === 'qualified' \|\| status === 'pending_approval'\) return 'qualified';/,
    'a lead awaiting approval must still land in the Qualified tier');
  const fnStart = html.indexOf('function computeLeadTier(lead) {');
  assert.ok(fnStart > 0, 'computeLeadTier must still exist');
  const body = html.slice(fnStart, html.indexOf('\n}', fnStart));
  const convertedAt = body.indexOf("if (status === 'converted') return 'closed';");
  const manualAt    = body.indexOf('lead.manual_tier');
  const qualifiedAt = body.indexOf("status === 'pending_approval'");
  assert.ok(convertedAt > -1 && qualifiedAt > -1 && manualAt > -1, 'all three branches must still be present');
  assert.ok(convertedAt < manualAt && convertedAt < qualifiedAt,
    'Converted is still derived from status FIRST, so no manual tier can claim a conversion');
});

// ── 7. Admin approval still converts ───────────────────────────
test('7: admin approval still results in Converted', () => {
  assert.match(html, /document_type', 'deposit_screenshot'[\s\S]{0,400}?Cannot approve - no Deposit Screenshot/,
    'approval must still require a deposit screenshot');
  assert.match(html, /\.update\(\{ status: 'converted', converted_at: new Date\(\)\.toISOString\(\), balance_locked: true \}\)/,
    'approveConversion must still be the path that sets Converted and stamps converted_at');
});

// ── 8. Agents still cannot move a lead into or out of Converted ─
test('8: an agent still cannot move a lead into or out of Converted', () => {
  const guard = read('../supabase/migrations/20260831040000_restrict_converted_to_admins.sql');
  assert.match(guard, /NEW\.status = 'converted' AND old_status IS DISTINCT FROM 'converted'/,
    'moving INTO Converted is still blocked for a non-admin');
  assert.match(guard, /old_status = 'converted' AND NEW\.status IS DISTINCT FROM 'converted'/,
    'moving OUT of Converted is still blocked for a non-admin');
  // The hook must stay on the service role key, which is what exempts it.
  assert.match(hook, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(hook, /status: "converted"/,
    'an unverified form submission still must not declare a conversion');
  assert.match(hook, /status: "pending_approval"/);
  // Nothing in this phase may hand a browser a new way in.
  assert.doesNotMatch(migration, /GRANT[^\n]*TO (anon|authenticated)/,
    'no new client-side grant may be introduced');
});

// ── 9. The approved hierarchy is intact ────────────────────────
test('9: the New / Engaged / Deposit Ready / Qualified / Converted hierarchy is intact', () => {
  for (const [tier, label] of [
    ['new', 'New'], ['warm', 'Engaged'], ['hot', 'Deposit Ready'],
    ['qualified', 'Qualified'], ['closed', 'Converted'],
  ]) {
    assert.ok(html.includes(`data-tier="${tier}"`), `the ${label} tier must still exist in the Inbox`);
  }
  assert.match(html, /if \(lead\?\.manual_tier && lead\.manual_tier !== 'closed'\) return lead\.manual_tier;/,
    "a stored 'closed' must still be ignored so it cannot masquerade as a conversion");
});

// ── 10. Operational filters still work and stay separate ───────
test('10: Unread / Waiting on Us / Needs Human remain separate and still work', () => {
  for (const op of ['unread', 'awaiting', 'needshuman']) {
    assert.ok(html.includes(`data-op="${op}"`), `the ${op} operational chip must still exist`);
  }
  assert.match(html, /op === 'unread'\s*\? el\.dataset\.unread === 'true'[\s\S]{0,240}?needshuman' \? el\.dataset\.needshuman === 'true'/,
    'all three operational filters must still be applied');
  assert.match(html, /\[\.\.\._activeConvOps\]\.every\(op =>/,
    'operational filters must still AND together, narrowing rather than widening');
  assert.match(html, /const show = matchesText && matchesTier && matchesOps && matchesChannel;/,
    'stage and operational state must remain separate axes');
});

// ── The pages that caused the duplication ──────────────────────
test('both pages forward account, so one claim stays one claim', () => {
  assert.match(join, /lead_id: d\.lead_id \|\| '', phone: phone, platform: platform, amount: amount, account: account/,
    'join.html must forward account to the thank-you page');
  assert.match(thankyou, /var account\s*= q\.get\('account'\) \|\| '';/,
    'thankyou.html must read account back');
  assert.match(thankyou, /lead_id: leadId, phone: phone, platform: platform, amount: amount, account: account/,
    'thankyou.html must send account, or its call becomes a different claim');
  assert.match(hook, /if \(acct\) update\.deposit_account_ref = acct;/,
    'an empty account must never overwrite a stored broker reference');
});

test('house style: no em dashes in anything this phase touched', () => {
  for (const [name, text] of [
    ['conversion-hook', hook], ['notify-admin-pending-approval', notifier],
    ['the migration', migration], ['join.html', join], ['thankyou.html', thankyou],
  ]) {
    assert.ok(!text.includes('—'), `${name} must not contain an em dash`);
  }
});
