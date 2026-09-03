// Runs the REAL google-apps-script/converted-leads-sheet/Code.gs source in a
// stubbed Apps Script environment, so the idempotency and auth behaviour is
// proven by executing the actual deployed logic rather than reading it.
//
// This exists because the whole point of the synthetic-test admin button is to
// prove append-then-update works before real conversions ever reach it, and
// that proof should not depend on a live Google round trip to be checked in
// CI. The stub simulates exactly the four Apps Script services Code.gs calls
// (PropertiesService, SpreadsheetApp, LockService, ContentService) with a
// small in-memory sheet, nothing more.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const gsSrc = readFileSync(new URL('../google-apps-script/converted-leads-sheet/Code.gs', import.meta.url), 'utf8');

const SECRET = 'test-secret-value-not-the-real-one';

function makeSandbox() {
  // A 2D array standing in for one sheet's cell contents. Rows are 0-indexed
  // internally; Code.gs's own getRange calls are 1-indexed, matching real
  // Sheets semantics.
  const grid = [];
  const ensureRow = (r) => { while (grid.length < r) grid.push([]); };
  const ensureCols = (row, n) => { while (row.length < n) row.push(''); };

  const sheet = {
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const gridRow = grid[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < numCols; c++) line.push(gridRow[col - 1 + c] ?? '');
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            ensureRow(row + r);
            const gridRow = grid[row - 1 + r];
            ensureCols(gridRow, col - 1 + values[r].length);
            for (let c = 0; c < values[r].length; c++) gridRow[col - 1 + c] = values[r][c];
          }
        },
      };
    },
    getLastRow() { return grid.length; },
    appendRow(values) { grid.push(values.slice()); },
    setFrozenRows() {},
  };

  const properties = { CONVERTED_LEADS_SHEET_WEBHOOK_SECRET: SECRET };

  const sandbox = {
    grid, // exposed for assertions
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (name) => properties[name] ?? null }),
    },
    SpreadsheetApp: {
      getActive: () => ({
        getName: () => 'Badar Trader - Converted Leads (test)',
        getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST/edit',
        getSheetByName: (name) => (name === 'Converted Leads' ? sheet : null),
        insertSheet: () => sheet,
      }),
      flush() {},
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput(text) {
        return { _text: text, setMimeType() { return this; } };
      },
    },
    JSON, String, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(gsSrc, sandbox);
  return sandbox;
}

function post(sandbox, bodyObj) {
  const result = sandbox.doPost({ postData: { contents: JSON.stringify(bodyObj) } });
  return JSON.parse(result._text);
}

test('a wrong secret is rejected before anything is read or written', () => {
  const sb = makeSandbox();
  const res = post(sb, { secret: 'wrong', action: 'ping' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'unauthorized');
  assert.equal(sb.grid.length, 0, 'nothing may be written on a rejected request');
});

test('a missing secret is rejected the same way', () => {
  const sb = makeSandbox();
  const res = post(sb, { action: 'ping' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'unauthorized');
});

test('ping succeeds with the right secret and writes nothing', () => {
  const sb = makeSandbox();
  const res = post(sb, { secret: SECRET, action: 'ping' });
  assert.equal(res.ok, true);
  assert.equal(res.pong, true);
  assert.equal(res.tab, 'Converted Leads');
  assert.equal(sb.grid.length, 0);
});

test('the header is created on the first real write, once', () => {
  const sb = makeSandbox();
  post(sb, { secret: SECRET, rows: [{ lead_id: 'L1', full_name: 'Test One' }] });
  assert.equal(sb.grid[0][1], 'Lead ID', 'header row must be written before any data row');
  assert.equal(sb.grid.length, 2, 'header plus exactly one data row');
});

test('a new lead_id is appended, a repeated lead_id is updated in place - not duplicated', () => {
  const sb = makeSandbox();
  const r1 = post(sb, { secret: SECRET, rows: [{ lead_id: 'LEAD-A', full_name: 'First Name', amount: '100' }] });
  assert.equal(r1.appended, 1);
  assert.equal(r1.updated, 0);
  assert.equal(sb.grid.length, 2);

  // Same lead_id again, one field changed - this is the exact scenario the
  // admin panel's "Run synthetic test" button exercises before real data.
  const r2 = post(sb, { secret: SECRET, rows: [{ lead_id: 'LEAD-A', full_name: 'First Name', amount: '200' }] });
  assert.equal(r2.appended, 0, 'a repeat lead_id must not append');
  assert.equal(r2.updated, 1, 'a repeat lead_id must update the existing row');
  assert.equal(sb.grid.length, 2, 'still header + exactly one data row, not two');
  assert.equal(sb.grid[1][5], '200', 'the update must actually have landed - amount column');
});

test('two rows for the same lead_id inside ONE batch do not duplicate either', () => {
  const sb = makeSandbox();
  const res = post(sb, {
    secret: SECRET,
    rows: [
      { lead_id: 'LEAD-B', full_name: 'Batch Test', amount: '1' },
      { lead_id: 'LEAD-B', full_name: 'Batch Test', amount: '2' },
    ],
  });
  assert.equal(res.appended, 1, 'only the first occurrence in the batch may append');
  assert.equal(res.updated, 1, 'the second occurrence in the same batch must update, not append');
  assert.equal(sb.grid.length, 2, 'header + exactly one data row for LEAD-B');
  assert.equal(sb.grid[1][5], '2', 'the later value in the batch must be what lands');
});

test('a row with no lead_id is silently skipped, not written as a blank row', () => {
  const sb = makeSandbox();
  const res = post(sb, { secret: SECRET, rows: [{ full_name: 'No id here' }, { lead_id: '', full_name: 'Also none' }] });
  assert.equal(res.appended, 0);
  assert.equal(res.updated, 0);
  // ensureHeader_ runs whenever the batch is non-empty, before the per-row
  // loop decides which rows to skip - so the header can exist even when every
  // row in this particular call was skipped. That is harmless (idempotent,
  // and the header would be needed for the next real row regardless); what
  // matters is that no BLANK data row was appended for the id-less rows.
  assert.equal(sb.grid.length, 1, 'only the header may exist - no blank data row');
  assert.equal(sb.grid[0][1], 'Lead ID');
});

test('an empty rows array is a no-op that still reports success', () => {
  const sb = makeSandbox();
  const res = post(sb, { secret: SECRET, rows: [] });
  assert.equal(res.ok, true);
  assert.equal(res.appended, 0);
  assert.equal(res.updated, 0);
  assert.equal(sb.grid.length, 0);
});

test('the response reports the spreadsheet identity, for the admin panel diagnostics', () => {
  const sb = makeSandbox();
  const res = post(sb, { secret: SECRET, action: 'ping' });
  assert.equal(res.spreadsheet, 'Badar Trader - Converted Leads (test)');
  assert.match(res.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
});
