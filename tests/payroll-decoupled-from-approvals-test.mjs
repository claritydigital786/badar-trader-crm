// Approved deposits reach Reports and AUM, but NOT payroll or commission.
//
// Muhammad's explicit scope decision, 2026-09-01. calculatePayroll() is not a
// preview: it INSERTS a payroll_runs row carrying total_commission, i.e. a
// persisted payable. Before the filter below existed, an approved $500 deposit
// would have flowed straight into it, because the payroll query matched on
// type='deposit' AND currency='USD' in range - which an approval-generated row
// satisfies exactly.
//
// The whole decoupling is one predicate, deposit_document_id IS NULL. This file
// exists so removing it is loud rather than silent, and so the live query and
// the demo branch cannot drift apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const slice = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));

// ── The live payroll query excludes approval-generated rows ────
{
  const q = slice('async function loadPayrollDepositTransactions', 'async function calculatePayroll');
  assert.ok(q.includes(".is('deposit_document_id', null)"),
    'the payroll query must exclude approval-generated transactions');
  assert.ok(q.includes(".eq('type', 'deposit')") && q.includes(".eq('currency', 'USD')"),
    'the existing payroll filters are unchanged');
}

// ── The demo branch mirrors it exactly ─────────────────────────
{
  const c = slice('async function calculatePayroll', 'async function loadPayrollRuns');
  assert.ok(/!t\.deposit_document_id/.test(c),
    'the demo payroll branch must apply the same exclusion, or demo shows a commission production would not pay');
  assert.ok(/t\.type === 'deposit' && t\.currency === 'USD'/.test(c),
    'the demo branch keeps the existing filters too');
}

// ── Reports must still SEE approved deposits ───────────────────
{
  const r = slice('async function loadAllReportTransactions', 'function setElText');
  assert.ok(!/deposit_document_id/.test(r),
    'Reports must NOT exclude approved deposits - they are exactly what it should show');
}

// ── The lead-detail ledger also still shows them ───────────────
{
  const l = slice('async function loadClientTransactions', 'function buildLedgerTab');
  assert.ok(!/deposit_document_id/.test(l),
    'the client ledger must still show approved deposits');
}

// ── Nothing invents a commission rule ──────────────────────────
{
  const mig = readFileSync(new URL('../supabase/migrations/20260901060000_deposit_approval_transaction.sql', import.meta.url), 'utf8');
  // Strip comments: the file explains at length WHY payroll is excluded, and
  // that prose must not be mistaken for code that touches payroll.
  const migCode = mig.replace(/^\s*--.*$/gm, '');
  for (const forbidden of ['commission', 'payroll', 'payable']) {
    assert.ok(!new RegExp(forbidden, 'i').test(migCode),
      `no executable line of the migration may touch ${forbidden} - commission is out of scope for this phase`);
  }
  assert.ok(!/type\s*,?\s*'withdrawal'/.test(mig) && /'deposit'/.test(mig),
    'the RPC creates a deposit and nothing else');
  // Exactly one INSERT, into transactions. No second financial row anywhere.
  assert.equal((mig.match(/INSERT INTO/g) || []).length, 1,
    'the RPC performs exactly one INSERT');
  assert.ok(/INSERT INTO public\.transactions/.test(mig), '...and it is the deposit transaction');
}

// ── The agent's own on-screen estimate is not fed by the ledger ─
{
  const est = slice('async function loadAgentPayrollEstimate', 'async function logActivityStandalone');
  assert.ok(!/transactions/.test(est),
    'the agent payroll estimate must not read the transactions table');
  // It is fed by approvedAum(), which is account_balance of converted leads -
  // a consequence of the approved-AUM phase, not of this ledger work.
  assert.ok(/const revenue = approvedAum\(cachedLeads\);/.test(html),
    'the agent estimate is fed by approvedAum(), unchanged by this phase');
}

console.log('payroll-decoupled-from-approvals: all assertions passed');
