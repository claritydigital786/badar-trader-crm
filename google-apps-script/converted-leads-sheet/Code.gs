/**
 * Badar Trader CRM - Converted Leads sheet writer.
 *
 * Receives converted-lead rows from the Supabase Edge Function
 * sync-converted-leads-sheet and upserts them into this spreadsheet.
 *
 * WHY THIS EXISTS: the Google service-account route (Sheets API + Drive API,
 * signed as a service account) was abandoned after conclusive testing on
 * 2026-09-06 proved the account could not see ANY file - two spreadsheets,
 * three shares, both the Sheets and Drive APIs, all 404 - despite correct
 * identity, a live key and both APIs enabled, both from the Edge Function AND
 * from an identical script run locally outside Supabase entirely. This script
 * runs as the sheet's own owner (deployed "Execute as: Me"), so no external
 * grant is involved in reading or writing the sheet at all.
 *
 * SECURITY: a Web App deployed with "Anyone" access is reachable by URL, so
 * the shared secret IS the access control. It is read from Script Properties
 * and is never written into this file. A request whose secret does not match
 * is rejected before anything is read or written.
 *
 * IDEMPOTENCY: Lead ID (column B) is the unique key. An existing Lead ID is
 * UPDATED in place; only a genuinely new one is appended. A script lock is
 * held across the read-then-write so two near-simultaneous syncs cannot both
 * conclude a lead is missing and append it twice.
 *
 * DEPLOYMENT (paste this whole file into Extensions > Apps Script on the
 * target spreadsheet, replacing the default stub):
 *   1. Project Settings > Script Properties > add
 *      CONVERTED_LEADS_SHEET_WEBHOOK_SECRET with a strong random value.
 *   2. Deploy > New deployment > type "Web app".
 *   3. Execute as: Me. Who has access: Anyone.
 *   4. Deploy, authorise, copy the /exec URL into the CRM's
 *      GOOGLE_SHEETS_WEBHOOK_URL secret, and the same secret value into
 *      CONVERTED_LEADS_SHEET_WEBHOOK_SECRET.
 *   5. After any code change here, Deploy > Manage deployments > edit the
 *      existing deployment > New version > Deploy, or the /exec URL keeps
 *      serving the old code.
 */

var SHEET_TAB = 'Converted Leads';

var HEADER = [
  'Converted At', 'Lead ID', 'Customer Name', 'Email', 'Phone Number',
  'Amount Deposited', 'Currency', 'Forwarded By Agent', 'Agent ID',
  'Approved By', 'Approval Date', 'WhatsApp Channel', 'Lead Source', 'Campaign'
];

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Length-independent comparison, so a wrong secret leaks nothing by timing. */
function secretMatches_(supplied) {
  var expected = PropertiesService.getScriptProperties()
    .getProperty('CONVERTED_LEADS_SHEET_WEBHOOK_SECRET');
  if (!expected) return false;
  if (typeof supplied !== 'string') return false;
  if (supplied.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_TAB);
  if (!sh) sh = ss.insertSheet(SHEET_TAB);
  return sh;
}

/** Writes the header once. Never clobbers a sheet that already has it. */
function ensureHeader_(sh) {
  var first = sh.getRange(1, 1, 1, HEADER.length).getValues()[0];
  if (String(first[1]).trim() === 'Lead ID') return;
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  sh.setFrozenRows(1);
}

/** lead_id -> 1-based row number, built from column B. */
function leadRowIndex_(sh) {
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var ids = sh.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i][0]).trim();
    if (id) map[id] = i + 2; /* +2: row 1 is the header, rows are 1-based */
  }
  return map;
}

function rowValues_(r) {
  var s = function (v) { return (v === null || v === undefined) ? '' : String(v); };
  return [
    s(r.converted_at), s(r.lead_id), s(r.full_name), s(r.email), s(r.phone),
    s(r.amount), s(r.currency), s(r.agent_name), s(r.assigned_agent_id),
    s(r.approver_name), s(r.approved_at), s(r.wa_channel), s(r.source), s(r.campaign)
  ];
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid json body' });
  }

  /* Checked before anything is read from or written to the spreadsheet. */
  if (!secretMatches_(body.secret)) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  /* Connectivity check that touches no data. */
  if (body.action === 'ping') {
    return json_({
      ok: true, pong: true, tab: SHEET_TAB,
      spreadsheet: SpreadsheetApp.getActive().getName(),
      url: SpreadsheetApp.getActive().getUrl()
    });
  }

  var rows = body.rows;
  if (!rows || !rows.length) {
    return json_({
      ok: true, updated: 0, appended: 0,
      spreadsheet: SpreadsheetApp.getActive().getName(), tab: SHEET_TAB
    });
  }

  /* Held across read-then-write: two syncs arriving together must not both
     conclude a lead is missing and append it twice. */
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: 'busy - another sync is in progress' });
  }

  try {
    var sh = sheet_();
    ensureHeader_(sh);
    var index = leadRowIndex_(sh);
    var updated = 0, appended = 0, seen = {};

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var id = String(r.lead_id || '').trim();
      if (!id) continue;

      var values = rowValues_(r);
      var existing = index[id] || seen[id];
      if (existing) {
        sh.getRange(existing, 1, 1, HEADER.length).setValues([values]);
        updated++;
      } else {
        sh.appendRow(values);
        /* Remember where it landed so a repeated lead inside ONE batch
           updates rather than appending a second time. */
        seen[id] = sh.getLastRow();
        appended++;
      }
    }

    SpreadsheetApp.flush();
    return json_({
      ok: true, updated: updated, appended: appended,
      spreadsheet: SpreadsheetApp.getActive().getName(), tab: SHEET_TAB,
      url: SpreadsheetApp.getActive().getUrl()
    });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 300) });
  } finally {
    lock.releaseLock();
  }
}

/** GET is not part of the contract; answered so a browser visit is not confusing. */
function doGet() {
  return json_({ ok: true, service: 'badar-crm converted-leads writer', method: 'POST only' });
}
