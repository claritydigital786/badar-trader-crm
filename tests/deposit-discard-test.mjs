// An agent can remove a mistaken deposit verification from their own dashboard
// without anything financial happening, and cannot remove one that already is
// financial. See supabase/migrations/20260907000000_deposit_discard_and_withdraw.sql.
//
// The stage rules below are EXECUTED, not pattern-matched: the real functions
// are lifted out of index.html and run, so "an approved deposit is not
// discardable" is proven by asking the shipped code rather than by a regex that
// happens to match a comment.
//
// The database half of this was proven separately against production inside a
// transaction that was rolled back - see tests/sql/deposit_discard_test.sql,
// which is the file that was run and the results are recorded in that header.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../index.html');
const mig  = read('../supabase/migrations/20260907000000_deposit_discard_and_withdraw.sql');

// Comments explain intent and are full of the very words being asserted on.
// Strip them so every match below is against code.
const stripJs  = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const stripSql = (s) => s.replace(/^\s*--.*$/gm, '');
const migCode  = stripSql(mig);

// ── the stage rules, executed ──────────────────────────────────
const start = html.indexOf("const DEPOSIT_DOC_TYPE = 'deposit_screenshot';");
const end   = html.indexOf('async function loadDepositSubmissions');
assert.ok(start > 0 && end > start, 'the deposit workflow block must exist');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);

const dupStart = html.indexOf('function depositDuplicateCounts(rows) {');
const dupEnd   = html.indexOf('async function renderDepositQueues');
assert.ok(dupStart > 0 && dupEnd > dupStart, 'the duplicate counter and the card renderer must exist');
// depositRowHtml is a pure string builder over these four helpers, so it can be
// run for real rather than pattern-matched. The stubs are the shipped
// behaviour: esc() escapes, fmtMoney() formats, cachedProfiles resolves names.
sandbox.esc = (v) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
sandbox.fmtMoney = (n) => Number(n).toFixed(2);
sandbox.cachedProfiles = [{ id: 'agent-1', full_name: 'Farwa Qazi' }];
vm.runInContext(html.slice(dupStart, dupEnd), sandbox);

const { depositStage, canDiscardDeposit, canWithdrawDeposit, depositDuplicateCounts } = sandbox;
const REASONS = vm.runInContext('DEPOSIT_CANCEL_REASONS', sandbox);
const LABELS  = vm.runInContext('DEPOSIT_STAGE_LABEL', sandbox);

const doc = (o = {}) => ({ status: 'pending', agent_reviewed_at: null, ...o });
const review    = doc();
const awaiting  = doc({ agent_reviewed_at: '2026-09-05T10:00:00Z' });
const returned  = doc({ status: 'rejected' });
const approved  = doc({ status: 'verified', agent_reviewed_at: '2026-09-05T10:00:00Z' });
// A discarded row KEEPS its agent stamp, which is exactly the case that would
// read back as "still waiting on the admin" if the status check came second.
const discarded = doc({ status: 'cancelled', agent_reviewed_at: '2026-09-05T10:00:00Z' });

test('A: a discarded submission is its own stage, not a returned or pending one', () => {
  assert.equal(depositStage(discarded), 'cancelled');
  assert.equal(LABELS.cancelled, 'Discarded');
  // The four pre-existing stages are untouched.
  assert.equal(depositStage(review), 'awaiting_agent');
  assert.equal(depositStage(awaiting), 'awaiting_admin');
  assert.equal(depositStage(returned), 'returned');
  assert.equal(depositStage(approved), 'approved');
});

test('B: discard is offered for Review Required and Returned, and nothing else', () => {
  assert.equal(canDiscardDeposit(review), true);
  assert.equal(canDiscardDeposit(returned), true);
  assert.equal(canDiscardDeposit(awaiting), false, 'awaiting admin is a withdrawal, not a discard');
  assert.equal(canDiscardDeposit(approved), false);
  assert.equal(canDiscardDeposit(discarded), false, 'an already-discarded row offers nothing');
});

