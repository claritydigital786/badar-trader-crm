// Omnichannel Inbox realtime: publication + client lifecycle.
//
// The production bug this locks down (confirmed on vfskqzgphrunjxquqpks,
// 2026-09-03): startConvRealtime() had subscribed to postgres_changes on
// public.communications since the Inbox was built, but `supabase_realtime`
// had puballtables=false and ZERO tables attached, and no migration in the
// repo's history had ever touched the publication. Postgres never emitted the
// rows, so every inbound WhatsApp message needed a manual Cmd+R.
//
// Two halves are asserted here, because either one alone still ships a broken
// Inbox: the migration that actually publishes the table, and the client
// lifecycle that has to survive an error, a timeout, a backgrounded tab and a
// dropped socket without going silently dead (or degenerating into polling).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migDir = new URL('../supabase/migrations/', import.meta.url);
const migName = readdirSync(migDir).find(f => f.includes('realtime_publication_communications'));
const mig = readFileSync(new URL(migName, migDir), 'utf8');

// ── A. Migration ───────────────────────────────────────────────
test('migration publishes public.communications to supabase_realtime', () => {
  assert.match(mig, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.communications/i);
});

test('migration is idempotent - re-running cannot error production', () => {
  // Must check pg_publication_tables before adding: ALTER PUBLICATION ... ADD
  // TABLE throws "relation is already member of publication" on a re-run, and
  // this file has to survive being applied twice.
  assert.match(mig, /pg_publication_tables/i, 'must check current membership first');
  assert.match(mig, /if\s+exists\s*\(/i, 'must short-circuit when already published');
  assert.match(mig, /pg_publication\b/i, 'must tolerate a missing publication');
});

test('migration adds ONLY communications - no blanket publication', () => {
  const adds = [...mig.matchAll(/add\s+table\s+([a-z_.]+)/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual(adds, ['public.communications'],
    'exactly one table may be published; nothing subscribes to leads or reactions');
  assert.doesNotMatch(mig, /for\s+all\s+tables/i, 'must never publish every public table');
});

test('migration does not weaken RLS or touch protected objects', () => {
  assert.doesNotMatch(mig, /drop\s+policy|create\s+policy|alter\s+policy/i);
  assert.doesNotMatch(mig, /disable\s+row\s+level\s+security/i);
  assert.doesNotMatch(mig, /service_role/i);
  // Explicitly out of scope per the change brief.
  for (const forbidden of ['approve_deposit_and_convert', 'payroll', 'wa_channel', 'BOT_REPLIES_ENABLED']) {
    assert.ok(!mig.includes(forbidden), `migration must not touch ${forbidden}`);
  }
});

test('REPLICA IDENTITY is left alone (handlers read payload.new only)', () => {
  assert.doesNotMatch(mig, /replica\s+identity\s+full/i,
    'FULL would push every old row version - and customer message bodies - into the WAL for no gain');
});

// ── B. Client: the subscription still targets the published table ──
test('client subscribes to exactly the table the migration publishes', () => {
  const subs = [...html.matchAll(/table:\s*'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(subs.includes('communications'), 'communications subscription must still exist');
  assert.deepEqual([...new Set(subs)], ['communications'],
    'if a new table is subscribed it must also be added to the publication');
});

test('reactions are batch-loaded, not subscribed - so they need no publication', () => {
  assert.match(html, /loadCustomerReactions\s*\(/, 'batch loader must still exist');
  assert.ok(!/table:\s*'communication_customer_reactions'/.test(html),
    'no reaction subscription exists; publishing that table would be dead WAL traffic');
});

// ── C. Client lifecycle behaviour ──────────────────────────────
// The lifecycle helpers are top-level functions, so they lift out and run for
// real. `let` does not bind onto a vm context global, so the extracted state
// declarations are rewritten to `var` - the functions are untouched.
function loadLifecycle() {
  const varsStart = html.indexOf('let _convRealtimeSub = null;');
  const varsEnd   = html.indexOf('\n', html.indexOf('let _convRealtimeRetryTimer'));
  const fnStart   = html.indexOf('function startConvRealtime(scope');
  const fnEnd     = html.indexOf('let _payrollSettings');
  assert.ok(varsStart > 0 && fnStart > 0 && fnEnd > fnStart, 'realtime block must be locatable');

  const src = (html.slice(varsStart, varsEnd) + '\n' + html.slice(fnStart, fnEnd))
    .replace(/^let /gm, 'var ');

  const timers = [];
  const box = {
    demoMode: false,
    renderCalls: [],
    removedChannels: [],
    listeners: {},
    console,
    CSS: { escape: s => String(s).replace(/"/g, '\\"') },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    document: {
      hidden: false,
      addEventListener(ev, fn) { (box.listeners[ev] ||= new Set()).add(fn); },
      removeEventListener(ev, fn) { box.listeners[ev]?.delete(fn); },
      getElementById: () => null,
    },
    // 2026-09-05: the realtime paths reconcile the loaded depth instead of
    // re-rendering from page 1, so that is what they call now.
    renderConversations: scope => box.renderCalls.push(scope),
    reconcileConversations: scope => box.renderCalls.push(scope),
    appendConvDaySeparatorIfNeeded: () => {},
    applyDeliveryTickUpdate: () => {},
  };
  // Minimal Supabase channel-builder stand-in: records the status callback so
  // the test can drive SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED.
  box.channelObj = { state: 'joined' };
  box.sb = {
    channel() {
      const ch = box.channelObj;
      ch.on = () => ch;
      ch.subscribe = cb => { box.statusCb = cb; return ch; };
      return ch;
    },
    removeChannel: ch => box.removedChannels.push(ch),
  };
  vm.createContext(box);
  vm.runInContext(src, box);
  box.timers = timers;
  return box;
}

test('SUBSCRIBED reconciles the list and clears the backoff', () => {
  const b = loadLifecycle();
  b.startConvRealtime('agent-');
  b.statusCb('SUBSCRIBED');
  assert.deepEqual(b.renderCalls, ['agent-'],
    'one reconcile on (re)subscribe - realtime does not replay missed INSERTs');
  assert.equal(b._convRealtimeRetries, 0);
});

test('CHANNEL_ERROR / TIMED_OUT / CLOSED each schedule a reconnect', () => {
  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
    const b = loadLifecycle();
    b.startConvRealtime('');
    b.statusCb(status);
    assert.equal(b.timers.length, 1, `${status} must trigger recovery, not silent death`);
  }
});

test('reconnect backs off 2s,4s,8s,16s,30s and holds - never a poll loop', () => {
  const b = loadLifecycle();
  b.startConvRealtime('');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    b.statusCb('CHANNEL_ERROR');            // channel fails again
    const t = b.timers[b.timers.length - 1];
    seen.push(t.ms);
    t.fn();                                 // fire the reconnect (carries the count)
  }
  assert.deepEqual(seen, [2000, 4000, 8000, 16000, 30000, 30000],
    'backoff must grow and cap - a fixed 2s retry would be the aggressive polling this forbids');
});

test('leaving the Inbox cancels the pending reconnect and detaches listeners', () => {
  const b = loadLifecycle();
  b.startConvRealtime('');
  b.statusCb('CHANNEL_ERROR');
  assert.equal(b.listeners.visibilitychange.size, 1, 'listener attached while in Inbox');
  b.stopConvRealtime();
  assert.ok(b.timers[0].cancelled, 'no reconnect may fire after the user leaves the Inbox');
  assert.equal(b.listeners.visibilitychange.size, 0, 'visibility listener must be removed');
  assert.equal(b._convRealtimeSub, null);
  assert.equal(b.removedChannels.length, 1, 'channel must be handed back to supabase-js');
});

test('re-entering the Inbox builds a fresh working subscription', () => {
  const b = loadLifecycle();
  b.startConvRealtime('');
  b.stopConvRealtime();
  b.startConvRealtime('agent-');
  assert.ok(b._convRealtimeSub, 'a new channel must exist after returning');
  b.statusCb('SUBSCRIBED');
  assert.deepEqual(b.renderCalls, ['agent-'], 'and it must reconcile under the new scope');
});

test('foregrounding a healthy tab reconciles; a dead one reconnects', () => {
  const b = loadLifecycle();
  b.startConvRealtime('');
  b.document.hidden = true;
  b.handleConvRealtimeVisibility();
  assert.equal(b.renderCalls.length, 0, 'a hidden tab must do nothing');

  b.document.hidden = false;
  b.handleConvRealtimeVisibility();
  assert.equal(b.renderCalls.length, 1, 'joined channel: reconcile whatever was missed while hidden');

  b.channelObj.state = 'errored';
  b.handleConvRealtimeVisibility();
  assert.equal(b.timers.filter(t => !t.cancelled).length, 1, 'dropped socket: reconnect promptly');
});

test('demo mode never opens a realtime channel', () => {
  const b = loadLifecycle();
  b.demoMode = true;
  b.startConvRealtime('');
  assert.equal(b._convRealtimeSub, null);
});

// ── D. No duplicate bubbles ────────────────────────────────────
test('an already-rendered message is not appended a second time', () => {
  // The send path deliberately does not paint the agent's own outbound bubble
  // (it was removed for latency), and openConversation() can race a realtime
  // INSERT for the same row. Both paths stamp data-message-id, so the guard
  // has to key on that.
  const guard = html.match(/if \(msgArea\.querySelector\(`\[data-message-id="\$\{CSS\.escape\(String\(payload\.new\.id\)\)\}"\]`\)\) return;/);
  assert.ok(guard, 'realtime append must bail when the row is already on screen');

  const idx = html.indexOf('if (msgArea.querySelector(`[data-message-id=');
  const appendIdx = html.indexOf('msgArea.appendChild(div)', idx);
  assert.ok(appendIdx > idx, 'the guard must sit before the append, not after it');

  // Both render paths must actually emit the attribute the guard reads.
  const stamps = html.match(/data-message-id="\$\{esc\(id\)\}"/g) || [];
  assert.ok(stamps.length >= 1, 'messageActionButtonHtml must stamp the row id');
  assert.ok(html.includes('messageActionButtonHtml({ id:payload.new.id'), 'realtime path stamps it');
  assert.ok(html.includes('messageActionButtonHtml({ id:m.id'), 'full-render path stamps it');
});

// ── E. Protected surfaces untouched ────────────────────────────
test('this change touches no credential, bot, deposit, payroll or hierarchy path', () => {
  assert.match(html, /verify_jwt|conversion-hook|approve_deposit_and_convert|BOT_REPLIES_ENABLED/,
    'sanity: those systems still exist in the file');
  // The realtime block itself must not reach into any of them.
  const s = html.indexOf('function startConvRealtime(scope');
  const e = html.indexOf('let _payrollSettings');
  const block = html.slice(s, e);
  for (const forbidden of ['approve_deposit_and_convert', 'wa_channel', 'BOT_REPLIES_ENABLED',
                           'payroll', 'service_role', 'phone_number_id']) {
    assert.ok(!block.includes(forbidden), `realtime code must not reference ${forbidden}`);
  }
});
