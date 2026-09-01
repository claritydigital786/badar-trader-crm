// AUM counts approved deposits only.
//
// The bug this protects against, found during the Phase 1 deposit-form production
// verification (2026-09-01): conversion-hook writes account_balance = the amount the
// CUSTOMER typed into the deposit form, at submission time, while the lead is still
// only 'pending_approval'. Every AUM figure summed account_balance with no status
// filter, so money nobody had verified appeared in a stat card labelled
// "Approved deposits".
//
// The rule lives inline in index.html like the rest of the CRM, so this lifts the
// pure part out and runs it, then asserts the call sites actually use it - a helper
// nothing calls would pass the first half of this file and still ship the bug.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const start = html.indexOf('function isApprovedDeposit(lead)');
const end   = html.indexOf('function transactionTotalsByCurrency');
assert.ok(start > 0 && end > start, 'The approved-deposit block must exist in index.html.');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);
const { isApprovedDeposit, approvedAum } = sandbox;

const lead = (status, balance, extra = {}) => ({ status, account_balance: balance, ...extra });

// ── A. Submit $500 -> pending -> AUM change = $0 ───────────────
{
  const before = [lead('qualified', 0)];
  // Exactly what conversion-hook writes on a submission: status pending_approval,
  // verified false, and account_balance set to the submitted amount.
  const after = [lead('pending_approval', 500, { verified: false, deposit_amount: 500 })];
  assert.equal(approvedAum(before), 0);
  assert.equal(approvedAum(after), 0, 'A: a pending submission must not move AUM');
  assert.equal(approvedAum(after) - approvedAum(before), 0, 'A: AUM change must be exactly $0');
  // ...and the submitted amount must still be on the row for Ehsan to verify.
  assert.equal(after[0].account_balance, 500, 'A: the submitted amount must NOT be destroyed');
  assert.equal(after[0].deposit_amount, 500, 'A: deposit_amount must still hold the claim');
}

// ── B. Approve that $500 -> AUM change = +$500 ─────────────────
{
  const pending  = [lead('pending_approval', 500)];
  // What approveConversion() writes, and nothing else.
  const approved = [lead('converted', 500, { converted_at: '2026-09-01T00:00:00Z', balance_locked: true })];
  assert.equal(approvedAum(approved) - approvedAum(pending), 500, 'B: approval must add exactly +$500');
}

// ── C. Reject a $500 submission -> AUM change = $0 ─────────────
{
  // There is no 'rejected' lead status in this schema (leads_status_check allows
  // new/contacted/qualified/proposal_sent/pending_approval/converted/lost), so a
  // rejected deposit is a lead that simply never becomes 'converted'. Every shape
  // it can take must contribute 0.
  for (const st of ['new', 'contacted', 'qualified', 'proposal_sent', 'pending_approval', 'lost']) {
    assert.equal(approvedAum([lead(st, 500)]), 0, `C: status='${st}' must contribute $0`);
  }
  // A rejected KYC document does not convert the lead, so the amount stays out.
  assert.equal(approvedAum([lead('pending_approval', 500, { kyc_status: 'rejected' })]), 0,
    'C: a rejected deposit screenshot must contribute $0');
}

// ── D. A replayed submission cannot double-count ───────────────
{
  // conversion-hook is idempotent by content hash, but even if a replay did write
  // twice it writes the SAME row - account_balance is assigned, never incremented -
  // so the aggregate is a sum over rows and cannot double-count one lead.
  const once  = [lead('converted', 500)];
  const again = [lead('converted', 500)]; // same lead re-processed
  assert.equal(approvedAum(once), approvedAum(again), 'D: reprocessing one lead cannot change AUM');
  // Two DISTINCT approved leads are genuinely $1000 - the fix must not over-collapse.
  assert.equal(approvedAum([lead('converted', 500), lead('converted', 500)]), 1000,
    'D: two distinct approved deposits must still total $1000');
}

// ── E. An agent sees only his own approved AUM ─────────────────
{
  // The agent dashboard sums cachedLeads, which RLS and the agent query already
  // scope to that agent. The rule must not leak across that scope, and must strip
  // the pending money out of what is left.
  const mine = [
    lead('converted', 1000, { assigned_agent_id: 'a1' }),
    lead('pending_approval', 5000, { assigned_agent_id: 'a1' }),
    lead('qualified', 250, { assigned_agent_id: 'a1' }),
  ];
  assert.equal(approvedAum(mine), 1000, 'E: agent sees only his own APPROVED total');
}