test('C: withdraw is offered ONLY while it is waiting on the admin', () => {
  assert.equal(canWithdrawDeposit(awaiting), true);
  assert.equal(canWithdrawDeposit(review), false);
  assert.equal(canWithdrawDeposit(returned), false);
  assert.equal(canWithdrawDeposit(approved), false);
  assert.equal(canWithdrawDeposit(discarded), false);
});

test('D: an APPROVED deposit can never be discarded or withdrawn - the whole point', () => {
  assert.equal(canDiscardDeposit(approved), false);
  assert.equal(canWithdrawDeposit(approved), false);
  // And the database refuses it regardless of what the UI offers.
  assert.match(migCode, /IF v_status = 'verified' THEN\s*\n\s*RAISE EXCEPTION 'This deposit is already approved/);
});

test('E: the reason codes in the browser are exactly the ones the CHECK allows', () => {
  // REASONS lives in the vm realm, so its Array is not this realm's Array and
  // deepStrictEqual would reject it on prototype alone. Compare the values.
  const uiCodes = Array.from(REASONS, r => r[0]).sort();
  const check = migCode.match(/kyc_documents_cancellation_reason_check[\s\S]*?IN\s*\(([^)]*)\)/);
  assert.ok(check, 'the reason CHECK constraint must exist');
  const sqlCodes = check[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).sort();
  assert.deepEqual([...uiCodes], [...sqlCodes],
    'a reason offered in the modal that the constraint rejects is a dead button');
  // The five the request asked for, by name.
  assert.deepEqual([...uiCodes],
    ['customer_requested', 'duplicate', 'other', 'wrong_details', 'wrong_screenshot']);
  // And the RPC validates against the same list rather than trusting the caller.
  assert.match(migCode, /v_reason NOT IN \('duplicate','wrong_screenshot','wrong_details','customer_requested','other'\)/);
});

test('F: the status CHECK is WIDENED - every existing value still passes', () => {
  const m = migCode.match(/ADD CONSTRAINT kyc_documents_status_check\s*\n?\s*CHECK \(status IN \(([^)]*)\)\)/);
  assert.ok(m, 'the widened status constraint must exist');
  const set = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
  for (const existing of ['pending', 'verified', 'rejected']) {
    assert.ok(set.includes(existing), `${existing} must survive - 52 live rows depend on it`);
  }
  assert.ok(set.includes('cancelled'));
  assert.equal(set.length, 4, 'exactly one value added');
});

test('G: nothing is physically deleted, anywhere', () => {
  assert.doesNotMatch(migCode, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migCode, /DROP\s+(TABLE|COLUMN)\b/i);
  // The RPC only ever writes 'cancelled', and only from an agent-controlled state.
  assert.match(migCode, /SET status\s*=\s*'cancelled'/);
  assert.match(migCode, /WHERE id = p_document_id\s*\n\s*AND status IN \('pending','rejected'\)/);
});

