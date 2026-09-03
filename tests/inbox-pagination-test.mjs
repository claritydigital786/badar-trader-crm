// Omnichannel Inbox: server-side paging, filtering, search and counts.
//
// Before this the Inbox fetched inbox_conversation_list with .limit(5000) -
// 2,873 rows / 1.10 MB for Badar and Ehsan - painted every row into the DOM in
// one innerHTML write, then implemented search and EVERY filter by walking
// those nodes setting style.display. The browser paid for 2,873 conversations
// to show about a dozen, and each keystroke re-walked all of them.
//
// The property the old design bought - nothing is ever unreachable - is the one
// thing pagination must not lose, so most of what follows is about reachability,
// not speed.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migDir = new URL('../supabase/migrations/', import.meta.url);
const mig = readFileSync(new URL(
  readdirSync(migDir).find(f => f.includes('inbox_pagination')), migDir), 'utf8');
const block = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── A. The full fetch is gone ──────────────────────────────────
test('the Inbox no longer downloads every conversation', () => {
  assert.ok(!/\.limit\(5000\)/.test(stripJs(html)), '.limit(5000) must not come back');
  const load = block('async function loadConvPage', 'function convEmptyHtml');
  assert.match(load, /\.range\(from, to\)/, 'the list must be windowed in Postgres');
  assert.match(load, /const to   = reconcile \? \(\(st\.pageIndex \+ 1\) \* CONV_PAGE_SIZE\) - 1\s*\n\s*: from \+ CONV_PAGE_SIZE - 1;/,
    'a page is CONV_PAGE_SIZE rows; a reconcile re-reads the whole loaded depth');
  assert.match(html, /const CONV_PAGE_SIZE = 75;/);
});

