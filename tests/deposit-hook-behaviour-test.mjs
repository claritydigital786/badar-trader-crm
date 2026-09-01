// The deposit submission endpoint, exercised for real.
//
// This runs the ACTUAL supabase/functions/conversion-hook/index.ts source under
// Node, with only its two external edges swapped: the supabase-js import
// becomes an in-memory stub that records every write, and Deno.serve becomes an
// exported handler. None of the function's own logic is modified, so a change
// that breaks the deposit flow breaks this test.
//
// What it protects, all learned from real production failures on 2026-09-01:
//   - a client submission stores deposit_amount and NEVER account_balance (a
//     submitted amount is not an approved balance, and writing it also tripped
//     the leads_guard_admin_columns trigger and killed every real submission);
//   - the assigned agent gets it first - Ehsan is not notified by the endpoint;
//   - a failure at ANY step leaves zero orphans. The real failed test left an
//     uploaded screenshot and a kyc_documents row behind against a lead that
//     showed no deposit at all, and every retry added another pair.
import assert from 'node:assert/strict';
import { handler, store, reset, multipart } from './helpers/run_conversion_hook.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// The hook validates MIME type and byte size, not PNG internals, so a real
// PNG header plus enough bytes to clear MIN_FILE_BYTES is the honest fixture.
const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8192, 7),
]);
const SHOT = { bytes: pngBytes, name: 'deposit.png', type: 'image/png' };
const LEAD = { id: 'lead-1', full_name: 'Test', phone: null, email: null, status: 'new',
               account_balance: 0, deposit_amount: null, deposit_platform: null,
               deposit_account_ref: null, kyc_status: 'pending', verified: false };
const FIELDS = { lead_id: 'lead-1', name: 'Test', phone: '', email: 't@example.com',
                 platform: 'exness', amount: '500', account: 'TEST-001' };

const submit = () => handler(multipart(FIELDS, SHOT));
const json = r => r.json();

// ══ A. A valid submission ═════════════════════════════════════
{
  reset([LEAD]);
  const body = await json(await submit());
  ok(body.ok === true, 'A: submission accepted');
  ok(body.status === 'pending_approval', 'A: status pending_approval');
  ok(body.notified === 'deferred_to_agent_review', 'A: Ehsan NOT notified - deferred to the agent');
  const lead = store.leads[0];
  ok(lead.deposit_amount === 500, 'A: deposit_amount = 500 (the submitted claim is stored)');
  ok(lead.account_balance === 0, 'A: account_balance UNCHANGED at 0');
  ok(lead.status === 'pending_approval', 'A: lead parked at pending_approval');
  ok(lead.verified === false, 'A: never verified');
  ok(lead.converted_at === undefined, 'A: converted_at never stamped');
  ok(lead.deposit_platform === 'exness' && lead.deposit_account_ref === 'TEST-001', 'A: broker + account ref recorded');
  ok(store.kyc.length === 1 && store.kyc[0].status === 'pending', 'A: one pending deposit_screenshot document');
  ok(store.kyc[0].agent_reviewed_at === undefined, 'A: not yet escalated - it is the agent\'s to review');
  ok(store.objects.size === 1, 'A: exactly one screenshot object stored');
  ok(store.claims.size === 1, 'A: the submission claim is held');
}

// ══ F. Replay / retry ═════════════════════════════════════════
{
  reset([LEAD]);
  await submit();
  const before = { kyc: store.kyc.length, obj: store.objects.size, amt: store.leads[0].deposit_amount };
  const replays = [];
  for (let i = 0; i < 4; i++) replays.push(await json(await submit()));
  ok(replays.every(r => r.ok && r.duplicate === true), 'F: every repeat is reported as a duplicate');
  ok(store.kyc.length === before.kyc, 'F: no duplicate kyc_documents rows (' + store.kyc.length + ')');
  ok(store.objects.size === before.obj, 'F: no duplicate screenshot objects (' + store.objects.size + ')');
  ok(store.leads[0].deposit_amount === before.amt, 'F: deposit_amount unchanged by replays');
  ok(store.leads[0].account_balance === 0, 'F: still no account_balance, so no double AUM');
  ok(store.claims.size === 1, 'F: still one claim');
}

// ══ G. Forced failures leave ZERO orphans ═════════════════════
for (const mode of ['upload', 'kycInsert', 'leadsUpdate']) {
  reset([LEAD]);
  store.fail[mode] = true;
  const res = await submit();
  const body = await json(res);
  ok(res.status === 500 && body.ok === false, `G[${mode}]: the submission fails loudly`);
  ok(store.kyc.length === 0, `G[${mode}]: ZERO orphan kyc_documents rows`);
  ok(store.objects.size === 0, `G[${mode}]: ZERO orphan storage objects`);
  ok(store.claims.size === 0, `G[${mode}]: ZERO orphan submission claims (retry is treated as first)`);
  ok(store.logs.length === 0, `G[${mode}]: no activity line written`);
  const l = store.leads[0];
  ok(l.status === 'new', `G[${mode}]: lead status unchanged`);
  ok(l.account_balance === 0, `G[${mode}]: balance unchanged`);
  ok(l.kyc_status === 'pending', `G[${mode}]: kyc_status unchanged`);
  ok(l.deposit_amount === null || l.deposit_amount === undefined || mode !== 'leadsUpdate',
     `G[${mode}]: no deposit data written`);

  // ...and the customer's retry then succeeds cleanly.
  store.fail[mode] = false;
  const retry = await json(await submit());
  ok(retry.ok === true && retry.duplicate === false,
     `G[${mode}]: the retry is accepted as a FIRST submission, not a replay`);
  ok(store.kyc.length === 1 && store.objects.size === 1,
     `G[${mode}]: retry leaves exactly one document and one object`);
}

// ══ The guard column is never touched ═════════════════════════
{
  reset([LEAD]);
  await submit();
  const l = store.leads[0];
  ok(l.account_balance === 0 && l.kyc_status === 'pending',
     'neither guarded column (account_balance, kyc_status) is written by the hook');
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
