// Omnichannel Inbox priority ordering - the agent worklist Badar asked for.
//
// The scoring lives inline in index.html like the rest of the CRM, so this
// lifts the pure part out and runs it. What it is protecting: the ordering that
// keeps a deposit screenshot above a converted customer saying thanks, which is
// the whole point of the change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const start = html.indexOf('const CONV_PRIORITY_REASONS');
// Anchored on the last function of the priority block itself, not on whatever
// happens to follow it - the storage-key constant that used to sit here was
// replaced when the sort preference became per-user (2026-09-05).
const end   = html.indexOf('function convSortKey');
assert.ok(start > 0 && end > start, 'The inbox priority block must exist in index.html.');

const sandbox = {
  // The real tier helper is a separate concern with its own history (agents own
  // manual_tier, Badar 2026-07-14); stub it so a tier change there cannot
  // silently rewrite what this test claims about ordering.
  computeLeadTier: lead => lead?.manual_tier || 'new',
  esc: s => String(s),
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end), sandbox);
const { convPrioritySignals, convPriority, convWaitLabel, sortConvsByPriority } = sandbox;

const score = (lead, msg) => convPriority(convPrioritySignals(lead, msg));
const inbound  = hoursAgo => ({ direction: 'inbound',  hoursAgo });
const outbound = hoursAgo => ({ direction: 'outbound', hoursAgo });

// ── The exact case that motivated this: money beats recency ──────────────────
const depositScreenshot = score(
  { manual_tier: 'warm', needs_human: true, handoff_reason: 'sent deposit screenshot' }, inbound(6));
const convertedSayingThanks = score(
  { manual_tier: 'closed', needs_human: false }, inbound(0.05));
assert.ok(
  depositScreenshot.score > convertedSayingThanks.score,
  'A deposit screenshot from 6h ago must outrank a converted customer who just said thanks.',
);
assert.equal(depositScreenshot.label, 'Deposit');
assert.equal(convertedSayingThanks.label, '', 'A converted customer chatting is not a worklist item.');

// ── Escalation reasons rank by what they actually mean ───────────────────────
const esc_ = (reason, tier = 'warm') => score({ manual_tier: tier, needs_human: true, handoff_reason: reason }, inbound(1));
const deposit   = esc_('customer sent payment receipt');
const complaint = esc_('complained about withdrawal delay');
const wantsAgent= esc_('asked to speak to a human');
const generic   = esc_('bot could not understand');
assert.ok(deposit.score > complaint.score, 'Conversion intent outranks a complaint.');
assert.ok(complaint.score > wantsAgent.score, 'A complaint outranks a plain request for a person.');
assert.ok(wantsAgent.score > generic.score, 'An explicit request for a person outranks a generic escalation.');
assert.deepEqual(
  [deposit.label, complaint.label, wantsAgent.label, generic.label],
  ['Deposit', 'Complaint', 'Wants agent', 'Escalated'],
);
for (const p of [deposit, complaint, wantsAgent, generic]) {
  assert.equal(p.tone, 'urgent', 'Every escalation must read as urgent, whatever its reason.');
}

// ── Any escalation outranks any un-escalated lead ────────────────────────────
const hotNotEscalated = score({ manual_tier: 'hot', needs_human: false, is_unread: true }, inbound(20));
assert.ok(generic.score > hotNotEscalated.score,
  'A lead the bot actually handed over outranks one that is merely hot.');
assert.equal(hotNotEscalated.label, 'Waiting 20h',
  'A hot lead gets no duplicate chip - the row already carries a HOT tier badge.');

// ── Waiting time ranks, but cannot outrank the money moment ──────────────────
const waiting3d  = score({ manual_tier: 'warm' }, inbound(72));
const waiting1h  = score({ manual_tier: 'warm' }, inbound(1));
assert.ok(waiting3d.score > waiting1h.score, 'A longer unanswered wait ranks higher.');
assert.ok(depositScreenshot.score > waiting3d.score,
  'A three-day-old question must not outrank a deposit screenshot.');
assert.equal(waiting3d.label, 'Window closed', 'Past 24h only a template can reach them - say so.');
assert.equal(waiting3d.tone, 'closed-window');

// ── Answered conversations sink below waiting ones ───────────────────────────
const answered = score({ manual_tier: 'warm' }, outbound(1));
assert.ok(waiting1h.score > answered.score, 'A customer waiting on us outranks one we already answered.');
assert.equal(answered.label, '', 'Nothing is pending, so there is nothing to chip.');

// ── Unread is a real signal but not a trump card ─────────────────────────────
const unread   = score({ manual_tier: 'warm', is_unread: true }, inbound(1));
assert.ok(unread.score > waiting1h.score, 'Unread ranks above the same conversation already read.');
assert.ok(deposit.score > unread.score, 'Unread does not outrank an escalation.');

// ── Wait labels stay readable at every scale ─────────────────────────────────
assert.equal(convWaitLabel(0.25), '15m');
assert.equal(convWaitLabel(3),    '3h');
assert.equal(convWaitLabel(72),   '3d');
assert.equal(convWaitLabel(0.001), '1m', 'A sub-minute wait must not render as "0m".');

// ── The sort is priority first, recency second ───────────────────────────────
const rows = [
  { id:'old-urgent',  _prio:{ score: 100 }, _sortTime: 1 },
  { id:'new-quiet',   _prio:{ score: 10  }, _sortTime: 99 },
  { id:'new-urgent',  _prio:{ score: 100 }, _sortTime: 50 },
];
assert.deepEqual(Array.from(sortConvsByPriority(rows)).map(r => r.id),
  ['new-urgent', 'old-urgent', 'new-quiet'],
  'Equal priority falls back to most recent; higher priority always wins.');
assert.deepEqual(rows.map(r => r.id), ['old-urgent', 'new-quiet', 'new-urgent'],
  'Sorting must not mutate the caller\'s array - the live path reuses it.');

// ── Static guards: this must stay a display-only change ──────────────────────
const block = html.slice(start, html.indexOf('function tierBadge'));
for (const forbidden of ['sb.from', '.update(', '.insert(', '.upsert(', '.delete(']) {
  assert.ok(!block.includes(forbidden),
    `Inbox priority is presentation only - it must never ${forbidden} anything.`);
}
assert.match(html, /data-conv-sort-label/,
  'Priority ordering must stay reversible from the inbox menu, not be forced on agents.');

console.log('Inbox priority checks passed.');
