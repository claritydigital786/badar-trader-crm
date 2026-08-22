// The rules that stop agents being flooded. This is the test that has to hold:
// the flood in July is why notifications have been off since 21 July 2026.
import assert from 'node:assert/strict';
import {
  shouldNotifyAgent, normalizeNotifyPhone, DEFAULT_COOLDOWN_MINUTES,
} from '../_shared/agent_notify_policy.mjs';

const NOW = new Date('2026-08-22T12:00:00Z').getTime();
const minsAgo = m => new Date(NOW - m * 60000).toISOString();

// ── The exact scenario that caused the flood ────────────────────────────────
// A customer fires four messages in twenty seconds. Only the first may notify.
{
  let leadAlreadyNotified = false;
  let agentLastNotifiedAt = null;
  const sent = [];
  for (let i = 0; i < 4; i++) {
    const d = shouldNotifyAgent({
      agentPhone: '923001234567', leadAlreadyNotified, agentLastNotifiedAt,
      now: NOW + i * 5000,
    });
    if (d.notify) { sent.push(i); leadAlreadyNotified = true; agentLastNotifiedAt = new Date(NOW + i * 5000).toISOString(); }
  }
  assert.deepEqual(sent, [0], 'Four escalations in twenty seconds must produce exactly one notification.');
}

// ── Rule 1: test mode is an absolute allowlist ──────────────────────────────
{
  const testNumbers = ['+92 300 6960632', '923362391119'];
  assert.equal(shouldNotifyAgent({ agentPhone: '923006960632', now: NOW, testNumbers }).notify, true,
    'A number on the test allowlist is reachable.');
  assert.equal(shouldNotifyAgent({ agentPhone: '+92-336-2391119', now: NOW, testNumbers }).notify, true,
    'Formatting must not matter - digits are compared.');
  assert.equal(shouldNotifyAgent({ agentPhone: '923342224925', now: NOW, testNumbers }).notify, false,
    'A REAL agent must be unreachable while test mode is on. This is the safety net.');
  // Every other rule passing must not override the allowlist.
  assert.equal(shouldNotifyAgent({
    agentPhone: '923342224925', leadAlreadyNotified: false, agentLastNotifiedAt: null,
    now: NOW, testNumbers,
  }).notify, false, 'Test mode outranks every other rule.');
}
{
  assert.equal(shouldNotifyAgent({ agentPhone: '923342224925', now: NOW, testNumbers: [] }).notify, true,
    'An empty allowlist means normal operation, not a total block.');
}

// ── Rule 2: one ping per lead ───────────────────────────────────────────────
assert.equal(shouldNotifyAgent({ agentPhone: '923001234567', leadAlreadyNotified: true, now: NOW }).notify, false,
  'An agent already told about this lead is not told again.');

// ── Rule 3: per-agent cooldown across different leads ───────────────────────
assert.equal(shouldNotifyAgent({ agentPhone: '923001234567', agentLastNotifiedAt: minsAgo(5), now: NOW }).notify, false,
  'Ten leads at once must not mean ten messages.');
assert.equal(shouldNotifyAgent({ agentPhone: '923001234567', agentLastNotifiedAt: minsAgo(31), now: NOW }).notify, true,
  'Past the cooldown, the next lead may notify.');
assert.equal(shouldNotifyAgent({ agentPhone: '923001234567', agentLastNotifiedAt: minsAgo(29), now: NOW }).notify, false,
  'Just inside the window still blocks.');
assert.equal(shouldNotifyAgent({
  agentPhone: '923001234567', agentLastNotifiedAt: minsAgo(10), now: NOW, cooldownMinutes: 5,
}).notify, true, 'The cooldown length is configurable.');

// ── Failing closed ──────────────────────────────────────────────────────────
assert.equal(shouldNotifyAgent({ agentPhone: '', now: NOW }).notify, false, 'No phone, no send.');
assert.equal(shouldNotifyAgent({ agentPhone: null, now: NOW }).notify, false, 'Null phone, no send.');
assert.equal(shouldNotifyAgent({ agentPhone: '923001234567', agentLastNotifiedAt: 'not-a-date', now: NOW }).notify, false,
  'An unreadable timestamp must stay quiet rather than be read as "long ago".');
assert.equal(normalizeNotifyPhone('+92 (300) 123-4567'), '923001234567');
assert.equal(normalizeNotifyPhone(undefined), '');

// ── A quiet decision always explains itself, for the comm log ───────────────
for (const args of [
  { agentPhone: '' },
  { agentPhone: '923001234567', leadAlreadyNotified: true },
  { agentPhone: '923001234567', agentLastNotifiedAt: minsAgo(1) },
  { agentPhone: '923009999999', testNumbers: ['923001234567'] },
]) {
  const d = shouldNotifyAgent({ ...args, now: NOW });
  assert.equal(d.notify, false);
  assert.ok(d.reason && d.reason.length > 5, 'Every block states why, so a silent inbox is explainable.');
}

assert.equal(DEFAULT_COOLDOWN_MINUTES, 30);
console.log('agent-notify-policy: all assertions passed.');
