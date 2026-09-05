// The customer's claimed amount must never become the ledger amount on its own.
// See supabase/migrations/20260908000000_verified_deposit_amount.sql, written
// after USD 60,037 was approved from a form field on 2026-09-05 when the real
// deposit was USD 637.16.
//
// The dialog logic is EXECUTED against the shipped source, not pattern-matched,
// so "Approve stays disabled until a human types an amount" is proven by asking
// the real code rather than by a regex that could match a comment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (r) => readFileSync(new URL(r, import.meta.url), 'utf8');
const html = read('../index.html');
const mig  = read('../supabase/migrations/20260908000000_verified_deposit_amount.sql');
const stripSql = (s) => s.replace(/^\s*--.*$/gm, '');
const stripJs  = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const sql = stripSql(mig);

const dlg = stripJs(html.slice(
  html.indexOf('const DEPOSIT_HIGH_VALUE_FALLBACK'),
  html.indexOf('async function approveConversion')));
const fn = stripJs(html.slice(
  html.indexOf('async function approveConversion'),
  html.indexOf('async function rejectConversion')));

test('A: the verified amount input starts BLANK and is never pre-filled', () => {
  const input = dlg.match(/<input id="dep-verified-amount"[^>]*>/);
  assert.ok(input, 'the input must exist');
  assert.doesNotMatch(input[0], /\bvalue\s*=/, 'a value attribute would be a pre-fill');
  assert.doesNotMatch(input[0], /claimed|deposit_amount/, 'it must not be seeded from the claim');
  assert.match(input[0], /placeholder="Type what the screenshot shows"/);
});

test('B: Approve is disabled until a valid amount is typed', () => {
  assert.match(dlg, /id="dep-approve-go"[^>]*disabled/, 'it must ship disabled');
  assert.match(dlg, /if \(input\.value\.trim\(\) === '' \|\| !Number\.isFinite\(v\) \|\| v <= 0\) return false;/);
});

test('C: the readiness rule, executed - blank, zero, mismatch and high value all block', () => {
  // Rebuild the exact predicate from the shipped source and run it.
  const body = dlg.slice(dlg.indexOf('const ready = () => {'));
  const src = body.slice(0, body.indexOf('\n    };') + 7)
    .replace('const ready = () => {', 'function ready(input, hasClaim, claimNum, mismatchAck, threshold, highAck) {')
    .replace(/\n    };$/, '\n}');
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const R = (val, o = {}) => sb.ready({ value: val },
    o.hasClaim ?? true, o.claimNum ?? 900, o.mismatchAck ?? false, o.threshold ?? 10000, o.highAck ?? false);

  assert.equal(R(''),        false, 'blank must block');
  assert.equal(R('   '),     false, 'whitespace must block');
  assert.equal(R('0'),       false, 'zero must block');
  assert.equal(R('-5'),      false, 'negative must block');
  assert.equal(R('abc'),     false, 'non-numeric must block');
  assert.equal(R('900'),     true,  'matching the claim is approvable');
  assert.equal(R('637.16'),  false, 'a mismatch blocks until acknowledged');
  assert.equal(R('637.16', { mismatchAck: true }), true, 'acknowledged mismatch is approvable');
  assert.equal(R('60037', { mismatchAck: true }), false, 'high value blocks even when the mismatch is acknowledged');
  assert.equal(R('60037', { mismatchAck: true, highAck: true }), true, 'both acknowledged is approvable');
  // The exact defect: claim 60037, admin blindly accepts it. No mismatch, but
  // the high-value gate still forces a deliberate second look.
  assert.equal(R('60037', { claimNum: 60037 }), false, 'a large matching claim still needs the high-value check');
});

test('D: the claim never reaches the ledger through the browser', () => {
  assert.match(fn, /const approved = verdict\.amount;/);
  assert.doesNotMatch(fn, /const approved = Number\(freshLead\.deposit_amount\)/);
  assert.match(fn, /p_verified_amount: approved/);
  assert.match(fn, /p_confirm_mismatch: verdict\.confirmMismatch/);
  assert.match(fn, /if \(!verdict\) return false;/);
});

test('E: the server refuses a missing, zero or negative verified amount', () => {
  assert.match(sql, /IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN\s*\n\s*RAISE EXCEPTION 'Enter the deposit amount shown on the screenshot before approving\.'/);
});

test('F: the server refuses an unconfirmed mismatch - the browser is not the gate', () => {
  assert.match(sql, /IF v_claimed IS NOT NULL AND p_verified_amount <> v_claimed AND NOT p_confirm_mismatch THEN\s*\n\s*RAISE EXCEPTION/);
});

test('G: the old one-argument approval can no longer approve anything', () => {
  const oneArg = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.approve_deposit_and_convert(p_document_id uuid)'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.approve_deposit_and_convert(\n  p_document_id      uuid,'));
  assert.ok(oneArg.length > 0, 'the compatibility stub must exist');
  assert.match(oneArg, /RAISE EXCEPTION 'Approval now requires a verified deposit amount/);
  for (const forbidden of [/UPDATE public\.leads/, /INSERT INTO public\.transactions/, /status\s*=\s*'converted'/]) {
    assert.doesNotMatch(oneArg, forbidden, 'the stub must write nothing at all');
  }
});

