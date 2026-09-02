// The agent-review checkpoint between a customer's deposit submission and
// Ehsan's approval.
//
// The rule: a submission belongs to the assigned agent first. Nothing is
// escalated because a customer pressed submit; only the agent's explicit
// "Send to Admin for Verification" pings an admin, and only an admin's approval
// converts the lead. The checkpoint lives on kyc_documents, not on the lead, so
// the visible hierarchy stays Pending Approval -> Converted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (r) => readFileSync(new URL(r, import.meta.url), 'utf8');
const html      = read('../index.html');
const hook      = read('../supabase/functions/conversion-hook/index.ts');
const migration = read('../supabase/migrations/20260901040000_deposit_agent_review.sql');

// Lift the pure stage rule out of index.html and run it for real.
const start = html.indexOf("const DEPOSIT_DOC_TYPE = 'deposit_screenshot';");
const end   = html.indexOf('async function loadDepositSubmissions');
assert.ok(start > 0 && end > start, 'the deposit workflow block must exist');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);
// `function` declarations attach to the sandbox global, `const` ones do not,
// so the label map has to be read back by evaluating its name in the context.
const depositStage = sandbox.depositStage;
const DEPOSIT_STAGE_LABEL = vm.runInContext('DEPOSIT_STAGE_LABEL', sandbox);

const doc = (o = {}) => ({ status: 'pending', agent_reviewed_at: null, ...o });

// ── A. A customer submission does not notify the admin ─────────
test('A: submitting the form does not notify Ehsan', () => {
  assert.doesNotMatch(hook, /functions\/v1\/notify-admin-pending-approval/,
    'conversion-hook must not call the admin notifier');
  assert.doesNotMatch(hook, /notifyAdminPendingApproval\(/);
  assert.doesNotMatch(hook, /graph\.facebook\.com/);
  // A fresh submission is parked on the agent, not escalated.
  assert.equal(depositStage(doc()), 'awaiting_agent');
  assert.equal(DEPOSIT_STAGE_LABEL.awaiting_agent, 'Review Required');
});

// ── B/C. Scope: only the assigned agent's own submissions ──────
test('B: the agent queue is scoped to the signed-in agent', () => {
  assert.match(html, /loadDepositSubmissions\(\{ agentId: currentUser\?\.id \}\)/,
    'the agent queue must pass its own agent id');
  assert.match(html, /if \(agentId\) rows = rows\.filter\(r => r\.lead\?\.assigned_agent_id === agentId\);/,
    'the loader must filter by assigned_agent_id explicitly');
});
test('C: another agent cannot escalate someone else’s submission', () => {
  // Enforced server-side, because RLS does not scope agents to their own leads
  // (leads: staff update all), so the frontend filter alone is not a control.
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /IF NOT \(public\.is_admin\(\) OR v_assigned = v_uid\) THEN/,
    'the RPC must reject a caller who is neither the assigned agent nor an admin');
  assert.match(migration, /This deposit belongs to another agent\./);
});

