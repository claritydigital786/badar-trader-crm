// Converted lead -> private Google Sheet (admin/super-admin only).
//
// This is an OUTPUT layer bolted onto an approval flow that must not change.
// The things worth pinning down are therefore: that the approval transaction is
// untouched, that a webhook outage cannot roll back a conversion, that a retry
// cannot produce a second sheet row for the same customer, and that no agent can
// read, queue or trigger any of it.
//
// TRANSPORT CHANGED 2026-09-06: direct Google service-account API calls ->
// a Google Apps Script Web App owned by Muhammad's account. See the header
// comment in supabase/functions/sync-converted-leads-sheet/index.ts for why.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migDir = new URL('../supabase/migrations/', import.meta.url);
const mig = readFileSync(new URL(
  readdirSync(migDir).find(f => f.includes('converted_lead_sheet_sync')), migDir), 'utf8');
const fn = readFileSync(new URL('../supabase/functions/sync-converted-leads-sheet/index.ts', import.meta.url), 'utf8');
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── A. The approval flow is not touched ────────────────────────
test('the approval function itself is not redefined anywhere', () => {
  assert.ok(!/create\s+or\s+replace\s+function\s+public\.approve_deposit_and_convert/i.test(mig),
    'this migration must never redefine the approval transaction');
  for (const forbidden of ['account_balance', 'balance_locked', 'payroll', 'wa_channel']) {
    assert.ok(!new RegExp(`(update|insert into)[^;]*${forbidden}`, 'i').test(mig),
      `the sync layer must not write ${forbidden}`);
  }
});

test('the enqueue is an outbox insert that cannot fail an approval', () => {
  assert.match(mig, /insert into public\.converted_lead_sheet_sync \(lead_id, deposit_document_id\)/);
  assert.match(mig, /on conflict \(lead_id\) do update/,
    'a repeat approval must re-queue the same row, never fail or duplicate');
  // Fires on exactly the approval transition and nothing else.
  const trg = mig.slice(mig.indexOf('function public.enqueue_converted_lead_sheet_sync'),
                        mig.indexOf('drop trigger'));
  assert.match(trg, /new\.document_type is distinct from 'deposit_screenshot' then return new/);
  assert.match(trg, /new\.status is distinct from 'verified' then return new/);
  assert.match(trg, /old\.status is not distinct from 'verified' then return new/,
    're-approving something already verified must not re-fire');
});

// ── B. Idempotency: one row per converted lead ─────────────────
// Idempotency is now enforced on the Apps Script side (see
// google-apps-script/converted-leads-sheet/Code.gs and its own test file);
// this only checks that the outbox key itself still admits one job per lead.
test('one row per converted lead in the outbox table', () => {
  assert.match(mig, /lead_id\s+uuid not null unique/,
    'the outbox key is lead_id, so a lead can only ever have one job');
});