test('H: every financial write uses the verified amount, never the claim', () => {
  const body = sql.slice(sql.indexOf('p_confirm_mismatch boolean DEFAULT false'));
  assert.match(body, /account_balance\s*=\s*p_verified_amount/);
  assert.match(body, /verified_deposit_amount\s*=\s*p_verified_amount/);
  assert.match(body, /VALUES\s*\n\s*\(v_lead, 'deposit', p_verified_amount, 'USD'/);
  // v_claimed may only be READ for comparison and audit - never assigned to money.
  assert.doesNotMatch(body, /account_balance\s*=\s*v_claimed/);
  assert.doesNotMatch(body, /'deposit', v_claimed/);
});

test('I: the backfill takes verified from the LEDGER and the claim only from proof', () => {
  assert.match(sql, /SET verified_deposit_amount = t\.amount[\s\S]{0,400}?transactions t ON t\.deposit_document_id = k\.id/);
  // The claim is sourced from deposit_submissions and nowhere else.
  // Comments are stripped from `sql`, so the boundary has to be real code -
  // anchoring on a comment silently ran this slice to end of file and matched
  // the RPC's own COALESCE(l.claimed_deposit_amount, l.deposit_amount).
  const claimFill = sql.slice(sql.indexOf('SET claimed_deposit_amount = ('),
                              sql.indexOf('UPDATE public.kyc_documents k'));
  assert.match(claimFill, /FROM public\.deposit_submissions ds/);
  assert.doesNotMatch(claimFill, /l\.deposit_amount/,
    'copying leads.deposit_amount would invent a claim that was never made');
  assert.match(claimFill, /ORDER BY ds\.first_seen_at\s*\n?\s*LIMIT 1/, 'the earliest submission is the original claim');
  // Unprovable claims stay NULL: the UPDATE only touches rows that HAVE proof.
  assert.match(claimFill, /AND EXISTS \(\s*\n\s*SELECT 1 FROM public\.deposit_submissions ds/);
});

test('J: an agent can never set the financial amount', () => {
  assert.match(sql, /IF NOT public\.is_admin\(\) THEN\s*\n\s*RAISE EXCEPTION 'Only an admin can approve a deposit\.'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.approve_deposit_and_convert\(uuid, numeric, boolean\) FROM PUBLIC, anon/);
  // No agent-facing surface offers an amount box.
  const rowStart = html.indexOf('function depositRowHtml(');
  const rowEnd   = html.indexOf('async function renderDepositQueues');
  const row = html.slice(rowStart, rowEnd);
  assert.doesNotMatch(row, /dep-verified-amount/, 'the amount input must not appear on an agent card');
});

test('K: the audit keeps claimed, verified, approver and timestamp permanently', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS claimed_amount_at_approval\s+numeric/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS verified_amount_at_approval numeric/);
  assert.match(sql, /claimed_amount_at_approval\s*=\s*v_claimed/);
  assert.match(sql, /verified_amount_at_approval = p_verified_amount/);
  assert.match(sql, /reviewed_by\s*=\s*v_uid/);
  assert.match(sql, /reviewed_at\s*=\s*now\(\)/);
  assert.match(sql, /INSERT INTO public\.lead_activity[\s\S]{0,400}?'Deposit approved\. Customer claimed '/);
});

test('L: the high-value threshold is configurable, not hard-coded', () => {
  assert.match(sql, /INSERT INTO public\.settings \(key, value\)\s*\nVALUES \('deposit_high_value_threshold', '10000'\)/);
  assert.match(dlg, /from\('settings'\)\.select\('value'\)\.eq\('key', 'deposit_high_value_threshold'\)/);
  assert.match(dlg, /DEPOSIT_HIGH_VALUE_FALLBACK/, 'a missing setting must not disable the warning');
});

test('M: existing approved deposits stay compatible - nothing unrelated is touched', () => {
  for (const forbidden of [/payroll/i, /whatsapp/i, /wa_channel/, /communications/,
                           /assigned_agent_id\s*=/, /converted_at\s*=\s*NULL/i, /DROP TABLE/i, /DELETE FROM/i]) {
    assert.doesNotMatch(sql, forbidden, `the migration must not touch ${forbidden}`);
  }
  // converted_at is only ever set on a NEW conversion, never rewritten.
  assert.equal((sql.match(/converted_at\s*=\s*now\(\)/g) || []).length, 1);
});

test('N: the card shows a claim as a claim and money as money', () => {
  const rowStart = html.indexOf('function depositRowHtml(');
  const row = html.slice(rowStart, html.indexOf('async function renderDepositQueues'));
  assert.match(row, /stage === 'approved' \? 'Verified Amount' : 'Customer Claimed'/);
  assert.match(row, /stage === 'approved' \? \(lead\.verified_deposit_amount \?\? lead\.account_balance\) : null/);
});
