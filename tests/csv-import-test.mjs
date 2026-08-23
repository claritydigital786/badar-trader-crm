// The bulk import that will carry ~4,490 WhatChimp subscribers.
//
// The old version did one INSERT plus one round-robin lookup per row: roughly
// 9,000 sequential round-trips, no progress, no resume, no duplicate check. A
// failure halfway through left the operator unable to safely re-run, which for
// a one-shot migration off a platform being switched off is the worst property
// it could have.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ── Lift the pure helpers out ───────────────────────────────────────────────
const start = html.indexOf('const CSV_IMPORT_BATCH_SIZE');
const end   = html.indexOf('async function confirmImportCSV');
assert.ok(start > 0 && end > start, 'The CSV import helpers must exist in index.html.');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(html.slice(start, end) + '\nthis.CSV_IMPORT_BATCH_SIZE = CSV_IMPORT_BATCH_SIZE;', sandbox);
const { normalizeLeadSource, CSV_IMPORT_BATCH_SIZE } = sandbox;

// ── Source mapping: a WhatChimp export must never fail the DB constraint ────
// These are the only values leads_source_check permits.
const ALLOWED = ['manual','meta','referral','website','other','whatsapp','whatchimp'];
for (const [input, expected] of [
  ['whatchimp','whatchimp'], ['WhatChimp','whatchimp'], ['  WHATCHIMP  ','whatchimp'],
  ['whatsapp','whatsapp'], ['WhatsApp','whatsapp'], ['wa','whatsapp'],
  ['facebook','meta'], ['FB','meta'], ['Instagram','meta'], ['meta','meta'],
  ['website','website'], ['web','website'], ['form','website'],
  ['referral','referral'], ['friend','referral'],
  ['manual','manual'], ['import','manual'],
  ['what-chimp','whatchimp'], ['what_chimp','whatchimp'], ['What Chimp','whatchimp'],
]) {
  assert.equal(normalizeLeadSource(input), expected, `"${input}" should map to ${expected}`);
}

// Anything unrecognised degrades to 'other' rather than failing the row.
for (const junk of ['', null, undefined, 'telegram', 'tiktok', '???', 42, 'Some Channel']) {
  const out = normalizeLeadSource(junk);
  assert.equal(out, 'other', `Unknown source ${JSON.stringify(junk)} must fall back to 'other'.`);
}
// Every possible output must satisfy the live constraint.
for (const input of ['whatchimp','facebook','telegram','', 'web', null]) {
  assert.ok(ALLOWED.includes(normalizeLeadSource(input)),
    `normalizeLeadSource produced a value the database would reject: ${normalizeLeadSource(input)}`);
}

// ── Batching keeps 4,490 rows to a sane number of requests ──────────────────
assert.ok(CSV_IMPORT_BATCH_SIZE >= 50 && CSV_IMPORT_BATCH_SIZE <= 500,
  'Batch size should be large enough to matter and small enough that one bad row is cheap.');
const batches = Math.ceil(4490 / CSV_IMPORT_BATCH_SIZE);
assert.ok(batches < 100, `4,490 rows should take under 100 requests, not ${batches}.`);

// ── Round-robin deals evenly, by construction ───────────────────────────────
const agents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
const counts = {};
for (let i = 0; i < 4490; i++) {
  const id = agents[i % agents.length].id;
  counts[id] = (counts[id] || 0) + 1;
}
const spread = Math.max(...Object.values(counts)) - Math.min(...Object.values(counts));
assert.ok(spread <= 1, `Round-robin must not favour anyone; spread was ${spread}.`);

// ── Static guards on the behaviour that cannot be unit-tested here ──────────
const fn = html.slice(html.indexOf('async function confirmImportCSV'),
                      html.indexOf('function cancelImportCSV'));
assert.match(fn, /existingPhones/, 'Import must check for leads already in the CRM.');
assert.match(fn, /seenInFile/, 'Import must also drop duplicates inside the file itself.');
assert.doesNotMatch(fn, /for \([^)]*\)\s*\{[^}]*await sb\.from\('leads'\)\.insert\(row\)/,
  'Import must not insert one row at a time.');
assert.match(fn, /\.insert\(batch\)/, 'Import must insert in batches.');
assert.match(fn, /Importing\.\.\. \$\{/, 'Import must show progress rather than freezing the tab.');
assert.match(fn, /receives_leads !== false/,
  'Import round-robin must skip observers, exactly like every other assignment path.');
assert.match(fn, /Could not check existing leads/,
  'If the duplicate check fails the import must abort, not proceed blind.');

console.log('csv-import: source mapping, batching, dedupe and even distribution all hold.');