test('the webhook payload carries one row object per due lead, matched by lead_id', () => {
  assert.match(fn, /async function resolveRow\(/, 'row values are resolved server-side, not client-supplied');
  assert.match(fn, /rows = await Promise\.all\(due\.map\(\(job\) => resolveRow\(admin, job\)\)\);/);
  assert.match(fn, /callWebhook\(\{ action: "sync", rows \}, "sheet sync"\)/,
    'the whole due batch is sent as rows for the Apps Script side to upsert by lead_id');
});

// ── C. Failure must never touch the conversion ─────────────────
test('a webhook failure cannot roll back or block an approval', () => {
  const nudge = html.slice(html.indexOf('function nudgeConvertedLeadSheetSync'),
                           html.indexOf('let _sheetSyncUrl'));
  assert.ok(!/await\s+sb\.functions\.invoke/.test(nudge),
    'the post-approval nudge must not be awaited');
  assert.match(nudge, /\.catch\(err =>/, 'and its failure must be swallowed');
  // The nudge happens after the RPC has returned successfully.
  const approve = html.slice(html.indexOf("sb.rpc('approve_deposit_and_convert'"), html.indexOf("sb.rpc('approve_deposit_and_convert'") + 1400);
  assert.ok(approve.indexOf('nudgeConvertedLeadSheetSync()') > approve.indexOf('if (error)'),
    'the nudge must come after the approval succeeded');
  // Unconfigured webhook is a status, not a crash.
  assert.match(fn, /return json\(\{ ok: false, configured: false,/);
  assert.match(fn, /reason: "google sheets webhook is not configured"/);
});

test('a webhook failure backs off the whole due batch, never a partial roll back', () => {
  const syncPath = fn.slice(fn.indexOf('// ── action: sync (default)'));
  assert.match(syncPath, /catch \(e\) \{[\s\S]{0,500}for \(const job of due\) await backoff\(admin, job, msg\);/,
    'every due row must back off together on a webhook failure');
});

test('retries are bounded and backed off', () => {
  assert.match(fn, /const MAX_ATTEMPTS = 6;/);
  assert.match(fn, /\.lt\("attempt_count", MAX_ATTEMPTS\)/, 'exhausted rows stop being picked up');
  assert.match(fn, /const delayMs = Math\.min\(2 \*\* attempts, 32\) \* 60_000;/,
    'exponential backoff, capped - the webhook must not be hammered');
  assert.match(fn, /\.lte\("next_attempt_at", new Date\(\)\.toISOString\(\)\)/);
});

// ── D. Security ────────────────────────────────────────────────
test('no Google or webhook credential can reach the browser', () => {
  for (const secret of ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
                        'GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SHEETS_WEBHOOK_URL',
                        'CONVERTED_LEADS_SHEET_WEBHOOK_SECRET',
                        'oauth2.googleapis.com', 'sheets.googleapis.com', 'script.google.com']) {
    assert.ok(!html.includes(secret), `${secret} must never appear in the frontend bundle`);
  }
  assert.ok(!/service_role|SERVICE_ROLE/.test(html.slice(html.indexOf('function nudgeConvertedLeadSheetSync'),
                                                          html.indexOf('// ── FINANCIAL LEDGER TAB'))),
    'no service-role credential in the browser');
  // The webhook URL and secret are read from Edge secrets only, inside the function.
  for (const env of ['GOOGLE_SHEETS_WEBHOOK_URL', 'CONVERTED_LEADS_SHEET_WEBHOOK_SECRET']) {
    assert.ok(fn.includes(`Deno.env.get("${env}")`), `${env} must come from Edge secrets`);
  }
  // The old direct-API secrets stay configured (per the deployment plan) but
  // the transport code that used to read them for auth is gone.
  assert.ok(!/googleAccessToken|RSASSA-PKCS1|pemToPkcs8/.test(fn),
    'the RS256/service-account signing path must not still run');
});

test('the shared webhook secret travels only in the outbound request body, never a query string', () => {
  const call = fn.slice(fn.indexOf('async function callWebhook'), fn.indexOf('// Resolves one row'));
  assert.match(call, /body: JSON\.stringify\(\{ secret: WEBHOOK_SECRET, \.\.\.body \}\)/);
  // The URL is passed to fetch() as a bare identifier, not built inside a
  // template literal - so there is no string-construction step where the
  // secret could get concatenated into the URL or a query string.
  assert.match(call, /fetch\(WEBHOOK_URL, \{/, 'the request URL must be the bare secret-free identifier');
  assert.ok(!/fetch\(`[^`]*WEBHOOK/.test(fn), 'the request URL must never be built from a template literal');
});

test('the outbox is admin-read-only and browser-write-never', () => {
  assert.match(mig, /alter table public\.converted_lead_sheet_sync enable row level security;/);
  assert.match(mig, /create policy "cls sync: admin read"[\s\S]{0,200}for select\s*\n\s*using \(public\.is_admin\(\)\)/);
  // No write policy at all - not for agents, not for admins.
  assert.ok(!/for (insert|update|delete)/i.test(mig.slice(mig.indexOf('enable row level security'))),
    'no browser session may create or edit a sync job');
});

test('the admin RPCs check the role server-side', () => {
  for (const f of ['retry_converted_lead_sheet_sync', 'backfill_converted_lead_sheet_sync']) {
    const body = mig.slice(mig.indexOf(`function public.${f}`));
    assert.match(body.slice(0, 900), /if not is_admin\(\) then\s*\n\s*raise exception/,
      `${f} must refuse a non-admin`);
    assert.ok(mig.includes(`revoke all on function public.${f}() from public, anon;`),
      `${f} must not be callable by anon`);
  }
});

test('the Edge Function re-checks the caller role itself, for every action', () => {
  assert.match(fn, /const \{ data: profile \} = await admin\.from\("profiles"\)[\s\S]{0,120}\.eq\("id", userRes\.user\.id\)/);
  assert.match(fn, /if \(!profile \|\| !\["admin", "super_admin"\]\.includes\(profile\.role\)\) \{[\s\S]{0,120}403/,
    'an agent token must be refused by the function, not just by the UI');
  assert.match(fn, /if \(!jwt\) return json\(\{ error: "unauthorized" \}, 401\)/);
  // The auth gate runs before the action is even read from the body, so
  // ping/test/sync all sit behind the identical check.
  const authIdx = fn.indexOf('authorized = true;\n  }');
  const actionIdx = fn.indexOf("const action = typeof body.action");
  assert.ok(authIdx > 0 && actionIdx > authIdx,
    'the action must be parsed only after authorization has already been decided');
});

test('the backfill never runs by itself', () => {
  // It must not be called from bootstrap, a tab switch, or the approval path.
  const calls = (stripJs(html).match(/backfill_converted_lead_sheet_sync/g) || []).length;
  assert.equal(calls, 1, 'exactly one call site - the explicit admin button');
  assert.match(html, /async function backfillConvertedSheet\(\) \{\s*\n\s*if \(!confirm\(/,
    'and it must be confirmed before running');
});

// ── E. Field sourcing ──────────────────────────────────────────
test('every sheet value comes from the audited production field', () => {
  // Amount = the approved deposit's ledger row, not AUM and not payroll.
  assert.match(fn, /\.from\("transactions"\)[\s\S]{0,120}\.eq\("deposit_document_id", job\.deposit_document_id\)/,
    'Amount Deposited must come from the transaction tied to THIS approval');
  assert.ok(!/payroll|commission|account_balance/.test(stripJs(fn)),
    'payroll, commission and AUM figures must never be read here');
  // Forwarded By = canonical ownership, resolved server-side.
  assert.match(fn, /\.eq\("id", lead\.assigned_agent_id\)/);
  // Approved By = the approval record.
  assert.match(fn, /\.from\("kyc_documents"\)[\s\S]{0,120}select\("reviewed_by, reviewed_at"\)/);
  assert.match(fn, /\.eq\("id", doc\.reviewed_by\)/);
});

test('the outbox stores no customer PII', () => {
  const create = mig.slice(mig.indexOf('create table if not exists public.converted_lead_sheet_sync'),
                           mig.indexOf('comment on table'));
  for (const pii of ['full_name', 'email', 'phone', 'amount'])
    assert.ok(!create.includes(pii), `the queue must not duplicate ${pii} - it is read at send time`);
});

// ── F. Diagnostics before touching real data ────────────────────
test('a ping action exists that writes nothing', () => {
  // Ends at the "── action: test" comment, not at its `if`, so the ping slice
  // does not accidentally swallow the test action's own leading comment (which
  // mentions the outbox table only to say it must NOT be touched).
  const block = fn.slice(fn.indexOf("if (action === \"ping\")"), fn.indexOf("// ── action: test"));
  assert.ok(!/converted_lead_sheet_sync/.test(block), 'ping must never touch the outbox table');
  assert.match(block, /callWebhook\(\{ action: "ping" \}, "ping"\)/);
});

test('a synthetic test action proves append then update without touching the real queue or a real lead', () => {
  const block = fn.slice(fn.indexOf('if (action === "test") {'), fn.indexOf('if (action !== "sync")'));
  assert.ok(!/converted_lead_sheet_sync/.test(block),
    'the synthetic test must never read or write the outbox table');
  assert.ok(!/\.from\("leads"\)/.test(block), 'the synthetic test must never touch a real lead row');
  assert.match(fn, /const TEST_LEAD_ID_PREFIX = "TEST-SYNTHETIC-";/,
    'the synthetic id must be unmistakably fake and unable to collide with a real UUID');
  assert.match(block, /crypto\.randomUUID\(\)/);
  // Append, then a second call with one changed field, and the response says
  // whether that update actually matched instead of appending a duplicate.
  assert.match(block, /"synthetic append"/);
  assert.match(block, /"synthetic update"/);
  assert.match(block, /idempotent: updateRes\.appended === 0 && updateRes\.updated === 1/);
});

test('ping and test are both gated behind the same admin/internal auth as sync', () => {
  const authEnd = fn.indexOf('let body: Record<string, unknown> = {};');
  const pingIdx = fn.indexOf('if (action === "ping")');
  const testIdx = fn.indexOf('if (action === "test")');
  assert.ok(authEnd > 0 && pingIdx > authEnd && testIdx > authEnd,
    'ping and test must be reachable only after the same authorization block sync uses');
});

// ── G. The Apps Script contract this function depends on ────────
test('the Apps Script source is version-controlled and matches the deployed contract', () => {
  const gs = readFileSync(new URL('../google-apps-script/converted-leads-sheet/Code.gs', import.meta.url), 'utf8');
  assert.match(gs, /var SHEET_TAB = 'Converted Leads';/);
  for (const h of ['Converted At', 'Lead ID', 'Customer Name', 'Email', 'Phone Number',
                   'Amount Deposited', 'Currency', 'Forwarded By Agent', 'Agent ID',
                   'Approved By', 'Approval Date', 'WhatsApp Channel', 'Lead Source', 'Campaign'])
    assert.ok(gs.includes(`'${h}'`), `the Apps Script header must include ${h}`);
  assert.match(gs, /function secretMatches_\(supplied\)/);
  assert.match(gs, /if \(!secretMatches_\(body\.secret\)\)/,
    'the secret must be checked before any read or write');
  assert.match(gs, /var lock = LockService\.getScriptLock\(\);/,
    'a lock must span the read-then-write so a race cannot append twice');
  // No em dashes anywhere in this file, repo-wide standing rule.
  assert.ok(!gs.includes('—'), 'no em dashes in Code.gs');
});
