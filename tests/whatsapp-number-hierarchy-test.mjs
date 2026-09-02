// The approved WhatsApp number hierarchy (business owner, 2026-09-02).
//
//   +92 371 5773903  = the ONLY live primary production number.
//   +971 52 558 6541 = a bot-testing number, and nothing else.
//
// Two separate things are asserted here and must never be conflated:
//
//   1. STAFF-FACING LABELLING - every surface says which number is which, in
//      the exact approved wording, with the full number never abbreviated.
//   2. PRODUCTION KPIs - bot-test traffic does not inflate business figures,
//      WITHOUT retroactively relabelling the 201 genuine customer leads that
//      arrived on 6541 while 6541 was the live line.
//
// It also asserts what did NOT change: no bot routing, no credentials, no
// phone-number IDs, and nothing in the deposit/payroll workflow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Comments describe intent; only executable code is evidence.
const code = html.replace(/^\s*\/\/.*$/gm, '');

const LIVE = '+92 371 5773903';
const TEST = '+971 52 558 6541';

// ── 1. The tags resolve, at runtime, to the exact approved strings ─
const tagCtx = vm.createContext({});
vm.runInContext(
  html.slice(html.indexOf('const WA_NUMBERS = {'), html.indexOf('function waChannelTag')) +
  '\nglobalThis.WA_TAG_FULL = WA_TAG_FULL;' +
  '\nglobalThis.WA_TAG_COMPACT = WA_TAG_COMPACT;' +
  '\nglobalThis.WA_TAG_UNTAGGED = WA_TAG_UNTAGGED;' +
  '\nglobalThis.WA_NUMBERS = WA_NUMBERS;', tagCtx);
{
  assert.equal(tagCtx.WA_TAG_FULL['3903'], '\u{1F7E2} LIVE • PRIMARY • PAKISTAN — +92 371 5773903',
    'the full-size LIVE tag must be the exact approved string');
  assert.equal(tagCtx.WA_TAG_FULL['6541'], '\u{1F9EA} TEST ONLY • BOT TESTING • UAE — +971 52 558 6541',
    'the full-size TEST tag must be the exact approved string');
  assert.equal(tagCtx.WA_TAG_COMPACT['3903'], '\u{1F7E2} LIVE · +92 371 5773903',
    'the compact LIVE tag must be the exact approved string');
  assert.equal(tagCtx.WA_TAG_COMPACT['6541'], '\u{1F9EA} TEST · +971 52 558 6541',
    'the compact TEST tag must be the exact approved string');
  assert.equal(tagCtx.WA_NUMBERS['3903'].role, 'live', '3903 is the live role');
  assert.equal(tagCtx.WA_NUMBERS['6541'].role, 'test', '6541 is the test role');
}

// ── 2. No surface abbreviates a number to bare 3903 / 6541 ────────
{
  // Every staff-visible label must carry the whole number. Bare digits are
  // still fine as data values (wa_channel, routing keys, element ids).
  const labels = [...html.matchAll(/<span class="wa-chan-opt-name">([^<]*)<\/span>/g)]
    .map(m => m[1]);
  assert.equal(labels.length, 6, 'three pills (All / LIVE / TEST) in each of the two inboxes');
  const numbered = labels.filter(l => !l.includes('All Numbers'));
  assert.equal(numbered.length, 4, 'two per-number pills in each of the two inboxes');
  for (const l of numbered) {
    assert.ok(l.includes(LIVE) || l.includes(TEST),
      `inbox pill "${l}" must carry the full number, not an abbreviation`);
  }
  assert.equal(numbered.filter(l => l === tagCtx.WA_TAG_COMPACT['3903']).length, 2,
    'both inboxes use the identical approved compact LIVE tag');
  assert.equal(numbered.filter(l => l === tagCtx.WA_TAG_COMPACT['6541']).length, 2,
    'both inboxes use the identical approved compact TEST tag');
  assert.ok(!/UAE · 6541|Pakistan · 3903/.test(html),
    'the obsolete country-only pill wording must be gone');
}

