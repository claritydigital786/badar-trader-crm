// The full-table-fetch architecture must not come back.
//
// Production symptom, 2026-09-03: after Cmd+R the Super Admin Dashboard showed
// "Loading... - -" for 8-10 seconds. Cause was not slow SQL - the queries ran
// in 3-11 ms. It was that bootstrap awaited the ENTIRE leads table before any
// KPI could paint (loadAdminLeads, select('*'), 7,701 rows / 8.8 MB of JSON,
// paged 1,000 at a time), and then renderDashboardStats() read the whole table
// a SECOND time (fetchAllLeadsForDashboard, 1.1 MB) to compute eight integers
// and a sum. ~9.9 MB and two full scans to render numbers.
//
// These assertions are about SHAPE, not speed: they fail if any screen goes
// back to downloading a table to count it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migDir = new URL('../supabase/migrations/', import.meta.url);
const read = frag => readFileSync(new URL(
  readdirSync(migDir).find(f => f.includes(frag)), migDir), 'utf8');
const dashSql  = read('dashboard_summary_rpc');
const agentSql = read('agent_summary_rpc');
const idxSql   = read('performance_indexes');

const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));
// Comments in this file explain at length what was REMOVED, so a naive substring
// search finds the old function names in prose. Strip comments before asserting
// on code, or these tests fail on their own documentation.
const stripJs  = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripSql = t => t.replace(/^\s*--.*$/gm, '');

// ── Bootstrap ──────────────────────────────────────────────────
test('admin bootstrap does not download the leads table', () => {
  const init = stripJs(block('async function initAdmin()', 'function navCaretIdFor'));
  assert.ok(!/loadAdminLeads\(\)/.test(init),
    'initAdmin must not load All Leads - that screen is lazy now');
  assert.match(init, /await Promise\.all\(\[loadProfiles\(\), loadGeneralSettings\(\)\]\)/,
    'independent bootstrap fetches must run concurrently, not as sequential awaits');
});

test('agent bootstrap does not download every assigned lead', () => {
  const init = stripJs(block('async function initAgent()', 'async function loadAgentSummary'));
  assert.ok(!/loadAgentLeads\(\)/.test(init),
    'initAgent must not load My Leads - 1,412 rows / 1.6 MB for the largest caseload');
  assert.match(init, /loadAgentSummary\(\)/, 'it must use the SQL aggregate instead');
});

test('the dashboard full-table fetcher is gone, not merely unused', () => {
  assert.ok(!/async function fetchAllLeadsForDashboard/.test(html),
    'fetchAllLeadsForDashboard() must not exist - a dead full-table reader invites reuse');
});