// ── F. Admin/Super Admin total = sum of approved deposits ──────
{
  const all = [
    lead('converted', 1000, { assigned_agent_id: 'a1' }),
    lead('converted', 2000, { assigned_agent_id: 'a2' }),
    lead('pending_approval', 9999, { assigned_agent_id: 'a1' }),
    lead('lost', 400, { assigned_agent_id: 'a2' }),
    lead('new', 0),
  ];
  const expected = all.filter(l => l.status === 'converted')
                      .reduce((s, l) => s + Number(l.account_balance), 0);
  assert.equal(approvedAum(all), expected);
  assert.equal(approvedAum(all), 3000, 'F: admin total equals the sum of approved deposits in scope');
}

// ── G. Converted counts stay correct and coherent with AUM ─────
{
  const all = [lead('converted', 1000), lead('pending_approval', 500), lead('converted', 0)];
  const convertedCount = all.filter(l => l.status === 'converted').length;
  assert.equal(convertedCount, 2, 'G: Converted count is unchanged by this fix');
  // AUM and the Converted count must key on the same field, or the two cards
  // sitting side by side can disagree about what "converted" means.
  assert.equal(all.filter(isApprovedDeposit).length, convertedCount,
    'G: AUM and the Converted count must agree on what counts as converted');
}

// ── Robustness: nulls, strings, missing fields ─────────────────
{
  assert.equal(approvedAum(null), 0);
  assert.equal(approvedAum([]), 0);
  assert.equal(approvedAum([{}]), 0);
  assert.equal(approvedAum([lead('converted', null)]), 0);
  assert.equal(approvedAum([lead('converted', undefined)]), 0);
  assert.equal(approvedAum([lead('converted', '750')]), 750, 'numeric strings still add up');
  assert.equal(approvedAum([lead('converted', 'abc')]), 0, 'garbage contributes 0, never NaN');
  assert.ok(!Number.isNaN(approvedAum([lead('converted', 'abc'), lead('converted', 10)])));
  assert.equal(isApprovedDeposit(null), false);
  assert.equal(isApprovedDeposit(undefined), false);
}

// ── The rule must not be gated on fields that are dead in production ──
{
  // leads.verified is written false by conversion-hook and set true by NOTHING in
  // this repo; leads.balance_locked is true for no lead in production, because the
  // one real converted lead predates the approval gate. Gating on either would
  // silently zero out real, genuinely-approved money.
  assert.equal(approvedAum([lead('converted', 301, { verified: false, balance_locked: false })]), 301,
    'the one real production converted lead must still count');
}

// ── Call sites: the helper has to actually be used ─────────────
{
  // Agent dashboard.
  assert.ok(/const revenue = approvedAum\(cachedLeads\);/.test(html),
    'the agent dashboard must use approvedAum()');
  // Admin + Super Admin dashboard (Super Admin runs initAdmin(), same view).
  assert.ok(/const revenue = approvedAum\(leads\);/.test(html),
    'the admin dashboard must use approvedAum()');
  // The by-platform deposit breakdown under the admin figure.
  assert.ok(/isApprovedDeposit\(l\)\)\{ bp\[l\.deposit_platform\]/.test(html),
    'the by-platform deposit breakdown must be filtered to approved deposits');
  // And no unfiltered sum may come back.
  const unfiltered = html.match(/reduce\(\((?:s|sum), l\) => \1 \+ \(Number\(l\.account_balance\) \|\| 0\), 0\)/g) || [];
  assert.equal(unfiltered.length, 0,
    'no aggregate may sum account_balance without the approved filter: ' + JSON.stringify(unfiltered));
}

// ── Copy must not promise something the number no longer means ──
{
  assert.ok(html.includes('<div class="stat-trend">Approved deposits only</div>'),
    'the admin dashboard card must say the figure is approved-only');
  assert.ok(!html.includes('in recorded deposits'),
    'the agent payroll estimate must say "approved deposits", not "recorded deposits"');
}

console.log('aum-approved-only: all assertions passed');