// ── 3. Both inboxes list LIVE first, and keep TEST inspectable ────
for (const scope of ['', 'agent-']) {
  const menu = html.slice(html.indexOf(`id="${scope}wa-chan-menu"`));
  const first = menu.indexOf("data-channel=\"3903\"");
  const second = menu.indexOf("data-channel=\"6541\"");
  assert.ok(first > -1 && second > -1, `both channels present in the ${scope || 'admin'} inbox`);
  assert.ok(first < second, `the live number is listed first in the ${scope || 'admin'} inbox`);
}
assert.ok(/data-channel="6541"/.test(html),
  'the test channel stays selectable - developers and admins must still be able to inspect 6541 conversations');

// ── 4. Obsolete primary/secondary terminology is gone ─────────────
{
  assert.ok(!/Main line, full bot/.test(html), '"Main line, full bot" for 6541 is business-obsolete');
  assert.ok(!/label: '3903', sub: 'Ingest only'/.test(html), '"Ingest only" as 3903\'s whole description is business-obsolete');
  const connect = html.slice(html.indexOf('const CONNECT_WA_NUMBERS'), html.indexOf('function openAddWaNumberForm'));
  assert.ok(/Business LIVE PRIMARY number/.test(connect), '3903 is described as the business live primary number');
  assert.ok(/Business TEST-ONLY number/.test(connect), '6541 is described as the business test-only number');
  // Business role and technical bot state are stated separately, per the brief.
  assert.ok(/[Aa]utomated bot replies not enabled yet/.test(connect),
    "3903's row says the business role without claiming the bot runs on it");
  assert.ok(/the line the automated bot runs on/.test(connect),
    "6541's row states the current technical bot state honestly");
  // Live-primary first on the page.
  assert.ok(connect.indexOf("channel: '3903'") < connect.indexOf("channel: '6541'"),
    'Connect WhatsApp lists the live primary number first');
}

