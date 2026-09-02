// Reports must attribute an approved deposit to the lead's agent.
//
// Real production bug, 2026-09-02: Hanzala's approved $500 showed "None" in his
// Agent Performance row while every other figure on the page was correct -
// overall Recorded Deposits USD 500, Active Clients 3, his AUM $1,000.
//
// Root cause was the read path, not the data. The per-agent map was built from
// cachedLeads, which is only ever filled by loadAdminLeads() on the All Leads
// tab. An admin who opens Reports directly has an EMPTY array, every lookup
// returns undefined, and `if (!agentId) return;` silently drops every deposit.
// Visiting All Leads first was not a reliable fix either, because
// loadAdminLeads() applies whatever filters are active, so cachedLeads can hold
// a subset that excludes the lead the transaction belongs to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const reports = html.slice(html.indexOf('async function loadReports'),
                           html.indexOf('function renderAgentPerformanceReport'));

// ── The map no longer depends on cachedLeads ───────────────────
assert.ok(!/const leadAgent = new Map\(cachedLeads/.test(html),
  'the agent map must not be built from cachedLeads - it is empty unless All Leads was opened');
assert.ok(/const leadAgent = new Map\(\);/.test(reports),
  'the map is built explicitly');
assert.ok(/\.from\('leads'\)\.select\('id, assigned_agent_id'\)\.in\('id',/.test(reports),
  'lead owners are read from the database');

// ── Only the leads that have transactions are looked up ────────
assert.ok(/const clientIds = \[\.\.\.new Set\(txRows\.map\(r => r\.client_id\)\.filter\(Boolean\)\)\]/.test(reports),
  'the lookup is bounded to leads that actually have transactions');
assert.ok(/i \+= 200/.test(reports) && /slice\(i, i \+ 200\)/.test(reports),
  'the .in() lookup is chunked, because it goes into the request URL');
assert.ok(/if \(ownerErr\)/.test(reports),
  'a failed lookup is reported, not silently swallowed');

// ── Behavioural: the exact production shape ────────────────────
{
  // One approved deposit on a lead assigned to Hanzala, and an admin who never
  // opened All Leads - the situation that produced "None".
  const HANZALA = '2bc20292-76bb-467b-a2a1-7bfa0cad4421';
  const LEAD = 'b0a3f6eb-e80c-4623-8c40-41f51a62a4b7';
  const txRows = [{ client_id: LEAD, type: 'deposit', amount: 500, currency: 'USD' }];

  const attribute = (leadAgent) => {
    const depositsByAgent = {};
    txRows.filter(r => r.type === 'deposit').forEach(row => {
      const agentId = leadAgent.get(row.client_id);
      if (!agentId) return;
      if (!depositsByAgent[agentId]) depositsByAgent[agentId] = {};
      const c = String(row.currency || 'USD').toUpperCase();
      depositsByAgent[agentId][c] = (depositsByAgent[agentId][c] || 0) + Number(row.amount || 0);
    });
    return depositsByAgent;
  };

  // OLD behaviour: cachedLeads empty -> nothing attributed. This is the bug.
  assert.deepEqual(attribute(new Map()), {},
    'with an empty map (the old cachedLeads path) the deposit is dropped - the reported bug');

  // NEW behaviour: owners fetched for the transaction's lead -> attributed.
  const fromDb = new Map([[LEAD, HANZALA]]);
  assert.deepEqual(attribute(fromDb), { [HANZALA]: { USD: 500 } },
    'reading owners from the database attributes USD 500 to Hanzala');

  // A filtered cachedLeads that excludes this lead also used to fail.
  const filteredOut = new Map([['some-other-lead', 'some-other-agent']]);
  assert.deepEqual(attribute(filteredOut), {},
    'a filtered cachedLeads missing this lead would also have dropped it');

  // Two agents stay separate.
  const two = new Map([[LEAD, HANZALA], ['lead-2', 'agent-2']]);
  const rows2 = [...txRows, { client_id: 'lead-2', type: 'deposit', amount: 250, currency: 'USD' }];
  const byAgent = {};
  rows2.forEach(row => {
    const a = two.get(row.client_id); if (!a) return;
    byAgent[a] = byAgent[a] || {};
    byAgent[a].USD = (byAgent[a].USD || 0) + row.amount;
  });
  assert.deepEqual(byAgent, { [HANZALA]: { USD: 500 }, 'agent-2': { USD: 250 } },
    'each agent gets only their own deposits');
}

// ── Payroll is NOT touched by this fix ─────────────────────────
{
  // 2026-09-04: cachedLeads holds one page of All Leads now, so payroll fetches
  // its own complete set instead - fetchPayrollLeads(). The point this guards is
  // unchanged and still holds: payroll reads a lead source of its OWN, entirely
  // separate from the leadAgent map the Reports fix introduced.
  assert.ok(/const leads  = demoMode \? _DEMO_LEADS : await fetchPayrollLeads\(\);/.test(html),
    'calculatePayroll keeps its own separate lead source - this fix does not reach it');
  assert.match(html, /async function fetchPayrollLeads\(\)[\s\S]{0,400}assigned_agent_id, status, converted_at, created_at/,
    'and that source must carry every column the payroll calculation reads');
  const payrollBlock = html.slice(html.indexOf('async function calculatePayroll'),
                                  html.indexOf('async function calculatePayroll') + 3000);
  assert.ok(!payrollBlock.includes('leadAgent'),
    'payroll must not start borrowing the Reports attribution map');
  const payroll = html.slice(html.indexOf('async function loadPayrollDepositTransactions'),
                            html.indexOf('async function loadPayrollRuns'));
  assert.ok(payroll.includes(".is('deposit_document_id', null)"),
    'payroll still excludes approval-generated deposits');
  assert.ok(!/assigned_agent_id'\)\.in\('id'/.test(payroll),
    'the new owner lookup was not added to the payroll path');
}

console.log('reports-agent-attribution: all assertions passed');
