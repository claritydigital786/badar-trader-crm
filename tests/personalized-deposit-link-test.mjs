// The per-lead deposit form link, and the attribution it protects.
//
// Until this existed, the only link anywhere was the bare form. A customer
// whose typed phone did not match any lead caused conversion-hook to create a
// BRAND NEW lead with no assigned agent - invisible to every agent queue and
// skipped by Reports, which does `if (!agentId) return;`. Production already
// carries one such orphan.
//
// The security property this file pins: the link carries a lead id and NOTHING
// else. No agent id travels from the browser at any point, so editing the URL
// can never move a deposit to a different agent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const join = readFileSync(new URL('../join.html', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../supabase/functions/conversion-hook/index.ts', import.meta.url), 'utf8');

// ── The link builder itself ────────────────────────────────────
const sandbox = {};
vm.createContext(sandbox);
{
  const start = html.indexOf('const DEPOSIT_FORM_BASE');
  const end = html.indexOf('const QUICK_LINKS');
  assert.ok(start > 0 && end > start, 'the deposit-link helper must exist');
  // A top-level `const` is lexically scoped to the vm script and never lands on
  // the context, unlike a function declaration - so hand it over explicitly.
  vm.runInContext(html.slice(start, end) + '\nglobalThis.DEPOSIT_FORM_BASE = DEPOSIT_FORM_BASE;', sandbox);
}
const { depositFormLink, DEPOSIT_FORM_BASE } = sandbox;

assert.equal(DEPOSIT_FORM_BASE, 'https://crm.badartrader.com/join.html');
assert.equal(
  depositFormLink('eba43434-75d7-4d7e-a63c-2c19185bb922'),
  'https://crm.badartrader.com/join.html?lead_id=eba43434-75d7-4d7e-a63c-2c19185bb922',
  'the link is the production form plus this lead id');

// Two different leads produce two different links, and nothing else differs.
const a = depositFormLink('11111111-1111-4111-8111-111111111111');
const b = depositFormLink('22222222-2222-4222-8222-222222222222');
assert.notEqual(a, b, 'each lead gets its own link');
assert.ok(a.startsWith(DEPOSIT_FORM_BASE + '?lead_id=') && b.startsWith(DEPOSIT_FORM_BASE + '?lead_id='));

// ── No agent identity anywhere in the link ─────────────────────
for (const link of [a, b, depositFormLink('x')]) {
  assert.ok(!/agent/i.test(link), 'the link must not carry any agent identifier: ' + link);
  assert.equal((link.match(/[?]/g) || []).length, 1, 'exactly one query string');
  assert.equal(link.split('?')[1].split('&').length, 1, 'exactly one parameter, lead_id');
}
// A hostile lead id cannot break out of the parameter.
assert.ok(!depositFormLink('x&agent_id=someone').includes('&agent_id='),
  'a lead id is encoded, so it cannot inject a second parameter');

// ── The button is wired to it ──────────────────────────────────
assert.ok(/Copy Deposit Form Link/.test(html), 'the lead detail offers the button');
assert.ok(/data-copy="\$\{esc\(depositFormLink\(leadId\)\)\}"/.test(html),
  'the button copies the generated link for THIS lead, not a typed value');

// ── Agents are steered off the generic link ────────────────────
{
  assert.ok(/adminOnly: true/.test(html), 'the generic form link is flagged admin-only');
  assert.ok(!/value: 'https:\/\/crm\.badartrader\.com\/join\.html'/.test(html),
    'the bare, unattributed form URL is no longer a plain agent quick link');
  const rq = html.slice(html.indexOf('function renderQuickLinks'), html.indexOf('function renderQuickLinkValue'));
  assert.ok(/scope === 'agent-'/.test(rq), 'the agent list is identified');
  assert.ok(/l\.adminOnly && isAgentList/.test(rq), 'admin-only links are filtered out of the agent list');
  // Filtering must not renumber the options - renderQuickLinkValue indexes QUICK_LINKS.
  assert.ok(/\.map\(\(l, i\) => \(\{ l, i \}\)\)/.test(rq),
    'the original index is preserved through the filter');
}

// ── Attribution stays server-side ──────────────────────────────
{
  // join.html reads only lead_id, and sends no agent field.
  assert.ok(/get\('lead_id'\)/.test(join), 'join.html reads lead_id');
  assert.ok(!/agent_id|assigned_agent/i.test(join), 'join.html never handles an agent id');

  // conversion-hook finds the EXISTING lead by id and never writes the owner.
  assert.ok(/sel = leadId \? sel\.eq\("id", leadId\)/.test(hook),
    'a supplied lead_id looks up the existing lead');
  assert.ok(/error: "lead not found"[\s\S]{0,80}404/.test(hook),
    'a lead_id that does not exist 404s rather than creating a new lead');
  const update = hook.slice(hook.indexOf('const update: Record<string, unknown> = {'),
                            hook.indexOf('// The screenshot lands in'));
  assert.ok(!/assigned_agent_id/.test(update),
    'the hook must never write assigned_agent_id - the lead keeps its owner');
  assert.ok(!/assigned_agent_id/.test(hook.replace(/^\s*\/\/.*$/gm, '')),
    'no executable line of the hook touches assigned_agent_id');

  // Reports resolves the agent from the lead, not from the transaction.
  // Still resolved through the lead record - but read from the database rather
  // than from cachedLeads, which was empty unless the admin had opened All
  // Leads first and made Hanzala's approved $500 show as "None" in production.
  assert.ok(/\.from\('leads'\)\.select\('id, assigned_agent_id'\)\.in\('id',/.test(html),
    'Reports maps a deposit back to the agent through the lead record');
  // The queues are scoped by the lead's owner too.
  assert.ok(/rows = rows\.filter\(r => r\.lead\?\.assigned_agent_id === agentId\)/.test(html),
    'the deposit queue is scoped by the lead owner');
}

console.log('personalized-deposit-link: all assertions passed');