test('paging is seamless, not page-number controls', () => {
  // Replaced the scrollTop/scrollHeight arithmetic with an observer rooted on
  // the real scrolling element (2026-09-05) - see observeConvSentinel.
  assert.match(html, /new IntersectionObserver\(entries => \{[\s\S]{0,160}loadMoreConversations\(scope\)/);
  assert.match(html, /\{ root: listEl, rootMargin: '300px' \}/,
    'the observer root must be the conversation list, not the viewport');
  assert.match(html, /function loadMoreConversations\(scope = ''\) \{[\s\S]{0,220}st\.pageIndex\+\+;\s*\n\s*loadConvPage\(scope, \{ append: true \}\)/);
  // The Inbox must not grow the pager UI the All Leads table uses.
  const inbox = block('async function loadConvPage', 'async function openConversation');
  assert.ok(!/goToLeadsPage|renderLeadsPager|Page \$\{page\} of/.test(inbox),
    'no page-number controls may appear in the Inbox');
});

// ── B. Nothing became unreachable ──────────────────────────────
test('search runs server-side, so unloaded conversations are findable', () => {
  const qb = block('function buildConvQuery', 'function convRowFromView');
  assert.match(qb, /if \(term\) q = q\.or\(buildConvSearchOr\(term\)\)/);
  assert.match(html, /full_name\.ilike\.\$\{like\},phone\.ilike\.\$\{like\},body\.ilike\.\$\{like\}/,
    'search must cover name, phone and message body');
  // The old DOM scan must be gone - it could only match loaded rows.
  assert.ok(!/el\.textContent\.toLowerCase\(\)\.includes\(q\)/.test(html),
    'search must not fall back to scanning rendered nodes');
  assert.match(html, /function onConvSearchInput[\s\S]{0,300}setTimeout\(\(\) => filterConversations\(scope\), 250\)/,
    'and must be debounced now that it costs a request');
});

test('search escapes wildcards and .or() separators', () => {
  const f = block('function buildConvSearchOr', 'function convSearchTerm');
  for (const re of [/replace\(\/%\/g/, /replace\(\/_\/g/, /replace\(\/\[,\(\)\]\/g/]) assert.match(f, re);
});

test('forwarding can still reach a conversation that is not loaded', () => {
  // _lastConvs holds one page now; a purely local filter would silently make
  // every conversation below the fold un-forwardable.
  assert.match(html, /async function searchForwardTargets\(q\)[\s\S]{0,700}from\('inbox_conversation_list'\)/);
  assert.match(html, /const remote = await searchForwardTargets\(query\);/);
});

test('pagination is deterministic, so no row is skipped or duplicated', () => {
  const qb = block('function buildConvQuery', 'function convRowFromView');
  assert.match(qb, /return q\.order\('lead_id', \{ ascending: true \}\)/,
    'a tiebreaker is required or rows sharing a timestamp straddle page boundaries');
  const load = block('async function loadConvPage', 'function convEmptyHtml');
  assert.match(load, /const fresh = rows\.filter\(c => !st\.ids\.has\(c\.lead_id\)\);/,
    'an appended page must drop rows already rendered');
});

// ── C. Filters and counts cover the whole authorised set ───────
test('every filter is applied by the database', () => {
  const qb = block('function buildConvQuery', 'function convRowFromView');
  for (const [what, re] of [
    ['stage',      /q\.eq\('tier', _activeConvFilter\)/],
    ['unread',     /q\.eq\('is_unread', true\)/],
    ['awaiting',   /q\.eq\('direction', 'inbound'\)/],
    ['needshuman', /q\.eq\('needs_human', true\)/],
    ['channel',    /\.eq\('type', 'whatsapp'\)\.eq\('wa_channel', _activeConvChannel\)/],
  ]) assert.match(qb, re, `${what} must filter server-side`);
  assert.ok(!/el\.style\.display = show \? '' : 'none'/.test(html),
    'the DOM show/hide filter pass must be gone');
});

test('counts are exact over the authorised set, not the loaded page', () => {
  assert.match(html, /sb\.rpc\('inbox_conversation_counts'\)/);
  assert.match(mig, /create or replace function public\.inbox_conversation_counts/);
  for (const k of ['chan_all', 'chan_3903', 'chan_6541', 'unread', 'needshuman', 'awaiting'])
    assert.ok(mig.includes(`'${k}'`), `counts must include ${k}`);
  // "All Numbers" used to be list.length, and the two number pills counted
  // LEADS rather than conversations.
  assert.ok(!/fetchRealChannelCount/.test(html), 'the leads-based channel count must be gone');
  assert.ok(!/setCount\(`\$\{scope\}conv-channel-count-all`, list\.length\)/.test(html));
});

test('the approved WhatsApp hierarchy is untouched', () => {
  assert.match(html, /\u{1F7E2} LIVE/u, 'the LIVE pill must remain');
  assert.match(html, /\u{1F9EA} TEST/u, 'the TEST pill must remain');
  assert.ok(html.includes('3903') && html.includes('6541'));
  // No third production-number concept may appear in the counts.
  assert.ok(!/chan_(?!all|3903|6541|untagged|other)\w+/.test(mig));
});

// ── D. Realtime does not reload the list ───────────────────────
test('a new message updates one row, not the whole Inbox', () => {
  const handler = block("if (payload.new.subject === 'Qualified lead summary') return;",
                        '// Delivery ticks arrive as UPDATEs');
  assert.match(handler, /applyConvRealtimeRow\(payload\.new\.lead_id, _convRealtimeScope\)/);
  assert.ok(!/renderConversations\(_convRealtimeScope\);/.test(handler),
    'the INSERT handler must not re-fetch every conversation');
  // 2026-09-05: realtime reconciles the loaded depth through the SAME filtered
  // query the list is built with, so a row the filter excludes is not pushed in,
  // one that stops matching disappears, and ordering comes from the server.
  assert.match(html, /function applyConvRealtimeRow\(leadId, scope = ''\) \{[\s\S]{0,200}reconcileConversations\(scope\)/);
  assert.match(html, /loadConvPage\(scope, \{ reconcile: true \}\)/);
  // The count refresh is fired by the realtime handler alongside the row update.
  assert.match(handler, /scheduleConvCountRefresh\(_convRealtimeScope\)/, 'counts must follow the change');
});

test('REGRESSION: no realtime path may rewind pagination depth', () => {
  // The 2026-09-05 production bug: every realtime path called loadConvPage with
  // reset:true, so from 225 rows a single inbound message - or a resubscribe, or
  // a tab foreground - collapsed the list to 75, pageIndex to 0 and scrollTop to
  // 0. On a live line that fires continuously, making older conversations
  // unreachable from the UI even though SQL could page to all 39 pages.
  const rt = stripJs(block('function startConvRealtime', 'function appendConvDaySeparatorIfNeeded'));
  assert.ok(!/renderConversations\(/.test(rt),
    'no realtime path may call renderConversations() - that resets to page 1');
  assert.match(rt, /reconcileConversations\(_convRealtimeScope\)/,
    'realtime must reconcile the loaded depth instead');
  const vis = stripJs(block('function handleConvRealtimeVisibility', 'function stopConvRealtime'));
  assert.ok(!/renderConversations\(/.test(vis), 'foreground regain must not reset either');
  assert.match(vis, /reconcileConversations\(_convRealtimeScope\)/);
  // Reset must remain reachable ONLY from genuine dataset changes.
  assert.match(html, /function filterConversations\(scope = ''\) \{[\s\S]{0,200}\{ reset: true \}/,
    'search/filter/channel changes still reset, which is correct');
});

test('ordinary Inbox actions do not rewind pagination either', () => {
  // Opening a conversation re-renders the sidebar for its active state. That
  // used to reset to page 1 too - the single most common action in the Inbox.
  for (const fn of ['openConversation', 'sendConvMessage', 'setConvTier']) {
    const i = html.indexOf('function ' + fn);
    if (i < 0) continue;
    const body = html.slice(i, i + 4000);
    assert.ok(!/\n\s*renderConversations\(scope\);/.test(body),
      `${fn} must reconcile, not reset`);
  }
});

test('paging state is per-scope, so the two shells cannot interfere', () => {
  assert.match(html, /const _convPaging = Object\.create\(null\);/);
  assert.match(html, /function convPaging\(scope = ''\)/);
  for (const k of ['pageIndex', 'hasMore', 'loading', 'rows', 'ids', 'observer', 'listEl'])
    assert.ok(html.includes(k + ':'), `per-scope state must own ${k}`);
  // The old shared globals must be gone.
  for (const g of ['_convPageIndex', '_convHasMore', '_convLoadingPage', '_convScrollBound'])
    assert.ok(!new RegExp('let ' + g + '\\b').test(html), `${g} must no longer be a global`);
});

test('a manual fail-safe exists whenever more conversations remain', () => {
  assert.match(html, /Load older conversations<\/button>/);
  assert.match(html, /function renderConvSentinel[\s\S]{0,400}if \(!st\.hasMore \|\| !st\.rows\.length\) \{ if \(existing\) existing\.remove\(\); return; \}/,
    'the control must appear only while more remain');
  assert.match(html, /Loading older conversations…/);
  assert.ok(!/Page \$\{page\} of/.test(block('function renderConvSentinel', 'function setConvMoreState')),
    'no page-number navigation');
});

test('scroll position is preserved across a reconcile', () => {
  assert.match(html, /function convViewportAnchor\(listEl\)/);
  assert.match(html, /function restoreConvViewportAnchor\(listEl, anchor\)/);
  assert.match(html, /const anchor = reconcile \? convViewportAnchor\(listEl\) : null;/);
  // Anchored to a lead id, not a pixel offset, so a row moving to the top does
  // not slide the whole list under the user.
  assert.match(html, /\.conv-item\[data-lead="\$\{CSS\.escape\(anchor\.leadId\)\}"\]/);
  const load = block('async function loadConvPage', 'function convEmptyHtml');
  assert.match(load, /\} else if \(reset\) \{[\s\S]{0,700}listEl\.scrollTop = 0;/,
    'only a genuine dataset change may jump to the top');
  assert.equal((load.match(/listEl\.scrollTop = 0;/g) || []).length, 1,
    'nothing else may reset the scroll position');
});

test('the realtime publication and message append are not regressed', () => {
  const rt = readFileSync(new URL(
    readdirSync(migDir).find(f => f.includes('realtime_publication_communications')), migDir), 'utf8');
  assert.match(rt, /add table public\.communications/i);
  assert.match(html, /if \(msgArea\.querySelector\(`\[data-message-id=/,
    'the duplicate-message guard must remain');
  assert.match(html, /scheduleConvRealtimeRetry/, 'channel recovery must remain');
});

// ── E. Loading states ──────────────────────────────────────────
test('a refresh never blanks a working list', () => {
  const load = block('async function loadConvPage', 'function attachConvInfiniteScroll');
  assert.match(load, /if \(reset && isFirstLoad\)/,
    'only the very first paint may show the loading state');
  assert.match(load, /if \(!listEl\.querySelector\('\.conv-item'\)\) \{[\s\S]{0,300}Error:/,
    'an error must not wipe conversations an agent is working from');
});

// ── F. Security ────────────────────────────────────────────────
test('RLS is inherited, not re-implemented', () => {
  assert.match(mig, /with \(security_invoker = true\)/,
    'the view must stay security_invoker so the caller\'s RLS applies');
  assert.match(mig, /security invoker/i, 'the counts function too');
  assert.ok(!/security definer/i.test(mig), 'nothing here may run with definer rights');
  assert.ok(!/service_role/.test(mig));
});

// ── G. Visual freeze ───────────────────────────────────────────
test('the conversation card markup is unchanged', () => {
  const row = block('function convRowHtml', 'async function loadConvPage');
  for (const frag of [
    'class="conv-item', 'class="conv-avatar"', 'class="conv-info"', 'class="conv-name"',
    'class="conv-phone"', 'class="conv-preview"', 'class="conv-time"',
    'convPriorityChip(_prio, sig)', 'tierBadge(tier)', 'channelBadge(c.type)',
    'preview.slice(0,60)', 'avatarColor(c.lead_id)',
  ]) assert.ok(row.includes(frag), `the card must still render ${frag}`);
  // Pinned literally, because moving the card into its own function is exactly
  // the kind of change that silently restyles it: this dot was briefly rewritten
  // to var(--accent) during that move, turning the unread marker from blue to
  // gold on every conversation row. The freeze is the point of this task.
  assert.ok(row.includes('border-radius:50%;background:#3b82f6;margin-left:4px'),
    'the unread dot must stay exactly as it was - blue, no vertical-align');
  // Exactly one LIVE definition of the card, so the initial list, an appended
  // page and a realtime insert cannot drift apart visually. (The demo branch
  // keeps its own renderer, keyed on c.id rather than c.lead_id.)
  assert.equal((stripJs(html).match(/class="conv-item\$\{c\.lead_id === _activeConvId/g) || []).length, 1,
    'the live conversation card must be defined exactly once');
});

// ── H. tier/priority in SQL match the JavaScript ───────────────
test('the SQL tier and priority transcribe the JS rules exactly', () => {
  // Same constants, so a tuning change in one cannot silently skip the other.
  assert.match(html, /const CONV_TIER_WEIGHT = \{ qualified: 45, hot: 40, warm: 15, new: 10, closed: -100 \};/);
  assert.match(mig, /'qualified' then 45 when 'hot' then 40 when 'warm' then 15/);
  assert.match(html, /const CONV_ESCALATED_BAND = 1000;/);
  assert.match(mig, /then 1000 \+/);
  for (const re of [/deposit\|screenshot\|payment\|paid\|transfer\|receipt/,
                    /complain\|angry\|upset\|refund\|scam\|objection/,
                    /human\|agent\|person\|talk\|speak\|call me/]) {
    assert.match(html, re, 'JS must still carry this reason group');
    assert.match(mig, re, 'and SQL must match it');
  }
  // computeLeadTier's ordering rule: converted is checked FIRST, and a stored
  // manual_tier of 'closed' is ignored, so no manual value can claim a
  // conversion the approval flow withheld.
  assert.match(mig, /when coalesce\(l\.status,'new'\) = 'converted' then 'closed'[\s\S]{0,200}manual_tier <> 'closed'/);
});

test('tier and priority produce identical results in JS and SQL', () => {
  // Runs the real scoring code from index.html against rows whose expected
  // values were computed by the deployed SQL on production (400 sampled rows,
  // 0 mismatches). This fixture pins a representative subset so the two
  // implementations cannot drift apart later without a test failing.
  const tierS = html.indexOf('function computeLeadTier');
  const tierE = html.indexOf('// ── INBOX PRIORITY');
  const scoreS = html.indexOf('const CONV_PRIORITY_REASONS');
  const scoreE = html.indexOf('function convWaitLabel');
  const src = (html.slice(tierS, tierE) + html.slice(scoreS, scoreE)).replace(/^const /gm, 'var ');
  const box = { convWaitLabel: () => 'x' };
  vm.createContext(box);
  vm.runInContext(src, box);

  const cases = [
    // [status, manual_tier, bot_stage, needs_human, handoff_reason, is_unread, direction, hours, tier, score]
    ['converted', null, 'done', false, '', false, 'outbound', 1, 'closed', -100],
    ['new', null, 'awaiting_language', false, '', false, 'outbound', 1, 'new', 10],
    ['new', null, 'awaiting_menu', false, '', true, 'inbound', 2, 'new', 47],
    ['qualified', null, 'x', false, '', false, 'outbound', 1, 'qualified', 45],
    ['pending_approval', null, 'x', false, '', false, 'outbound', 1, 'qualified', 45],
    ['new', null, 'awaiting_deposit_confirm', false, '', false, 'outbound', 1, 'hot', 40],
    ['new', null, 'x', true, 'wants deposit help', false, 'outbound', 1, 'hot', 1080],
    ['new', null, 'x', true, 'angry customer', false, 'outbound', 1, 'warm', 1045],
    ['new', null, 'x', true, 'talk to a person', true, 'inbound', 30, 'warm', 1095],
    ['new', 'warm', 'awaiting_language', false, '', false, 'outbound', 1, 'warm', 15],
    ['new', 'closed', 'awaiting_language', false, '', false, 'outbound', 1, 'new', 10],
  ];
  for (const [status, mt, bs, nh, hr, unread, dir, hours, wantTier, wantScore] of cases) {
    const lead = { status, manual_tier: mt, bot_stage: bs, needs_human: nh,
                   handoff_reason: hr, is_unread: unread };
    assert.equal(box.computeLeadTier(lead), wantTier, `tier for ${status}/${mt}/${bs}/${hr}`);
    const sig = box.convPrioritySignals(lead, { direction: dir, hoursAgo: hours });
    assert.equal(box.convPriority(sig).score, wantScore, `score for ${status}/${hr}/${dir}@${hours}h`);
  }
});

// ── I. Nothing else moved ──────────────────────────────────────
test('this change touches no business rule', () => {
  for (const forbidden of ['approve_deposit_and_convert', 'payroll', 'BOT_REPLIES_ENABLED',
                           'verify_jwt', 'phone_number_id', 'drop policy', 'account_balance']) {
    assert.ok(!mig.toLowerCase().includes(forbidden.toLowerCase()),
      `the Inbox migration must not touch ${forbidden}`);
  }
  // The 24-hour window timer and the send auth-retry must be intact.
  assert.match(html, /const WA_WINDOW_MS = 24 \* 3600000;/);
  assert.match(html, /await sb\.auth\.refreshSession\(\)/);
  assert.match(html, /loadCustomerReactions/, 'customer reactions must still load');
});

// ── Sorting + stable open (Hanzala, 2026-09-05) ────────────────
test('three sort modes exist and the production default is preserved', () => {
  assert.match(html, /const CONV_SORT_MODES = \['priority', 'recent', 'oldest'\];/);
  assert.match(html, /CONV_SORT_LABELS = \{ priority: 'Priority', recent: 'Newest First', oldest: 'Oldest First' \}/);
  // NOT 'priority'. The default was deliberately moved to 'recent' on
  // 2026-08-27 because priority buried very recent unanswered messages behind
  // already-tagged leads. Restoring priority as the default reintroduces that.
  assert.match(html, /let _convSort = 'recent';/,
    "the shipped default must stay 'recent' - see the 2026-08-27 note");
});

test('all three sorts are applied by Postgres over the whole set', () => {
  const qb = block('function buildConvQuery', 'function convRowFromView');
  assert.match(qb, /if \(_convSort === 'priority'\) \{\s*\n\s*q = q\.order\('priority', \{ ascending: false \}\)\.order\('created_at', \{ ascending: false \}\);/,
    'priority keeps the existing ordering, tie-broken by latest activity');
  assert.match(qb, /q = q\.order\('created_at', \{ ascending: _convSort === 'oldest' \}\);/,
    'newest/oldest both order by genuine latest conversation activity');
  assert.match(qb, /return q\.order\('lead_id', \{ ascending: true \}\)/,
    'every sort keeps a deterministic tiebreaker');
  // No client-side re-sorting of the loaded page may creep back in.
  assert.ok(!/sortConvsByPriority\(/.test(stripJs(block('async function loadConvPage', 'function convEmptyHtml'))),
    'the loaded page must not be re-sorted in the browser');
});

test('changing sort is a dataset reset that keeps every other filter', () => {
  const f = block('function setConvSort', 'function cycleConvSort');
  assert.match(f, /filterConversations\(scope\)/,
    'a sort change resets paging to page 1 of the new order');
  assert.ok(!/_activeConvFilter\s*=|_activeConvOps\s*=|_activeConvChannel\s*=|conv-search-input.*value\s*=/.test(f),
    'and must not clear the search, stage, ops or channel filters');
});

test('the sort preference is per-browser, never global', () => {
  // The key became per-user on 2026-09-05; see the user-scoping test below.
  assert.match(html, /localStorage\.setItem\(key, _convSort\)/);
  assert.match(html, /if \(CONV_SORT_MODES\.includes\(saved\)\) _convSort = saved;/);
  // Nothing may write a sort preference to a shared table.
  assert.ok(!/from\('(profiles|settings)'\)[\s\S]{0,200}sort/i.test(html),
    'one agent\'s sort choice must never reach another account');
});

test('REGRESSION: opening a conversation must not move it', () => {
  const open = block('async function openConversation', 'function attachmentKindFromPath');
  // The cause: unread contributes +20 to priority, so clearing it on open
  // dropped the row and the reconcile moved it out from under the agent.
  assert.match(html, /if \(sig\.isUnread\) score \+= 20;/, 'unread still scores - that rule is unchanged');
  assert.match(open, /markConvRowReadInPlace\(convId, scope\)/,
    'read acknowledgement must patch the row in place');
  assert.match(open, /setActiveConvRow\(convId, scope\)/,
    'selecting a row must be a class toggle, not a re-query');
  assert.ok(!/reconcileConversations\(scope\)/.test(stripJs(open)),
    'opening must not trigger a reconcile - that is what reordered the row');
  // Read state is still genuinely written.
  assert.match(open, /update\(\{ is_unread: false \}\)\.eq\('id', convId\)/,
    'read acknowledgement itself must be retained');
});

test('opening a conversation fabricates no activity', () => {
  const open = stripJs(block('async function openConversation', 'function attachmentKindFromPath'));
  assert.ok(!/from\('communications'\)[\s\S]{0,120}\.insert\(/.test(open),
    'opening must never write a message row');
  assert.ok(!/created_at:\s*new Date|created_at:\s*now/.test(open),
    'opening must never stamp a conversation activity timestamp');
  const helper = block('function markConvRowReadInPlace', 'function loadMoreConversations');
  assert.ok(!/created_at/.test(helper), 'the read patch must not touch the sort key');
});

test('the sort control is the only visual addition, in both shells', () => {
  assert.equal((html.match(/data-conv-sort-select/g) || []).length, 3,
    'one control per shell plus the JS selector that syncs them');
  assert.equal((html.match(/onchange="setConvSort\(this\.value,'(agent-)?'\)"/g) || []).length, 2,
    'admin and agent shells each get one');
  for (const opt of ['>Priority<', '>Newest First<', '>Oldest First<'])
    assert.ok(html.includes(opt), `the control must offer ${opt}`);
  // The card itself is untouched.
  const row = block('function convRowHtml', 'async function loadConvPage');
  assert.ok(row.includes('border-radius:50%;background:#3b82f6;margin-left:4px'),
    'the unread dot stays exactly as it was');
});

test('the sort preference is scoped to the authenticated user, not the browser', () => {
  // localStorage is origin/profile scoped, NOT account scoped. The bare
  // 'bt-conv-sort' key meant two people sharing a machine - which happens here -
  // overwrote each other: Badar picking Oldest First silently became Hanzala's
  // next time he signed in on that browser.
  assert.match(html, /function convSortKey\(\) \{[\s\S]{0,240}`bt-conv-sort:\$\{uid\}`/,
    'the storage key must include the authenticated user id');
  assert.match(html, /const uid = currentUser\?\.id;/);
  assert.match(html, /return uid \? `bt-conv-sort:\$\{uid\}` : null;/,
    'with no signed-in user there is no key, so nothing is read or written');

  // Nothing may read or write the bare key any more.
  assert.ok(!/localStorage\.(get|set)Item\(\s*'bt-conv-sort'\s*[,)]/.test(html),
    'the shared un-scoped key must no longer be used');
  assert.ok(!/localStorage\.setItem\(CONV_SORT_KEY,/.test(html));

  // The preference is applied once the user is known, not at parse time.
  assert.match(html, /loadConvSortPreference\(\);   \/\/ per-user Inbox sort/,
    'afterLogin must apply the signed-in user\'s own preference');
  assert.match(html, /function loadConvSortPreference\(\) \{\s*\n\s*_convSort = 'recent';/,
    'and must start from the production default before reading');
  // Signing out must not leak the previous account's choice to the next login.
  assert.match(html, /resetConvSortPreference\(\);   \/\/ the next account/);
  assert.match(html, /function resetConvSortPreference\(\) \{\s*\n\s*_convSort = 'recent';\s*\n\}/);

  // Writes are user-scoped too.
  assert.match(html, /const key = convSortKey\(\);\s*\n\s*if \(key\) \{ try \{ localStorage\.setItem\(key, _convSort\); \} catch \(_\) \{\} \}/,
    'saving must use the per-user key and be a no-op when signed out');

  // Default for a user with no stored preference is unchanged.
  assert.match(html, /let _convSort = 'recent';/);
});
