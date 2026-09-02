// The WhatsApp number hierarchy must reach EVERY role and EVERY agent, and it
// must do so through shared markup rather than per-user handling.
//
// Production report, 2026-09-02: Hanzala (agent) saw the new Inbox labels and
// the new Dashboard card; Badar (super admin) still saw the obsolete ones. The
// deployed file was byte-identical for both - the difference was which BUILD
// each browser was running, not which role. This suite pins the structural
// facts that make that the only possible explanation, so the "role-specific
// render path" theory can never quietly become true later.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = html.replace(/^\s*\/\/.*$/gm, '');

// Every real account named in the brief, plus a future one.
const ACCOUNTS = [
  { name: 'Badar Tanveer',           role: 'super_admin' },
  { name: 'Ehsan Wazir',             role: 'admin' },
  { name: 'Muhammad Hanzala',        role: 'agent' },
  { name: 'Farwa Qazi',              role: 'agent' },
  { name: 'Muhammad (Test)',         role: 'agent' },
  { name: 'Syed Bilal Ahmad Hashmi', role: 'agent' },
  { name: 'Syed Faisal Basit',       role: 'agent' },
  { name: 'Syed Hamza',              role: 'agent' },
  { name: 'Future Agent',            role: 'agent' },
];

// ── 1. Role routing: exactly two shells, no third path ────────────
const ctx = vm.createContext({});
vm.runInContext(
  html.slice(html.indexOf('function isAdminRole'),
             html.indexOf('\n', html.indexOf('function isAdminRole'))) +
  '\nglobalThis.isAdminRole = isAdminRole;', ctx);

const shellFor = role => (ctx.isAdminRole(role) ? 'admin-dashboard' : 'agent-dashboard');
for (const a of ACCOUNTS) {
  const shell = shellFor(a.role);
  assert.ok(shell === 'admin-dashboard' || shell === 'agent-dashboard',
    `${a.name} (${a.role}) must land in one of the two shells`);
}
assert.equal(shellFor('super_admin'), 'admin-dashboard', 'Badar (super_admin) uses the ADMIN shell');
assert.equal(shellFor('admin'), 'admin-dashboard', 'Ehsan (admin) uses the same admin shell');
assert.equal(shellFor('agent'), 'agent-dashboard', 'every agent uses the agent shell');
assert.ok(/if \(isAdminRole\(profile\.role\)\) await initAdmin\(\);/.test(code),
  'there is exactly one role branch, and it chooses between initAdmin and initAgent');
assert.ok(!/super_admin/.test(code.slice(code.indexOf('async function initAdmin'),
                                        code.indexOf('async function initAdmin') + 1200)),
  'initAdmin has no super_admin special-casing - admin and super admin get the identical shell');

// ── 2. No per-user or per-name handling in any hierarchy code ─────
// Scoped to the code that actually decides the hierarchy UI, rather than the
// whole file, so an unrelated feature that legitimately names a person (the
// "notify Badar" progress button, for one) cannot make this pass or fail for
// the wrong reason.
{
  const regions = [
    ['tag constants',    'const WA_NUMBERS = {',              'function waChannelTag'],
    ['production rule',  'const BOT_TEST_CUTOVER =',          'const PRODUCTION_LEADS_OR_FILTER'],
    ['hierarchy card',   'function waHierarchyCardHtml',      'function renderDashboardStats'],
    ['channel badge',    'function waChannelBadge',           'async function openDetail'],
    ['channel labels',   'const WA_CHANNEL_LABELS = {',       'function setConvChannel'],
    ['build freshness',  'const BUILD_CHECK_URL',             'function startBuildFreshnessCheck'],
  ];
  for (const [label, from, to] of regions) {
    const a = code.indexOf(from), b = code.indexOf(to);
    assert.ok(a > -1 && b > a, `region "${label}" must exist and be well formed`);
    const region = code.slice(a, b);
    for (const who of ['Hanzala', 'Badar', 'Ehsan', 'Farwa', 'Bilal', 'Faisal', 'Hamza']) {
      assert.ok(!new RegExp(who, 'i').test(region),
        `"${label}" must not mention ${who} - the policy is role-based, never per-user`);
    }
    // The user-role identifiers specifically. WA_NUMBERS carries its own
    // `role: 'live' | 'test'` field, which is number classification, not a
    // CRM permission role, so a bare /role/ would be the wrong test here.
    assert.ok(!/currentProfile|isAdminRole|super_admin|profile\.role/.test(region),
      `"${label}" must contain no role check - every role gets the identical result`);
  }
}

// ── 3. Exactly one Inbox markup per shell, no stale duplicates ────
const menus = [...html.matchAll(/<div class="wa-chan-menu" id="([a-z-]*wa-chan-menu)"/g)].map(m => m[1]);
assert.deepEqual(menus, ['wa-chan-menu', 'agent-wa-chan-menu'],
  'exactly two channel menus exist: the admin/super-admin one and the agent one');

const tagCtx = vm.createContext({});
vm.runInContext(
  html.slice(html.indexOf('const WA_NUMBERS = {'), html.indexOf('function waChannelTag')) +
  '\nglobalThis.WA_TAG_COMPACT = WA_TAG_COMPACT;', tagCtx);

