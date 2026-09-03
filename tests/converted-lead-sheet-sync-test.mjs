// Converted lead -> private Google Sheet (admin/super-admin only).
//
// This is an OUTPUT layer bolted onto an approval flow that must not change.
// The things worth pinning down are therefore: that the approval transaction is
// untouched, that a Google outage cannot roll back a conversion, that a retry
// cannot produce a second sheet row for the same customer, and that no agent can
// read, queue or trigger any of it.
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
test('one row per converted lead, in the table and in the sheet', () => {
  assert.match(mig, /lead_id\s+uuid not null unique/,
    'the outbox key is lead_id, so a lead can only ever have one job');
  // The sheet write matches on the lead id column, never on name or phone.
  assert.match(fn, /async function leadRowIndex\(token: string, tab: string\)[\s\S]{0,400}sheetsUrl\(a1\(tab, "B:B"\)\)/,
    'the sheet is indexed by the Lead ID column');
  assert.match(fn, /const existing = index\.get\(String\(lead\.id\)\);/);
  assert.match(fn, /if \(existing\) \{[\s\S]{0,300}method: "PUT"/, 'an existing row is updated');
  assert.match(fn, /\} else \{[\s\S]{0,400}method: "POST"/, 'only a new lead is appended');
  assert.match(fn, /index\.set\(String\(lead\.id\), Number\(m\[1\]\)\)/,
    'an appended row is remembered so one batch cannot append the same lead twice');
});

// ── C. Failure must never touch the conversion ─────────────────
test('a Google failure cannot roll back or block an approval', () => {
  const nudge = html.slice(html.indexOf('function nudgeConvertedLeadSheetSync'),
                           html.indexOf('let _sheetSyncUrl'));
  assert.ok(!/await\s+sb\.functions\.invoke/.test(nudge),
    'the post-approval nudge must not be awaited');
  assert.match(nudge, /\.catch\(err =>/, 'and its failure must be swallowed');
  // The nudge happens after the RPC has returned successfully.
  const approve = html.slice(html.indexOf("sb.rpc('approve_deposit_and_convert'"), html.indexOf("sb.rpc('approve_deposit_and_convert'") + 1400);
  assert.ok(approve.indexOf('nudgeConvertedLeadSheetSync()') > approve.indexOf('if (error)'),
    'the nudge must come after the approval succeeded');
  // Unconfigured Google is a status, not a crash.
  assert.match(fn, /return json\(\{ ok: false, configured: false,/);
  assert.match(fn, /reason: "google sheets secrets are not configured"/);
});

test('retries are bounded and backed off', () => {
  assert.match(fn, /const MAX_ATTEMPTS = 6;/);
  assert.match(fn, /\.lt\("attempt_count", MAX_ATTEMPTS\)/, 'exhausted rows stop being picked up');
  assert.match(fn, /const delayMs = Math\.min\(2 \*\* attempts, 32\) \* 60_000;/,
    'exponential backoff, capped - Google must not be hammered');
  assert.match(fn, /\.lte\("next_attempt_at", new Date\(\)\.toISOString\(\)\)/);
});

// ── D. Security ────────────────────────────────────────────────
test('no Google credential can reach the browser', () => {
  for (const secret of ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
                        'GOOGLE_SHEETS_SPREADSHEET_ID', 'oauth2.googleapis.com', 'sheets.googleapis.com']) {
    assert.ok(!html.includes(secret), `${secret} must never appear in the frontend bundle`);
  }
  assert.ok(!/service_role|SERVICE_ROLE/.test(html.slice(html.indexOf('function nudgeConvertedLeadSheetSync'),
                                                          html.indexOf('// ── FINANCIAL LEDGER TAB'))),
    'no service-role credential in the browser');
  // Every secret is read from the environment inside the function.
  for (const env of ['GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY']) {
    assert.ok(fn.includes(`Deno.env.get("${env}")`), `${env} must come from Edge secrets`);
  }
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

test('the Edge Function re-checks the caller role itself', () => {
  assert.match(fn, /const \{ data: profile \} = await admin\.from\("profiles"\)[\s\S]{0,120}\.eq\("id", userRes\.user\.id\)/);
  assert.match(fn, /if \(!profile \|\| !\["admin", "super_admin"\]\.includes\(profile\.role\)\) \{[\s\S]{0,120}403/,
    'an agent token must be refused by the function, not just by the UI');
  assert.match(fn, /if \(!jwt\) return json\(\{ error: "unauthorized" \}, 401\)/);
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
  // The header the sheet is built with.
  for (const h of ['Converted At', 'Lead ID', 'Customer Name', 'Email', 'Phone Number',
                   'Amount Deposited', 'Currency', 'Forwarded By Agent', 'Agent ID',
                   'Approved By', 'Approval Date', 'WhatsApp Channel', 'Lead Source', 'Campaign'])
    assert.ok(fn.includes(`"${h}"`), `the sheet header must include ${h}`);
});

test('the outbox stores no customer PII', () => {
  const create = mig.slice(mig.indexOf('create table if not exists public.converted_lead_sheet_sync'),
                           mig.indexOf('comment on table'));
  for (const pii of ['full_name', 'email', 'phone', 'amount'])
    assert.ok(!create.includes(pii), `the queue must not duplicate ${pii} - it is read at send time`);
});

test('A1 ranges quote the tab name, which is what caused the 404', () => {
  // Google requires single quotes around a sheet name containing a space, and
  // doubling of any literal quote. The tab is "Converted Leads", so the
  // unquoted `Converted Leads!A1:N1` could not be resolved and Google answered
  // 404 "Requested entity was not found" - about the RANGE, not the
  // spreadsheet, which is why the verified id and share looked innocent.
  assert.match(fn, /function quoteTab\(title: string\): string \{\s*\n\s*return `'\$\{title\.replace\(\/'\/g, "''"\)\}'`;/,
    'tab names must be single-quoted with internal quotes doubled');
  assert.match(fn, /const a1 = \(tab: string, ref: string\) => `\$\{quoteTab\(tab\)\}!\$\{ref\}`;/);
  // No raw, unquoted range may survive anywhere.
  assert.ok(!/sheetsUrl\(`\$\{SHEET_TAB\}!/.test(fn),
    'no unquoted tab range may remain');
  assert.equal((fn.match(/sheetsUrl\(a1\(tab, /g) || []).length, 5,
    'all five value ranges - header GET, header PUT, column GET, row UPDATE, row APPEND - go through a1()');
});

test('the tab is resolved from spreadsheet metadata, not assumed', () => {
  assert.match(fn, /fields=spreadsheetId,properties\.title,sheets\.properties\.title/,
    'metadata proves the spreadsheet id and share independently of any range');
  assert.match(fn, /t\.trim\(\)\.toLowerCase\(\) === SHEET_TAB\.trim\(\)\.toLowerCase\(\)/,
    'the configured tab is matched case-insensitively');
  assert.match(fn, /tab: match \?\? tabs\[0\] \?\? SHEET_TAB/,
    'a missing configured tab falls back to the first, and says so');
  assert.match(fn, /configured_tab_found: configuredTabFound/);
});

test('every Google request is labelled so a failure can be attributed', () => {
  for (const label of ['spreadsheet metadata', 'header GET', 'header PUT',
                       'lead-id column GET', 'row UPDATE', 'row APPEND'])
    assert.ok(fn.includes(`"${label}"`), `the ${label} request must be labelled`);
  assert.match(fn, /new Error\(`\$\{label\} -> \$\{res\.status\}: \$\{text\}`\)/,
    'the error must name which request failed');
});