// ── 5. Routing keys and credentials are untouched ─────────────────
{
  const connect = html.slice(html.indexOf('const CONNECT_WA_NUMBERS'), html.indexOf('function openAddWaNumberForm'));
  assert.ok(/key: 'primary'/.test(connect) && /key: '3903'/.test(connect),
    "the Edge Function routing keys ('primary', '3903') are unchanged - renaming them would change runtime behaviour");
  // Nothing in this change may introduce a phone-number id, token or secret.
  const before = readFileSync(new URL('./fixtures/hierarchy-baseline.json', import.meta.url), 'utf8');
  const baseline = JSON.parse(before);
  for (const [name, count] of Object.entries(baseline.unchangedTokenCounts)) {
    const n = (code.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.equal(n, count, `${name} occurrences must be unchanged (bot routing/credentials are out of scope)`);
  }
}

// ── 6. The production-KPI rule: role AND date, never role alone ───
const ctx = vm.createContext({ console });
{
  const start = code.indexOf('const BOT_TEST_CUTOVER =');
  const end = code.indexOf('const PRODUCTION_LEADS_OR_FILTER');
  assert.ok(start > -1 && end > start, 'the cutover rule block exists');
  vm.runInContext(code.slice(start, code.indexOf(';', end + 200) + 1) +
    '\nglobalThis.isBotTestLead = isBotTestLead; globalThis.productionLeads = productionLeads;' +
    '\nglobalThis.BOT_TEST_CUTOVER = BOT_TEST_CUTOVER;' +
    '\nglobalThis.PRODUCTION_LEADS_OR_FILTER = PRODUCTION_LEADS_OR_FILTER;', ctx);

  assert.equal(ctx.BOT_TEST_CUTOVER, '2026-09-02T00:00:00Z',
    'the cutover is the day the business decision was made');

  // The real production shape. These are the actual counts in the live
  // database on 2026-09-02, so this test fails loudly if the rule is ever
  // widened into a blanket wa_channel exclusion.
  const untagged = { wa_channel: null, created_at: '2026-07-15T00:00:00Z', status: 'new' };
  const oldLive  = { wa_channel: '3903', created_at: '2026-08-28T00:00:00Z', status: 'new' };
  const genuine6541 = { wa_channel: '6541', created_at: '2026-08-12T00:00:00Z', status: 'qualified' };
  const lateGenuine = { wa_channel: '6541', created_at: '2026-08-31T08:39:02Z', status: 'new' };
  const botTest  = { wa_channel: '6541', created_at: '2026-09-02T09:00:00Z', status: 'new' };

  assert.equal(ctx.isBotTestLead(untagged), false, 'a historical untagged lead is production, never test');
  assert.equal(ctx.isBotTestLead(oldLive), false, 'a 3903 lead is production');
  assert.equal(ctx.isBotTestLead(genuine6541), false,
    'a 6541 lead from when 6541 WAS the live line is a genuine customer, not test traffic');
  assert.equal(ctx.isBotTestLead(lateGenuine), false,
    'the two real 2026-08-31 Meta customers on 6541 stay production');
  assert.equal(ctx.isBotTestLead(botTest), true,
    'a 6541 lead created after the cutover is bot-test traffic');

  const all = [untagged, oldLive, genuine6541, lateGenuine, botTest];
  assert.equal(ctx.productionLeads(all).length, 4, 'exactly one of these five is excluded');
  assert.equal(ctx.productionLeads(all).filter(l => l.status === 'qualified').length, 1,
    'the qualified 6541 lead is still counted - a blanket exclusion would have dropped it');

  // Nothing is mutated or reclassified: same objects, same wa_channel values.
  const kept = ctx.productionLeads(all);
  assert.ok(kept.every((l, i) => l === all[i]), 'the filter returns the original objects untouched');
  assert.deepEqual(all.map(l => l.wa_channel), [null, '3903', '6541', '6541', '6541'],
    'no lead is relabelled by the production filter');

  // Malformed input must never be silently treated as test traffic, and must
  // never be undefined/NULL either - the SQL side of this rule filters with
  // `WHERE NOT is_bot_test_lead(...)`, where a NULL DROPS the row instead of
  // keeping it. That defect was real and was caught against production data on
  // 2026-09-02; these pin both halves of the rule to a strict boolean.
  assert.equal(ctx.isBotTestLead(null), false, 'a null lead is not test traffic');
  assert.equal(ctx.isBotTestLead({ wa_channel: '6541', created_at: 'not-a-date' }), false,
    'an unparseable date fails closed to production, not to test');
  assert.equal(ctx.isBotTestLead({ wa_channel: null, created_at: '2026-09-05T00:00:00Z' }), false,
    'an UNTAGGED lead created after the cutover is production - the NULL-propagation bug');
  for (const ch of [null, undefined, '3903', '6541', 'other']) {
    for (const d of [null, undefined, '2026-07-01T00:00:00Z', '2026-09-02T00:00:00Z', 'junk']) {
      assert.equal(typeof ctx.isBotTestLead({ wa_channel: ch, created_at: d }), 'boolean',
        `isBotTestLead must return a strict boolean for (${ch}, ${d})`);
    }
  }

  // The PostgREST filter is De Morgan of the same predicate.
  assert.equal(ctx.PRODUCTION_LEADS_OR_FILTER,
    'wa_channel.is.null,wa_channel.neq.6541,created_at.lt.2026-09-02T00:00:00Z',
    'the server-side filter mirrors isBotTestLead() exactly');
}

// ── 7. Every KPI read path actually applies the rule ──────────────
{
  // 2026-09-04: the Dashboard no longer downloads leads to filter them in JS -
  // dashboard_summary() applies the cutover rule in SQL. Assert it there, which
  // is stronger: the rule can no longer be bypassed by a client-side call site.
  const dashSql = readFileSync(new URL('../supabase/migrations/20260904000000_dashboard_summary_rpc.sql', import.meta.url), 'utf8');
  const agentSql = readFileSync(new URL('../supabase/migrations/20260904020000_agent_summary_rpc.sql', import.meta.url), 'utf8');
  for (const [name, sql] of [['dashboard_summary', dashSql], ['agent_summary', agentSql]]) {
    assert.match(sql, /wa_channel is distinct from '6541'/,
      `${name} must apply the 6541 bot-test rule`);
    assert.match(sql, /2026-09-02T00:00:00Z/,
      `${name} must anchor that rule to the approved cutover date`);
    assert.match(sql, /or (?:l\.)?created_at < /,
      `${name} must keep HISTORICAL 6541 traffic in production figures`);
  }
  // Every Dashboard figure - Total/New/Converted, gauges, donut, trend, AUM and
  // the platform line - is produced by that one scoped CTE, so the production
  // rule is applied once, in SQL, and cannot be skipped by a call site.
  assert.match(dashSql, /with scoped as \([\s\S]{0,600}wa_channel is distinct from '6541'/,
    'the Dashboard aggregates all read from one production-scoped set');
  for (const key of ['total', 'new', 'qualified', 'converted', 'needs_human', 'approved_aum']) {
    assert.ok(dashSql.includes(`'${key}',`), `dashboard_summary must return ${key}`);
  }
  assert.match(dashSql, /from scoped/, 'and derive them from the scoped set');

  // The agent's own stat bar, gauges and pipeline breakdown get the same
  // treatment in agent_summary() - one scoped CTE, same cutover rule.
  assert.match(agentSql, /with scoped as \([\s\S]{0,400}wa_channel is distinct from '6541'/,
    "the agent's stat bar, gauges and pipeline breakdown share one production-scoped set");
  assert.match(agentSql, /assigned_agent_id = auth\.uid\(\)/,
    "and that set is scoped to the signed-in agent's own leads");
  assert.ok(/renderAgentDashboardExtras\(total, converted, revenue,/.test(code),
    "the agent's gauges are rendered from those same aggregates");

  const reports = code.slice(code.indexOf('async function loadReports'),
                             code.indexOf('function renderAgentPerformanceReport'));
  const orCalls = (reports.match(/\.or\(PRODUCTION_LEADS_OR_FILTER\)/g) || []).length;
  assert.equal(orCalls, 3,
    'Reports total-leads count, converted count and campaign funnel each apply the production filter');
}

// ── 8. The reporting RPCs apply the same rule, the same way ───────
{
  const sql = readFileSync(new URL('../supabase/migrations/20260902100000_production_kpis_exclude_bot_test.sql', import.meta.url), 'utf8')
    .replace(/^\s*--.*$/gm, '');
  assert.ok(/CREATE OR REPLACE FUNCTION public\.is_bot_test_lead/.test(sql),
    'the rule exists as one SQL predicate, not copied inline');
  assert.ok(/p_wa_channel IS NOT DISTINCT FROM '6541'/.test(sql),
    'the SQL predicate must be NULL-safe - a plain = returns NULL for untagged leads, and WHERE NOT NULL drops them');
  assert.ok(/p_created_at IS NOT NULL/.test(sql),
    'an unknown created_at must fail closed to production, not to NULL');
  assert.ok(/p_created_at >= TIMESTAMPTZ '2026-09-02 00:00:00\+00'/.test(sql),
    'the SQL predicate is role AND date, matching isBotTestLead()');
  assert.ok(/LEFT JOIN public\.leads l\s+ON l\.assigned_agent_id = p\.id\s+AND NOT public\.is_bot_test_lead/.test(sql),
    'Agent Performance filters in the JOIN, so an agent with no leads still appears');
  assert.ok(/FROM public\.leads l\s+WHERE NOT public\.is_bot_test_lead/.test(sql),
    'Lead Source Breakdown filters in the WHERE clause');
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.is_bot_test_lead\(text, timestamptz\) FROM anon/.test(sql),
    "Supabase's default grants to anon are revoked explicitly");
  assert.ok(!/report_financial_summary/.test(sql.replace(/\s+/g, ' ').replace(/Deliberately NOT changed[^]*/, '')),
    'the deposit/financial RPC is not redefined by this migration');
  assert.ok(!/UPDATE\s+public\.leads|DELETE\s+FROM|INSERT\s+INTO/i.test(sql),
    'the migration reads only - no lead is modified, deleted or reclassified');
}

// ── 9. Historical NULL leads are never attributed to a number ─────
{
  const badge = code.slice(code.indexOf('function waChannelBadge'), code.indexOf('async function openDetail'));
  assert.ok(/WA_TAG_UNTAGGED/.test(badge), 'an untagged lead renders as historical/untagged');
  assert.equal(tagCtx.WA_TAG_UNTAGGED, 'Historical / Untagged',
    'the untagged wording is exactly as approved');
  const ctx2 = vm.createContext({ esc: (x) => String(x) });
  vm.runInContext(
    html.slice(html.indexOf('const WA_TAG_FULL'), html.indexOf('function waChannelTag')) +
    code.slice(code.indexOf('function waChannelBadge'), code.indexOf('async function openDetail')) +
    '\nglobalThis.waChannelBadge = waChannelBadge;', ctx2);
  assert.ok(ctx2.waChannelBadge(null).includes('Historical / Untagged'), 'NULL is untagged');
  assert.ok(!ctx2.waChannelBadge(null).includes(LIVE), 'NULL is never shown as the live number');
  assert.ok(ctx2.waChannelBadge('3903').includes(LIVE), '3903 shows the live tag');
  assert.ok(ctx2.waChannelBadge('6541').includes(TEST), '6541 shows the test tag');
}

// ── 10. The hierarchy card reaches all three roles ────────────────
{
  assert.ok(/id="dash-wa-hierarchy"/.test(html), 'Admin and Super Admin share the admin dashboard container');
  assert.ok(/id="agent-wa-hierarchy"/.test(html), 'the agent dashboard has its own container');
  assert.ok(/renderWaHierarchyCards\(\);/.test(code.slice(code.indexOf('function renderDashboardStats'), code.indexOf('function renderDashboardCharts'))),
    'the admin/super-admin dashboard renders the card');
  const agentExtrasStart = code.indexOf('function renderAgentDashboardExtras');
  assert.ok(/renderWaHierarchyCards\(\);/.test(code.slice(agentExtrasStart, agentExtrasStart + 900)),
    'the agent dashboard renders the card');
  const card = html.slice(html.indexOf('function waHierarchyCardHtml'), html.indexOf('function renderWaHierarchyCards'));
  for (const step of ['Meta Ads', 'Real Customer', 'CRM Lead', 'Agent Assignment', 'Conversion / Deposit', 'Production Reports']) {
    assert.ok(card.includes(step), `the live routing flow shows "${step}"`);
  }
  for (const step of ['Internal Bot Testing', 'Test Conversations', 'Not Production Traffic']) {
    assert.ok(card.includes(step), `the test routing flow shows "${step}"`);
  }
  assert.ok(/LIVE PRODUCTION/.test(card) && /BOT TESTING/.test(card), 'both sections are headed as approved');
}

// ── 11. Nothing in the deposit or payroll workflow moved ──────────
{
  assert.ok(/approve_deposit_and_convert/.test(html), 'the approval RPC call is still in place');
  const payroll = code.slice(code.indexOf('async function loadPayrollDepositTransactions'),
                             code.indexOf('async function loadPayrollRuns'));
  assert.ok(payroll.includes(".is('deposit_document_id', null)"),
    'payroll still excludes approval-generated deposits');
  assert.ok(!/productionLeads|isBotTestLead|wa_channel/.test(payroll),
    'the hierarchy change does not reach the payroll path at all');
  assert.ok(/DEPOSIT_FORM_BASE/.test(html) && /function depositFormLink/.test(code),
    'personalized deposit links are untouched');
}

console.log('whatsapp-number-hierarchy: all assertions passed');