// ── Aggregates live in SQL ─────────────────────────────────────
test('dashboard KPIs are computed in SQL and returned as one small object', () => {
  assert.match(html, /sb\.rpc\('dashboard_summary'/, 'the Dashboard must call the RPC');
  assert.match(dashSql, /returns jsonb/, 'and it must return an aggregate, not rows');
  assert.ok(!/select \* from leads/i.test(dashSql), 'the RPC must never select whole lead rows');
  // At most 30 pre-grouped daily counts, never one row per lead.
  assert.match(dashSql, /interval '29 days'/, 'the trend must be grouped to 30 days in SQL');
  assert.ok(!/slice\(0, 10\) === key/.test(stripJs(html)),
    'no 30-day trend may be rebuilt by scanning lead objects in the browser');
  assert.match(agentSql, /interval '29 days'/,
    "the agent's own 30-day trend must be grouped in SQL too");
  // Exactly two trend charts exist (admin + agent) and BOTH must read a
  // pre-grouped map rather than scanning rows.
  assert.equal((stripJs(html).match(/dayCounts\.push\(Number\(trend\[key\]\)/g) || []).length, 1,
    "the agent trend must read the SQL-grouped map");
  assert.equal((stripJs(html).match(/dayCounts\.push\(Number\(trendCounts\[key\]\)/g) || []).length, 1,
    'the admin trend must read the SQL-grouped map');
  assert.equal((stripJs(html).match(/dayCounts\.push\(/g) || []).length, 2,
    'and no third trend chart may appear that scans leads');
});

test('agent KPIs are computed in SQL, scoped by RLS', () => {
  assert.match(html, /sb\.rpc\('agent_summary'\)/);
  assert.match(agentSql, /security invoker/i,
    'agent_summary must inherit leads RLS rather than re-implement scoping');
  assert.match(agentSql, /assigned_agent_id = auth\.uid\(\)/);
});

// ── Lists are paginated server-side ────────────────────────────
test('All Leads fetches one page, not the whole filtered set', () => {
  const page = block('async function loadLeadsPage()', 'function renderLeadsPager');
  assert.match(page, /\.range\(from, from \+ LEADS_PAGE_SIZE - 1\)/,
    'the page fetch must be windowed in Postgres');
  assert.match(page, /buildLeadsQuery\(f, \{ withCount: true \}\)/,
    'and must get its total from the same request, not a second round trip');
  assert.ok(!/fetchAllRows\(buildQuery\)/.test(html),
    'loadAdminLeads must no longer page through the entire filtered table');
});

test('Agent My Leads fetches one page too', () => {
  const page = block('async function loadAgentLeadsPage()', 'function renderAgentLeadsPager');
  assert.match(page, /\.range\(from, from \+ LEADS_PAGE_SIZE - 1\)/);
  assert.match(page, /count: 'exact'/);
  assert.ok(!/from\('leads'\)\.select\('\*'\)\.order\('created_at', \{ ascending: false \}\);/.test(html),
    "the agent's unbounded select('*') must be gone");
});

test('agent search runs in Postgres, so it can find leads off the current page', () => {
  const page = block('async function loadAgentLeadsPage()', 'function renderAgentLeadsPager');
  assert.match(page, /q\.or\(buildLeadSearchOr\(term\)\)/,
    'client-side search over a page would silently miss matching leads');
});

test('Comm Log is bounded rather than downloading every message', () => {
  const load = block('async function loadCommLog(', 'function commLogMoreHtml');
  assert.match(load, /\.limit\(_commLogLimit\)/, 'both communication tables must be bounded');
  assert.equal((load.match(/\.limit\(_commLogLimit\)/g) || []).length, 2);
  assert.ok(!/fetchAllRows\(\(\) => sb\.from\('communications'\)/.test(html),
    'the 16,010-row / 3.5 MB full read must be gone');
  assert.match(html, /function loadMoreCommLog/, 'older entries must stay reachable on request');
});

// ── The screens that genuinely need everything say why ─────────
test('the remaining full reads are on-demand and narrow', () => {
  // Payroll must see every lead - but on click, and only the columns it reads.
  const pay = block('async function fetchPayrollLeads()', 'async function calculatePayroll');
  assert.match(pay, /select\('id, assigned_agent_id, status, converted_at, created_at'\)/,
    'payroll must not select(*) - it reads five columns');
  // CSV export is the user explicitly asking for every matching row.
  assert.match(html, /async function exportLeadsCSV\(\)[\s\S]{0,900}fetchAllRows\(\(\) => buildLeadsQuery\(f\)\)/,
    'export must reuse the table query so the CSV matches the visible filters');
});

// ── Loading states ─────────────────────────────────────────────
test('a failed or in-flight refresh never blanks working values', () => {
  assert.match(html, /function setDashStat\(id, value\) \{[\s\S]{0,220}value !== null && value !== undefined/,
    'setDashStat must ignore missing values rather than writing an empty string');
  assert.match(html, /if \(!sum\) return;\s*\/\/ fetch failed: leave the last good numbers on screen/,
    'a failed summary fetch must leave the previous figures on screen');
  assert.match(html, /if \(error\) \{ console\.error\('loadLeadsPage:', error\.message\); return; \}/,
    'a failed page fetch must leave the current rows rendered');
});

// ── Indexes ────────────────────────────────────────────────────
test('the measured indexes exist and are the composite ones', () => {
  for (const ix of [
    /idx_leads_created_at_id\s+on public\.leads \(created_at desc, id\)/,
    /idx_leads_agent_created_at\s+on public\.leads \(assigned_agent_id, created_at desc\)/,
    /idx_communications_lead_created_at\s+on public\.communications \(lead_id, created_at\)/,
  ]) assert.match(idxSql, ix);
  assert.match(idxSql, /create index if not exists/i, 'must be safe to re-run');
});

// ── Nothing business-facing moved ──────────────────────────────
test('this change alters no business rule', () => {
  // The three rules most at risk from an aggregation rewrite.
  assert.match(dashSql,  /wa_channel is distinct from '6541' or l\.created_at < v_cutover/);
  assert.match(agentSql, /wa_channel is distinct from '6541' or created_at < timestamptz '2026-09-02T00:00:00Z'/);
  for (const sql of [dashSql, agentSql]) {
    assert.match(sql, /filter \(where status = 'converted'\)/, 'AUM stays converted-only');
  }
  for (const sql of [dashSql, agentSql, idxSql]) {
    for (const forbidden of ['approve_deposit_and_convert', 'payroll', 'BOT_REPLIES_ENABLED',
                             'verify_jwt', 'phone_number_id', 'drop policy', 'service_role']) {
      assert.ok(!stripSql(sql).toLowerCase().includes(forbidden.toLowerCase()),
        `performance migrations must not touch ${forbidden}`);
    }
  }
  // Realtime must still be published - the previous fix must not be undone.
  const rt = read('realtime_publication_communications');
  assert.match(rt, /add table public\.communications/i);
});