for (const id of menus) {
  const start = html.indexOf(`id="${id}"`);
  const menu = html.slice(start, html.indexOf('</div>', start));
  const labels = [...menu.matchAll(/<span class="wa-chan-opt-name">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.equal(labels.length, 3, `${id} has All Numbers plus the two approved pills`);
  assert.ok(labels[0].includes('All Numbers'), `${id} keeps All Numbers`);
  assert.equal(labels[1], tagCtx.WA_TAG_COMPACT['3903'], `${id} shows the approved LIVE tag, live first`);
  assert.equal(labels[2], tagCtx.WA_TAG_COMPACT['6541'], `${id} shows the approved TEST tag`);
  assert.ok(menu.includes('data-channel="6541"'), `${id} keeps 6541 selectable so test traffic stays inspectable`);
}

// ── 4. Zero obsolete labels anywhere in the file ──────────────────
for (const obsolete of [
  'UAE · 6541', 'Pakistan · 3903', '\u{1F1E6}\u{1F1EA} UAE', '\u{1F1F5}\u{1F1F0} Pakistan',
  'Primary 6541', 'Secondary 3903', 'Main 6541', 'Main line, full bot',
  "sub: 'Ingest only'", 'Second WhatsApp number',
]) {
  assert.ok(!html.includes(obsolete), `obsolete label "${obsolete}" must not appear anywhere`);
}

// ── 5. The Dashboard card reaches both shells, unconditionally ────
assert.ok(/id="dash-wa-hierarchy"/.test(html), 'the admin/super-admin shell has the card container');
assert.ok(/id="agent-wa-hierarchy"/.test(html), 'the agent shell has the card container');
{
  const fn = code.slice(code.indexOf('function renderWaHierarchyCards'),
                        code.indexOf('function renderWaHierarchyCards') + 400);
  assert.ok(fn.includes("'dash-wa-hierarchy'") && fn.includes("'agent-wa-hierarchy'"),
    'one renderer fills both containers');
  assert.ok(!/role|isAdminRole|currentProfile/.test(fn),
    'the renderer contains no role check at all - it cannot skip a role');
}
{
  const admin = code.slice(code.indexOf('function renderDashboardStats'),
                           code.indexOf('function renderDashboardStats') + 400);
  assert.ok(admin.includes('renderWaHierarchyCards();'),
    'the admin/super-admin dashboard renders the card');
  // Rendered BEFORE the demo-mode early return, so it can never be skipped.
  assert.ok(admin.indexOf('renderWaHierarchyCards();') < admin.indexOf('if (demoMode)'),
    'the card renders before any early return in the admin dashboard');
  const agentStart = code.indexOf('function renderAgentDashboardExtras');
  assert.ok(code.slice(agentStart, agentStart + 500).includes('renderWaHierarchyCards();'),
    'the agent dashboard renders the card');
}
// Both dashboards reach their renderer on the same tab switch, for any role.
assert.ok(/if \(name === 'dashboard'\)\s+renderDashboardStats\(\);/.test(code),
  'the admin/super-admin dashboard tab calls its renderer');
assert.ok(/renderAgentDashboardExtras\(total, converted, revenue\);/.test(code),
  'the agent dashboard calls its renderer from the shared agent load path');

// ── 6. Build freshness reaches every role, and never auto-reloads ─
{
  const fn = code.slice(code.indexOf('function startBuildFreshnessCheck'),
                        code.indexOf('function startBuildFreshnessCheck') + 900);
  assert.ok(fn.length > 100, 'the build freshness check exists');
  assert.ok(!/role|isAdminRole|currentProfile|demoMode/.test(fn),
    'it has no role check - every signed-in user is covered identically');
  assert.ok(/startBuildFreshnessCheck\(\);/.test(code.slice(0, code.indexOf('const previewParams'))),
    'it starts at boot, before any admin/agent branch');
  const banner = code.slice(code.indexOf('function showNewBuildBanner'),
                            code.indexOf('async function checkForNewBuild'));
  assert.ok(banner.includes('location.reload()'), 'the banner offers a reload');
  const check = code.slice(code.indexOf('async function checkForNewBuild'),
                           code.indexOf('function startBuildFreshnessCheck'));
  assert.ok(!/location\.reload/.test(check),
    'a new build is never auto-reloaded - an agent mid-reply must not lose the page');
  assert.ok(/cache: 'no-store'/.test(code), 'the freshness probe never reads from cache');
  assert.ok(/Range: 'bytes=0-0'/.test(code), 'the probe fetches one byte, not the whole document');
  assert.ok(/catch \(err\) \{\s*return null;/.test(code), 'a failed probe fails silently');
}

// ── 7. The KPI rule is untouched by this fix ──────────────────────
assert.ok(html.includes("const BOT_TEST_CUTOVER = '2026-09-02T00:00:00Z'"),
  'the date-anchored cutover is unchanged');
assert.ok(/wa_channel !== '6541'/.test(code) && /BOT_TEST_CUTOVER_MS/.test(code),
  'isBotTestLead still keys on channel AND date');
assert.ok(code.includes("`wa_channel.is.null,wa_channel.neq.6541,created_at.lt.${BOT_TEST_CUTOVER}`"),
  'the server-side production filter is unchanged');

console.log(`hierarchy-role-coverage: all assertions passed (${ACCOUNTS.length} accounts covered)`);