// ── D. The agent can never convert ─────────────────────────────
test('D: the agent cannot convert, verify or move AUM', () => {
  // The decision path is admin-gated in the UI...
  assert.match(html, /if \(!isAdminRole\(currentProfile\?\.role\)\) \{ showToast\('Only an admin can decide a deposit\./);
  // ...and the conversion itself still goes through the one canonical path,
  // which the live trg_leads_converted_admin_only trigger gates to admins.
  // The document id is now passed through, so approve_deposit_and_convert() can
  // mark THAT document verified inside the same database transaction that
  // converts the lead - decideDeposit no longer writes it separately.
  assert.match(html, /await approveConversion\(leadId, ctx \|\| '', docId\);/,
    'approval must route through approveConversion(), not a direct status write');
  const guard = read('../supabase/migrations/20260831041000_restrict_converted_to_admins.sql');
  assert.match(guard, /Only an admin can convert a lead/);
  // The escalation RPC never touches leads.status.
  const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.escalate_deposit_to_admin'));
  assert.doesNotMatch(fn, /UPDATE public\.leads/, 'escalation must not write the lead at all');
  assert.doesNotMatch(fn, /'converted'/, 'escalation must not reference the converted status');
});

// ── E/G. Stamp exactly once, ping exactly once ─────────────────
test('E: escalation stamps agent_reviewed_by/at exactly once', () => {
  assert.match(migration, /SET agent_reviewed_by = v_uid,\s*\n\s*agent_reviewed_at = now\(\)/);
  assert.match(migration, /WHERE id = p_document_id\s*\n\s*AND agent_reviewed_at IS NULL;/,
    'the write must be conditional on not already being stamped');
  assert.match(migration, /IF v_already_at IS NOT NULL THEN\s*\n\s*RETURN QUERY SELECT false, true/,
    'an already-escalated document must report already_escalated, not re-stamp');
  assert.match(migration, /FOR UPDATE OF k/, 'the row must be locked to make the check atomic');
});
test('G: a double-click cannot create a second notification', () => {
  // The ping is sent only when the RPC reports it was the call that escalated.
  const esc = html.slice(html.indexOf('async function escalateDepositToAdmin'),
                         html.indexOf('async function notifyAdminsOfDepositEscalation'));
  const alreadyAt = esc.indexOf('already_escalated');
  const notifyAt  = esc.indexOf('notifyAdminsOfDepositEscalation(');
  assert.ok(alreadyAt > 0 && notifyAt > alreadyAt,
    'the already-escalated early return must come before the notification');
  assert.match(esc, /if \(row\?\.already_escalated\) \{[\s\S]*?return renderDepositQueues\(\);/,
    'an already-escalated result must return before notifying');
  assert.match(esc, /btn\.disabled = true/, 'the button must disable while in flight');
});

// ── F. The escalation pings Ehsan through the existing system ──
test('F: escalation notifies admins via the existing notifications table', () => {
  assert.match(html, /kind: 'deposit_review'/);
  assert.match(html, /sb\.from\('notifications'\)\.insert\(rows\)/,
    'must reuse the existing notifications table, not a parallel channel');
  assert.match(html, /const admins = \(cachedProfiles \|\| \[\]\)\.filter\(p => isAdminRole\(p\.role\) && !p\.is_suspended\);/,
    'every active admin (admin and super_admin) is a recipient');
});

// ── Stage machine: the four states and their labels ────────────
test('the stage rule maps every state correctly', () => {
  assert.equal(depositStage(doc()), 'awaiting_agent');
  assert.equal(depositStage(doc({ agent_reviewed_at: '2026-09-01T00:00:00Z' })), 'awaiting_admin');
  assert.equal(depositStage(doc({ status: 'verified' })), 'approved');
  assert.equal(depositStage(doc({ status: 'rejected' })), 'returned');
  // A returned document goes back to the agent, not to the admin queue.
  assert.equal(depositStage(doc({ status: 'rejected', agent_reviewed_at: '2026-09-01T00:00:00Z' })), 'returned');
  assert.equal(DEPOSIT_STAGE_LABEL.awaiting_admin, 'Awaiting Admin Approval');
  assert.equal(DEPOSIT_STAGE_LABEL.approved, 'Approved');
  assert.equal(DEPOSIT_STAGE_LABEL.returned, 'Returned - Action Required');
});

// ── H. Approval converts exactly once, through one path ────────
test('H: approval converts once, via the existing conversion path', () => {
  const dec = html.slice(html.indexOf('async function decideDeposit'),
                         html.indexOf('async function notifyAgentOfDepositDecision'));
  assert.equal((dec.match(/approveConversion\(/g) || []).length, 1,
    'exactly one conversion call');
  assert.match(dec, /if \(decision === 'verified'\) \{/);
  assert.doesNotMatch(dec, /status: 'converted'/,
    'decideDeposit must never write the converted status itself');
});

// ── I/J/K/L. AUM only moves on admin approval ──────────────────
test('I-L: AUM keys on the lead status, so only approval moves it', () => {
  // The AUM rule is unchanged by this phase and still gates on 'converted'.
  assert.match(html, /function isApprovedDeposit\(lead\) \{\s*\n\s*return \(lead && lead\.status\) === 'converted';/);
  const s2 = html.indexOf('function isApprovedDeposit');
  const e2 = html.indexOf('function transactionTotalsByCurrency');
  const box = { }; vm.createContext(box); vm.runInContext(html.slice(s2, e2), box);
  const { approvedAum } = box;
  const lead = (status, bal) => ({ status, account_balance: bal });
  // I: pending submission
  assert.equal(approvedAum([lead('pending_approval', 500)]), 0);
  // J: agent-reviewed but not admin-approved - the lead status has not moved
  assert.equal(approvedAum([lead('pending_approval', 500)]), 0);
  // K: approved, exactly once
  assert.equal(approvedAum([lead('converted', 500)]), 500);
  assert.equal(approvedAum([lead('converted', 500), lead('converted', 500)]), 1000);
  // L: returned/rejected
  for (const st of ['new','contacted','qualified','proposal_sent','pending_approval','lost']) {
    assert.equal(approvedAum([lead(st, 500)]), 0);
  }
});

// ── O. Nothing historical is rewritten ─────────────────────────
test('O: the migration is additive and rewrites no history', () => {
  const exec = migration.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const bad of [/\bDROP\s+(TABLE|COLUMN|POLICY|CONSTRAINT|INDEX)/i, /\bTRUNCATE\b/i,
                     /\bDELETE\s+FROM\b/i, /ALTER\s+COLUMN/i, /\bRENAME\b/i,
                     /UPDATE\s+public\.leads/i, /UPDATE\s+public\.kyc_documents\s+SET\s+status/i]) {
    assert.doesNotMatch(exec, bad, `migration must not contain ${bad}`);
  }
  assert.match(exec, /ADD COLUMN IF NOT EXISTS agent_reviewed_by uuid/);
  assert.match(exec, /ADD COLUMN IF NOT EXISTS agent_reviewed_at timestamptz/);
  // Both nullable, so no existing row is touched or needs a backfill.
  const addCols = exec.split('\n').filter(l => /ADD COLUMN IF NOT EXISTS agent_reviewed_/.test(l));
  assert.equal(addCols.length, 2, 'exactly two columns are added');
  for (const line of addCols) {
    assert.doesNotMatch(line, /\bNOT NULL\b/, 'the new columns must be nullable: ' + line.trim());
    assert.doesNotMatch(line, /\bDEFAULT\b/, 'no default, so no existing row is rewritten: ' + line.trim());
  }
  // The existing admin-review columns keep their meaning.
  // The lookbehind matters: agent_reviewed_by legitimately ends in reviewed_by.
  assert.doesNotMatch(exec, /(?<!agent_)reviewed_by\s+(uuid|timestamptz)/,
    'must not redefine the existing reviewed_by column');
  assert.doesNotMatch(exec, /(?<!agent_)reviewed_at\s+(uuid|timestamptz)/,
    'must not redefine the existing reviewed_at column');
});

// ── P. Phase 1 form and upload survive untouched ───────────────
test('P: the Phase 1 form, upload and idempotency are untouched', () => {
  for (const k of ['deposit-screenshots', 'kyc_documents', 'EMAIL_RE', 'ALLOWED_IMAGE_TYPES',
                   'image/heic', 'image/heif', 'MAX_FILE_BYTES', 'claim_deposit_submission',
                   'release_deposit_submission']) {
    assert.ok(hook.includes(k), `conversion-hook must still handle ${k}`);
  }
  const join = read('../join.html');
  for (const k of ['screenshot', 'email', 'account', 'amount', 'platform']) {
    assert.ok(join.includes(k), `join.html must still collect ${k}`);
  }
});

// ── Q. No regression in the existing aggregates ────────────────
test('Q: existing aggregates still route through approvedAum', () => {
  // The admin and agent revenue aggregates moved into SQL on 2026-09-04
  // (dashboard_summary / agent_summary) so the browser stops downloading whole
  // tables to add numbers up. Same converted-only rule, asserted where it lives.
  const agentSql = readFileSync(new URL('../supabase/migrations/20260904020000_agent_summary_rpc.sql', import.meta.url), 'utf8');
  const dashSql  = readFileSync(new URL('../supabase/migrations/20260904000000_dashboard_summary_rpc.sql', import.meta.url), 'utf8');
  for (const [name, sql] of [['agent_summary', agentSql], ['dashboard_summary', dashSql]]) {
    assert.match(sql, /sum\(account_balance\)\s*filter\s*\(where status = 'converted'\)/,
      `${name} must aggregate approved (converted) deposits only`);
  }
  // approvedAum() itself must still exist and still gate on 'converted' - demo
  // mode and every remaining JS call site depend on it.
  assert.match(html, /function approvedAum\(leads\)/);
  assert.match(html, /return \(lead && lead\.status\) === 'converted';/);
  assert.match(agentSql, /wa_channel is distinct from '6541' or created_at < timestamptz '2026-09-02T00:00:00Z'/,
    'the agent aggregate still applies the production-subset rule perfLeads used to');
  assert.match(dashSql, /coalesce\(sum\(account_balance\) filter \(where status = 'converted'\), 0\) as approved_aum/,
    'the admin dashboard aggregate keeps the converted-only rule');
  const unfiltered = html.match(/reduce\(\((?:s|sum), l\) => \1 \+ \(Number\(l\.account_balance\) \|\| 0\), 0\)/g) || [];
  assert.equal(unfiltered.length, 0, 'no unfiltered account_balance aggregate may return');
});

// ── House style ────────────────────────────────────────────────
test('no em dashes in anything this phase touched', () => {
  // One carve-out, and only one: the business owner approved the WhatsApp
  // number hierarchy tags on 2026-09-02 as exact strings, and both contain an
  // em dash. Reproducing them verbatim was the explicit instruction, so the
  // rule is enforced everywhere except those two constants - which are pinned
  // here by their full text, so nothing else can drift in behind them.
  const APPROVED_TAGS = [
    '\u{1F7E2} LIVE • PRIMARY • PAKISTAN — +92 371 5773903',
    '\u{1F9EA} TEST ONLY • BOT TESTING • UAE — +971 52 558 6541',
  ];
  const withoutApproved = t => APPROVED_TAGS.reduce(
    (acc, tag) => acc.split(tag.replace('\u{1F7E2} ', '\\u{1F7E2} ').replace('\u{1F9EA} ', '\\u{1F9EA} ')).join(''), t);
  for (const [n, t] of [['index.html', withoutApproved(html)], ['conversion-hook', hook], ['migration', migration]]) {
    assert.ok(!t.includes('—'), `${n} must not contain an em dash`);
  }
  // The tags themselves are present, exactly as approved.
  const tagLines = html.split('\n').filter(l => l.includes('—'));
  assert.equal(tagLines.length, 2, 'exactly two em dashes remain, both in the approved tags');
  assert.ok(tagLines.every(l => /WA_TAG_FULL|'3903':|'6541':/.test(l)),
    'both em dashes live in the approved WA_TAG_FULL constants and nowhere else');
});

// ── Approval must tell the agent too, not just the return ──────
test('the agent is notified on approval as well as on return', () => {
  assert.match(html, /kind: 'deposit_approved'/, 'an approval must notify the assigned agent');
  assert.match(html, /kind: 'deposit_returned'/, 'a return must notify the assigned agent');
  const fn = html.slice(html.indexOf('async function notifyAgentOfDepositDecision'),
                        html.indexOf('async function notifyAgentOfDepositDecision') + 1800);
  assert.match(fn, /if \(agentId === currentUser\?\.id\) return;/,
    'an admin deciding their own lead must not notify themselves');
  const dec = html.slice(html.indexOf('async function decideDeposit'),
                         html.indexOf('async function notifyAgentOfDepositDecision'));
  assert.match(dec, /notifyAgentOfDepositDecision\(leadId, 'approved'\)/);
  assert.match(dec, /notifyAgentOfDepositDecision\(leadId, 'returned', note\)/);
});

// ── An admin who still carries leads gets an agent surface ─────
test('an admin who still works leads reviews his own submissions', () => {
  // Ehsan is admin AND carries assigned leads (7742ba2). Without this his own
  // customers' submissions would sit at Review Required with nobody looking.
  assert.match(html, /id="admin-own-deposit-queue"/);
  assert.match(html, /loadDepositSubmissions\(\{ agentId: currentUser\?\.id \}\)[\s\S]{0,400}?admin-own-deposit-count/,
    'the admin own-review panel must be scoped to that admin as an agent');
  assert.match(html, /if \(ownWrap\) ownWrap\.style\.display = pendingOwn\.length \? '' : 'none';/,
    'the panel must hide for an admin who carries no leads');
});

// ── K: a returned submission must be re-sendable ───────────────
test('K: a returned deposit can be corrected and sent again', () => {
  const fix = readFileSync(new URL('../supabase/migrations/20260901050000_deposit_resend_after_return.sql', import.meta.url), 'utf8');
  assert.match(fix, /IF v_status = 'verified' THEN/, 'an approved deposit stays closed');
  assert.match(fix, /IF v_status NOT IN \('pending', 'rejected'\) THEN/);
  assert.match(fix, /IF v_status = 'pending' AND v_already_at IS NOT NULL THEN/,
    'only a pending document can be "already escalated"; a returned one always re-stamps');
  assert.match(fix, /status = 'pending'/, 'a returned document re-enters the admin queue');
  assert.match(fix, /AND \(status = 'rejected' OR agent_reviewed_at IS NULL\)/);
  // No schema or data change in the corrective migration.
  const exec = fix.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const bad of [/\bDROP\s+(TABLE|COLUMN|POLICY)/i, /\bDELETE\s+FROM\b/i, /ALTER\s+COLUMN/i, /ALTER\s+TABLE/i]) {
    assert.doesNotMatch(exec, bad);
  }
  // The demo path must mirror it, or demo drifts from production again.
  assert.match(html, /if \(d && d\.status !== 'verified' && \(d\.status === 'rejected' \|\| !d\.agent_reviewed_at\)\)/);
});

// ── A personalized join link must tie the submission to that lead ──
test('join.html carries lead_id from the URL into the POST', () => {
  const join = readFileSync(new URL('../join.html', import.meta.url), 'utf8');
  // Read once from the query string.
  assert.match(join, /var LEAD_ID = \(new URLSearchParams\(location\.search\)\.get\('lead_id'\) \|\| ''\)\.trim\(\);/,
    'lead_id must be read from the URL');
  // Appended only when present, so a plain visit posts exactly what it always did.
  assert.match(join, /if \(LEAD_ID\) fd\.append\('lead_id', LEAD_ID\);/,
    'lead_id must be appended to the FormData only when present');
  // The original fields are untouched and still in order.
  assert.match(join, /fd\.append\('name', name\); fd\.append\('phone', phone\); fd\.append\('email', email\);/);
  assert.match(join, /fd\.append\('platform', platform\); fd\.append\('amount', amount\); fd\.append\('account', account\);/);
  assert.match(join, /fd\.append\('screenshot', file\);/);
  // Carried to thankyou.html so its follow-up call is the SAME claim and still
  // de-duplicates rather than re-matching on phone.
  assert.match(join, /lead_id: d\.lead_id \|\| LEAD_ID \|\| ''/);
  // Validation, upload and the endpoint are untouched.
  assert.match(join, /if \(!file\) \{ err\.textContent = 'Please add your deposit screenshot\.'; return; \}/);
  assert.match(join, /functions\/v1\/conversion-hook/);
});
