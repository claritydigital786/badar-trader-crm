import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sendFunction = readFileSync(new URL('../supabase/functions/send-wa-message/index.ts', import.meta.url), 'utf8');
const messageActionsMigration = readFileSync(new URL('../supabase/migrations/20260810005621_message_actions.sql', import.meta.url), 'utf8');

assert.match(
  html,
  /\.msg-bubble\s*\{[^}]*white-space:normal[^}]*\}/,
  'Bubble template whitespace must collapse so indentation cannot inflate messages.',
);
assert.match(
  html,
  /\.msg-body\s*\{[^}]*white-space:pre-wrap[^}]*\}/,
  'The real message body must still preserve intentional customer line breaks.',
);
assert.match(
  html,
  /\.msg-day-sep\s*\{[^}]*position:sticky[^}]*top:8px[^}]*\}/,
  'The WhatsApp-style day label must remain visible at the top while scrolling.',
);

const messageBodyUses = html.match(/class="msg-body"/g) || [];
assert.equal(
  messageBodyUses.length,
  4,
  'Demo, optimistic demo send, full live render, and realtime insert must all isolate message-body whitespace.',
);
assert.doesNotMatch(
  html,
  /class="msg-time">\$\{fmtConvTime\(m\.created_at\)\}/,
  'A message bubble must not replace an old message time with a calendar date.',
);
assert.match(
  html,
  /class="msg-time">[\s\S]{0,140}\$\{fmtConvMessageTime\(m\.created_at\)\}/,
  'The full live render must use the message-only clock formatter.',
);
assert.match(
  html,
  /class="msg-time">[\s\S]{0,140}\$\{fmtConvMessageTime\(payload\.new\.created_at\)\}/,
  'Realtime messages must use the same clock formatter.',
);
assert.match(
  html,
  /appendConvDaySeparatorIfNeeded\(msgArea, payload\.new\.created_at\)/,
  'Realtime messages must create a new day divider when the calendar day changes.',
);
assert.doesNotMatch(
  html,
  /glyph:\s*['"]✓✓['"]/,
  'Delivered and read states must not render as two separated text characters.',
);
assert.match(
  html,
  /delivered:\s*\{ icon: 'double',[\s\S]*read:\s*\{ icon: 'double'/,
  'Delivered and read states must share the compact WhatsApp-style double-check icon.',
);
assert.match(
  html,
  /class="msg-tick-icon"[\s\S]*viewBox="0 0 24 24"[\s\S]*aria-hidden="true"/,
  'Delivery states must render a single aligned SVG icon rather than loose glyphs.',
);
assert.match(
  html,
  /class="msg-tick \$\{status\}" title="\$\{mark\.label\}" aria-label="\$\{mark\.label\}"/,
  'The compact tick must keep an accessible delivery-state label.',
);
assert.match(
  html,
  /\.msg-tick\.read\s*\{[^}]*color:#53bdeb/,
  'Read receipts must retain WhatsApp blue.',
);
assert.match(
  html,
  /\.sidebar\s*\{[^}]*padding:\s*0;/,
  'The sidebar must not reserve an empty ticker-sized block below the profile footer.',
);
assert.doesNotMatch(
  html,
  /\.sidebar\s*\{[^}]*padding:\s*0\s+0\s+46px/,
  'The old 46-pixel bottom spacer must not make the profile area look oversized.',
);
assert.match(
  html,
  /function toggleConvListPanel\(scope\)[\s\S]*hasOpenConversation[\s\S]*if \(nowHiding && !hasOpenConversation\)[\s\S]*Select a conversation before hiding the lead list\./,
  'The inbox list toggle must not strand a user on an empty chat before a conversation is selected.',
);
assert.match(
  html,
  /_activeConvScope === scope[\s\S]{0,140}querySelector\('\.conv-chat-header'\)/,
  'The list-toggle guard must verify that the open conversation belongs to the current Admin or Agent inbox.',
);
for (const menuAction of ['Refresh inbox', 'All conversations', 'Unread conversations', 'Clear search', 'Hide lead list']) {
  const occurrences = html.match(new RegExp(`>${menuAction}<`, 'g')) || [];
  assert.equal(occurrences.length, 2, `Admin and Agent inbox menus must both include ${menuAction}.`);
}
assert.match(
  html,
  /function toggleInboxMenu\(event, scope\)[\s\S]*aria-expanded[\s\S]*function runInboxMenuAction\(action, scope\)/,
  'The inbox burger must open an accessible action menu instead of directly hiding the list.',
);

const dashboardQuickTiles = html.match(/<div class="quick-tile" onclick="adminTab\('[^']+'\)">[\s\S]*?<\/div>\s*<\/div>/g) || [];
assert.equal(
  dashboardQuickTiles.length,
  4,
  'The dashboard must contain four distinct shortcuts after removing the duplicate Create Flow entry.',
);
assert.doesNotMatch(
  dashboardQuickTiles.join('\n'),
  /<h4>Create Flow<\/h4>/,
  'The dashboard must not repeat the Automation destination under a Create Flow shortcut.',
);
const botManagerQuickTiles = dashboardQuickTiles.filter(tile => tile.includes('<h4>Bot Manager</h4>'));
assert.equal(botManagerQuickTiles.length, 1, 'The dashboard must contain exactly one Bot Manager shortcut.');
assert.match(
  botManagerQuickTiles[0],
  /onclick="adminTab\('bot-manager'\)"[\s\S]*Manage automation and AI/,
  'The consolidated Bot Manager shortcut must open Bot Manager directly and describe its full scope.',
);
assert.match(
  dashboardQuickTiles.join('\n'),
  /onclick="adminTab\('meta'\)"[\s\S]*<h4>Meta Integration<\/h4>[\s\S]*Review WhatsApp and Meta setup/,
  'The Meta shortcut must describe its real integration destination instead of promising a channel-connection wizard.',
);
assert.doesNotMatch(
  dashboardQuickTiles.join('\n'),
  /Connect Channel|Add new channel/,
  'The dashboard must not advertise an unbuilt add-channel workflow.',
);
assert.match(
  html,
  /The deployed WhatsApp webhook reads these rules[\s\S]*KEYWORD_REPLIES_ENABLED[\s\S]*currently <code>false<\/code>/,
  'Bot Manager must report the deployed keyword integration and its disabled live-send gate accurately.',
);
assert.match(
  html,
  /production database currently has no cron job[\s\S]*FOLLOW_UPS_ENABLED[\s\S]*<code>false<\/code>/,
  'Follow-up Sequences must state both verified production gates.',
);
assert.doesNotMatch(
  html,
  /no scheduled job reads (?:these rules|this table)/i,
  'Follow-up copy must not claim the built sender is missing.',
);
// Corrected 2026-08-30: AI_REPLIES_ENABLED stopped being a hardcoded "off"
// constant back on 2026-08-23 (it's a real settings-backed toggle now) and
// the bot has genuinely been answering real customers with it since
// 2026-08-19 - asserting "remains off" would be asserting a stale, wrong
// claim back into existence.
assert.match(
  html,
  /AI_REPLIES_ENABLED[\s\S]*is a live toggle read from[\s\S]*settings[\s\S]*currently[\s\S]*on/,
  'The Guide must report the deployed AI integration and its live, currently-on reply gate accurately.',
);
assert.doesNotMatch(
  html,
  /WhatsApp webhook does not read these rules|bot does not read them yet|bot does not act on them yet/,
  'Released webhook integrations must not be described as unwired.',
);
for (const [panel, destination] of [
  ['appointment-booking', 'appointments'],
  ['set-webhook', 'meta'],
  ['set-shared-inbox', 'user-permission'],
]) {
  assert.match(
    html,
    new RegExp(`['"]${panel}['"]\\s*:\\s*\\{[\\s\\S]{0,700}['"]${destination}['"]`),
    `Bot Manager ${panel} must route to its working CRM destination instead of looking unfinished.`,
  );
}
assert.match(
  html,
  /BM_AVAILABLE_ELSEWHERE[\s\S]*Available in CRM[\s\S]*Object\.entries\(BM_PLACEHOLDERS\)/,
  'Bot Manager must distinguish working features located elsewhere from genuinely unfinished modules.',
);
for (const panel of ['store-automation', 'product-catalog']) {
  assert.match(
    html,
    new RegExp(`['"]${panel}['"]\\s*:\\s*\\{[\\s\\S]{0,500}Not planned for Badar Trader`),
    `Bot Manager ${panel} must be classified as out of scope for this business, not as an unexplained missing feature.`,
  );
}

for (const label of ['Message info', 'Reply', 'Copy', 'React', 'Forward', 'Pin', 'Star', 'Add text to note', 'Delete']) {
  assert.match(html, new RegExp(`>${label}<|['"]${label}['"]`), `The message menu must include ${label}.`);
}
assert.match(
  html,
  /messageActionButtonHtml\(\{ id:payload\.new\.id/,
  'Realtime messages must receive the same dropdown as existing messages.',
);
assert.match(
  html,
  /This does not delete or unsend the message on WhatsApp/,
  'Delete must be described honestly as a recoverable CRM-only hide.',
);
assert.match(
  html,
  /sb\.from\('lead_activity'\)\.insert/,
  'Add text to note must use the durable lead activity log.',
);
assert.match(
  messageActionsMigration,
  /ALTER TABLE public\.communication_message_actions ENABLE ROW LEVEL SECURITY/,
  'Per-user message actions must have RLS enabled.',
);
assert.match(
  messageActionsMigration,
  /user_id = \(SELECT auth\.uid\(\)\)[\s\S]*public\.communications/,
  'Message-action policies must bind the user and verify access to the parent communication.',
);
assert.match(
  messageActionsMigration,
  /REVOKE ALL ON public\.communication_message_actions FROM anon, authenticated/,
  'The new table must explicitly remove legacy anonymous Data API privileges.',
);
assert.match(
  messageActionsMigration,
  /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*TO authenticated/,
  'The new table must be explicitly exposed to authenticated Data API clients.',
);
assert.match(
  sendFunction,
  /type: "reaction"[\s\S]*message_id: reactionToWaMessageId[\s\S]*emoji: reactionEmoji/,
  'The Edge Function must use Meta reaction messages rather than a fake CRM-only reaction.',
);
assert.match(
  sendFunction,
  /lead\.assigned_agent_id === user\.id/,
  'The service-role send path must repeat the assigned-agent authorization boundary.',
);
assert.match(
  sendFunction,
  /\.eq\("lead_id", leadId\)[\s\S]*\.eq\("wa_message_id", reactionToWaMessageId\)/,
  'A reaction WAMID must belong to the active lead before it is sent.',
);

const demoPreviewBoot = html.indexOf('if (localDemoPreview)');
const adminNavigationBinding = html.indexOf("adminTabsEl.addEventListener('click'");
assert.ok(demoPreviewBoot > -1, 'The local demo-preview boot path must exist.');
assert.ok(adminNavigationBinding > -1, 'Admin sidebar navigation must be wired.');
assert.ok(
  adminNavigationBinding < demoPreviewBoot,
  'Admin sidebar navigation must be wired before the demo-preview early return.',
);
assert.match(
  html,
  /previewParams\.get\('demo-start'\)[\s\S]*adminTab\(startTab\)/,
  'The presentation preview must support starting on a requested CRM section.',
);

const adminTabsStart = html.indexOf('id="admin-tabs"');
const adminTabsEnd = html.indexOf('id="sidebar-user', adminTabsStart);
assert.ok(adminTabsStart > -1 && adminTabsEnd > adminTabsStart, 'Admin sidebar markup must exist.');
const adminTabsMarkup = html.slice(adminTabsStart, adminTabsEnd);
const adminTabNames = [...adminTabsMarkup.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
assert.equal(adminTabNames.length, 29, 'The presentation sidebar must expose all 29 Admin data-tab references, including Settings\', Socials\' and Signals\' subgroup items (each repeats its own data-tab once for the parent label, once for its first sub-item), CRM Development Progress, and Action Items With Badar.');
for (const tabName of adminTabNames) {
  assert.match(
    html,
    new RegExp(`id=["']admin-tab-${tabName}["']`),
    `Admin sidebar section ${tabName} must have a matching page panel.`,
  );
}

const functionDefinitions = new Set(
  [...html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]),
);
const inlineClickHandlers = [
  ...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\s*\(/g),
].map((match) => match[1]);
for (const handler of new Set(inlineClickHandlers)) {
  if (['alert', 'confirm'].includes(handler)) continue;
  assert.ok(functionDefinitions.has(handler), `Inline button handler ${handler} must be defined.`);
}

assert.ok(adminTabNames.includes('settings'), 'The Admin sidebar must include a dedicated Settings section.');
assert.match(
  html,
  /id="admin-tab-settings"[\s\S]*id="settings-business-name"[\s\S]*id="settings-timezone"[\s\S]*id="settings-currency"/,
  'Settings must include real workspace name, timezone, and default-transaction-currency controls.',
);
assert.match(
  html,
  /default_transaction_currency[\s\S]*\['USD','EUR','GBP','USDT','BTC'\]\.map\(currencyOption\)/,
  'The saved default transaction currency must drive the Add Transaction form using schema-supported currencies.',
);
assert.match(
  html,
  /if \(demoMode\) \{\s*fillGeneralSettings\(workspaceSettings\);\s*return;/,
  'Reopening Settings in demo mode must retain session-only workspace changes.',
);
assert.doesNotMatch(
  html,
  /reporting_currency/,
  'Settings must not claim to convert or report currencies when no exchange-rate conversion exists.',
);
assert.doesNotMatch(
  html,
  /Total Revenue|Revenue Generated|>Revenue<|Revenue \(USD\)/,
  'Client deposits and account balances must not be presented as company revenue.',
);
assert.match(
  html,
  /function loadAllReportTransactions\(\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)[\s\S]*transactionTotalsByCurrency\(txRows, 'deposit'\)/,
  'Live reports must paginate transaction records and preserve their currencies.',
);
assert.match(
  html,
  /function loadPayrollDepositTransactions\(start, end\)[\s\S]*\.eq\('currency', 'USD'\)[\s\S]*\.range\(offset, offset \+ pageSize - 1\)/,
  'Payroll must paginate eligible USD deposits and never combine non-USD deposits with USD salaries.',
);

const totalsFunction = html.match(/function transactionTotalsByCurrency\(rows, type\) \{([\s\S]*?)\n\}/);
assert.ok(totalsFunction, 'Currency-preserving transaction aggregation must exist.');
const transactionTotalsByCurrency = new Function('rows', 'type', totalsFunction[1]);
assert.deepEqual(
  transactionTotalsByCurrency([
    { type:'deposit', amount:100, currency:'USD' },
    { type:'deposit', amount:50, currency:'EUR' },
    { type:'deposit', amount:25, currency:'USD' },
    { type:'withdrawal', amount:10, currency:'USD' },
  ], 'deposit'),
  { USD:125, EUR:50 },
  'Reports must preserve currency buckets and exclude withdrawals from deposits.',
);
assert.match(
  html,
  /data-nav-icon="dashboard"[\s\S]*const CRM_NAV_ICONS[\s\S]*function renderNavigationIcons/,
  'Sidebar sections must use the bundled professional SVG icon system.',
);
assert.doesNotMatch(
  adminTabsMarkup,
  /[🏠👥🏆📈🤖➕💬🕐📋⚡📅💰📡👤🛡️🧑‍💼🔗🔔🌐📖]/u,
  'The Admin sidebar must not fall back to platform-dependent emoji icons.',
);

const formatter = html.match(
  /function fmtConvMessageTime\(isoStr\) \{([\s\S]*?)\n\}/,
);
assert.ok(formatter, 'Message timestamp formatter must exist.');
const formatMessageTime = new Function('workspaceTimeZone', 'isoStr', formatter[1]);
const oldMessageTime = formatMessageTime(() => 'UTC', '2026-07-27T09:05:00Z');
assert.match(
  oldMessageTime,
  /^\d{1,2}:\d{2}\s(?:AM|PM)$/,
  'Even an old message must display a clock time, not Jul 27.',
);
assert.match(
  html,
  /function workspaceTimeZone\(\)[\s\S]*function zonedDaySerial\(date\)[\s\S]*timeZone:workspaceTimeZone\(\)/,
  'The saved business timezone must drive CRM dates, message clocks, and day boundaries.',
);

const inlineScripts = [];
let cursor = 0;
while (true) {
  const start = html.indexOf('<script>', cursor);
  if (start < 0) break;
  const end = html.indexOf('</script>', start + 8);
  assert.notEqual(end, -1, 'Inline script block must close.');
  inlineScripts.push(html.slice(start + 8, end));
  cursor = end + 9;
}
assert.ok(inlineScripts.length > 0, 'At least one inline script must exist.');
inlineScripts.forEach((source) => new Function(source));

console.log('Inbox UI regression checks passed.');