test('H: who / when / why / from-where are all recorded', () => {
  for (const col of ['cancelled_by', 'cancelled_at', 'cancellation_reason',
                     'cancellation_note', 'cancelled_from_stage']) {
    assert.match(migCode, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`), `${col} must be added`);
    assert.match(migCode, new RegExp(`${col}\\s*=`), `${col} must actually be written`);
  }
  assert.match(migCode, /cancelled_by uuid REFERENCES public\.profiles\(id\)/);
});

test('I: an audit activity entry is written for every discard and withdrawal', () => {
  assert.match(migCode, /INSERT INTO public\.lead_activity \(lead_id, actor_id, channel, summary\)/);
  assert.match(migCode, /'Withdrew deposit verification from admin review'/);
  assert.match(migCode, /'Discarded deposit verification'/);
  // The audit row is written on the success path only - after the UPDATE and
  // after the not-found early return, never on a refusal.
  const updateAt = migCode.indexOf("SET status               = 'cancelled'");
  const auditAt  = migCode.indexOf('INSERT INTO public.lead_activity');
  const notFound = migCode.indexOf('IF NOT FOUND THEN');
  assert.ok(updateAt > 0 && notFound > updateAt && auditAt > notFound,
    'the audit entry must come after the write actually landed');
});

test('J: authorization is re-checked server-side, not trusted from the browser', () => {
  assert.match(migCode, /SECURITY DEFINER/);
  assert.match(migCode, /IF NOT public\.is_active_staff\(\) THEN/);
  assert.match(migCode, /IF NOT \(public\.is_admin\(\) OR v_assigned = v_uid\) THEN\s*\n\s*RAISE EXCEPTION 'This deposit belongs to another agent\.'/);
  assert.match(migCode, /REVOKE ALL ON FUNCTION public\.cancel_deposit_submission\(uuid, text, text\) FROM PUBLIC, anon/);
  assert.match(migCode, /GRANT EXECUTE ON FUNCTION public\.cancel_deposit_submission\(uuid, text, text\) TO authenticated/);
  // No new UPDATE policy on kyc_documents - agents still cannot write it directly.
  assert.doesNotMatch(migCode, /CREATE POLICY/i);
  assert.doesNotMatch(migCode, /ALTER TABLE public\.kyc_documents\s+ENABLE ROW LEVEL/i);
});

test('K: a discarded row cannot be turned back into an approval by any path', () => {
  assert.match(migCode, /CREATE TRIGGER trg_guard_kyc_cancelled_is_final\s*\n\s*BEFORE UPDATE ON public\.kyc_documents/);
  assert.match(migCode, /IF NEW\.status = 'verified' THEN\s*\n\s*RAISE EXCEPTION 'A discarded deposit submission cannot be approved/);
  // Restoring one is an admin-only act, and still cannot jump straight to approved.
  assert.match(migCode, /IF NOT public\.is_admin\(\) THEN\s*\n\s*RAISE EXCEPTION 'Only an admin can restore a discarded deposit submission\.'/);
});

test('L: the approval, ledger, AUM, payroll and Sheet paths are not touched', () => {
  for (const forbidden of [
    /approve_deposit_and_convert/, /CREATE OR REPLACE FUNCTION public\.escalate_deposit_to_admin/,
    /public\.transactions/, /account_balance/, /balance_locked/, /payroll/,
    /converted_lead_sheet_sync/, /enqueue_converted_lead_sheet_sync/,
    /assigned_agent_id\s*=/, /UPDATE public\.leads/,
  ]) {
    assert.doesNotMatch(migCode, forbidden, `the migration must not touch ${forbidden}`);
  }
});

// ── the dashboard ──────────────────────────────────────────────
test('M: a discarded submission leaves both active queues', () => {
  // The agent queue is built from an explicit stage allow-list, so a new stage
  // is excluded by construction rather than by a filter someone has to remember.
  const agentFilter = /\['awaiting_agent','awaiting_admin','returned'\]\.includes\(depositStage\(d\)\)/;
  assert.match(html, agentFilter);
  assert.doesNotMatch(html, /\[[^\]]*'cancelled'[^\]]*\]\.includes\(depositStage\(d\)\)/,
    'no queue may list cancelled as an open stage');
  // The admin queue is filtered in the database, on status='pending'.
  assert.match(html, /escalatedOnly\) q = q\.not\('agent_reviewed_at', 'is', null\)\.eq\('status', 'pending'\)/);
});

test('N: the buttons appear only on the agent side, and only for the right stages', () => {
  const rowStart = html.indexOf('function depositRowHtml(');
  const rowEnd   = html.indexOf('async function renderDepositQueues');
  assert.ok(rowStart > 0 && rowEnd > rowStart);
  const row = stripJs(html.slice(rowStart, rowEnd));

  assert.match(row, /!forAdmin && canDiscardDeposit\(d\)[\s\S]{0,200}Discard Verification/);
  assert.match(row, /!forAdmin && canWithdrawDeposit\(d\)[\s\S]{0,200}Withdraw from Admin/);
  // The admin decision row keeps Approve / Return to Agent and gains nothing.
  const adminBranch = row.slice(row.indexOf('forAdmin && stage === '));
  assert.doesNotMatch(adminBranch.slice(0, adminBranch.indexOf('!forAdmin')),
    /Discard Verification|Withdraw from Admin/);
  // Every offer of either button is gated on !forAdmin.
  for (const label of ['Discard Verification', 'Withdraw from Admin']) {
    const idx = row.indexOf(label);
    assert.ok(row.slice(Math.max(0, idx - 260), idx).includes('!forAdmin'),
      `${label} must never render in the admin queue`);
  }
});

test('O: the confirmation modal asks for a reason and cannot be skipped', () => {
  const dlgStart = html.indexOf('function openDepositDiscardDialog(');
  const dlgEnd   = html.indexOf('// Admin decision.');
  assert.ok(dlgStart > 0 && dlgEnd > dlgStart);
  const dlg = stripJs(html.slice(dlgStart, dlgEnd));
  assert.match(dlg, /id="dep-discard-reason"/);
  assert.match(dlg, /DEPOSIT_CANCEL_REASONS\.map/, 'the options must come from the shared list');
  assert.match(dlg, /reason === 'other' && !note/, '"Other" must require an explanation');
  assert.match(dlg, /sb\.rpc\('cancel_deposit_submission', \{/);
  assert.match(dlg, /p_document_id: target\.docId, p_reason: reason, p_note: note \|\| null/);
  // The browser never writes the row itself.
  assert.doesNotMatch(dlg, /from\('kyc_documents'\)\s*\.\s*(update|delete)/);
  assert.doesNotMatch(dlg, /\.delete\(\)/);
});

test('P: the duplicate hint counts open verifications per lead and blocks nothing', () => {
  const rows = [
    { id: 'a', client_id: 'lead-1' },
    { id: 'b', client_id: 'lead-1' },
    { id: 'c', client_id: 'lead-2' },
  ];
  const counts = depositDuplicateCounts(rows);
  assert.equal(counts['lead-1'], 2);
  assert.equal(counts['lead-2'], 1);
  // A null-prototype map on purpose: a lead id of "constructor" must not
  // inherit a truthy count. So compare keys, not object identity.
  assert.deepEqual(Object.keys(depositDuplicateCounts([])), []);
  assert.deepEqual(Object.keys(depositDuplicateCounts(null)), []);
  assert.equal(depositDuplicateCounts([{ id: 'x', client_id: 'constructor' }])['constructor'], 1);
  // It is a hint only: nothing anywhere auto-discards or auto-rejects on it.
  const rowStart = html.indexOf('function depositRowHtml(');
  const rowEnd   = html.indexOf('async function renderDepositQueues');
  const row = html.slice(rowStart, rowEnd);
  assert.match(row, /dupCount > 1 \?/);
  assert.match(row, /Possible duplicate/);
  assert.doesNotMatch(row, /dupCount[^\n]*cancel_deposit_submission/);
});

test('Q: the KYC tab keeps the history and refuses to resurrect a discarded row', () => {
  const kycStart = html.indexOf('function buildKycTab(');
  const kycEnd   = html.indexOf('async function viewDepositScreenshot');
  assert.ok(kycStart > 0 && kycEnd > kycStart);
  const kyc = stripJs(html.slice(kycStart, kycEnd));
  assert.match(kyc, /d\.status === 'cancelled' \? '<span[^']*Discarded - kept for audit/);
  // Verify / Reject only exist on the non-cancelled branch.
  const verifyIdx = kyc.indexOf("reviewKycDocument('${d.id}','verified'");
  const guardIdx  = kyc.indexOf("d.status === 'cancelled' ? '<span");
  assert.ok(guardIdx > 0 && verifyIdx > guardIdx, 'the guard must come before the Verify button');
  assert.match(kyc, /depositCancelReasonLabel\(d\.cancellation_reason\)/);
  assert.match(kyc, /staffDisplayName\(d\.cancelled_by\)/);
  assert.match(kyc, /d\.cancelled_at/);
});

test('R: the discarded badge reads as neutral history, not as an action item', () => {
  assert.match(html, /\.badge-cancelled\s*\{[^}]*\}/);
  assert.match(html, /cancelled:'Discarded'/);
});

// ── the card itself, rendered ──────────────────────────────────
const card = (d, forAdmin, dup) => sandbox.depositRowHtml(
  { id: 'doc-1', client_id: 'lead-1', file_path: 'lead-1/x.png', uploaded_at: '2026-09-05T09:00:00Z',
    lead: { id: 'lead-1', full_name: 'Omar Farooq', email: 'o@example.com', phone: '+92 300 1',
            assigned_agent_id: 'agent-1', deposit_platform: 'exness', deposit_amount: 500,
            deposit_account_ref: 'EX-1', status: 'pending_approval' },
    ...d }, forAdmin, dup);

test('S: the rendered card offers exactly the right action for each stage', () => {
  const atReview   = card({ status: 'pending', agent_reviewed_at: null }, false);
  const atAdmin    = card({ status: 'pending', agent_reviewed_at: '2026-09-05T10:00:00Z' }, false);
  const atReturned = card({ status: 'rejected', agent_reviewed_at: null }, false);
  const atApproved = card({ status: 'verified', agent_reviewed_at: '2026-09-05T10:00:00Z' }, false);
  const adminQueue = card({ status: 'pending', agent_reviewed_at: '2026-09-05T10:00:00Z' }, true);

  assert.ok(atReview.includes('Discard Verification'));
  assert.ok(!atReview.includes('Withdraw from Admin'));

  assert.ok(atReturned.includes('Discard Verification'));
  assert.ok(!atReturned.includes('Withdraw from Admin'));

  assert.ok(atAdmin.includes('Withdraw from Admin'), 'the escalated card offers a withdrawal');
  assert.ok(!atAdmin.includes('Discard Verification'), 'and calls it a withdrawal, not a discard');

  // The one that matters most.
  assert.ok(!atApproved.includes('Discard Verification'));
  assert.ok(!atApproved.includes('Withdraw from Admin'));
  assert.ok(atApproved.includes('Approved'));

  // The admin queue is unchanged: Approve / Return to Agent, nothing removed,
  // nothing added.
  assert.ok(adminQueue.includes('Approve') && adminQueue.includes('Return to Agent'));
  assert.ok(!adminQueue.includes('Discard Verification'));
  assert.ok(!adminQueue.includes('Withdraw from Admin'));

  // Every action carries the document id it acts on.
  assert.ok(atReview.includes("openDepositDiscardDialog('doc-1','discard')"));
  assert.ok(atAdmin.includes("openDepositDiscardDialog('doc-1','withdraw')"));
});

test('T: the duplicate hint shows only when there really is more than one', () => {
  const one = card({ status: 'pending', agent_reviewed_at: null }, false, 1);
  const two = card({ status: 'pending', agent_reviewed_at: null }, false, 2);
  const none = card({ status: 'pending', agent_reviewed_at: null }, false, undefined);
  assert.ok(!one.includes('Possible duplicate'));
  assert.ok(!none.includes('Possible duplicate'), 'the admin queue passes no count and must show nothing');
  assert.ok(two.includes('Possible duplicate'));
  assert.ok(two.includes('2 open verifications'));
  // It warns, it does not decide.
  assert.ok(two.includes('a customer can legitimately deposit twice'));
  assert.ok(two.includes('Discard Verification'), 'the hint never removes the normal actions');
});

test('U: a discarded card would render no action at all, if one ever reached the queue', () => {
  const gone = card({ status: 'cancelled', agent_reviewed_at: '2026-09-05T10:00:00Z' }, false);
  assert.ok(!gone.includes('Discard Verification'));
  assert.ok(!gone.includes('Withdraw from Admin'));
  assert.ok(!gone.includes('Send to Admin for Verification'));
  assert.ok(gone.includes('Discarded'));
});
