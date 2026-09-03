# Converted Leads sheet writer (Apps Script)

Transport for `supabase/functions/sync-converted-leads-sheet`. Replaced the
direct Google service-account route on 2026-09-06 after conclusive testing
proved that service account could not see any file (two spreadsheets, three
Editor shares, Sheets API, Drive API, all 404) despite correct identity, a
live key, and both APIs enabled - both from the Edge Function and from an
identical script run locally, outside Supabase entirely. That ruled out
Supabase/runtime configuration and pointed at an org-level Google
Workspace/Cloud restriction this repo cannot fix from code. `Code.gs` runs as
the sheet's own owner instead, so no external grant is involved at all.

## Setup

1. Open the target spreadsheet (Badar Trader - Converted Leads).
2. Extensions > Apps Script. Replace the default stub with the whole
   contents of `Code.gs` in this directory. Save.
3. Project Settings (gear icon) > Script Properties > Add script property:
   - Property: `CONVERTED_LEADS_SHEET_WEBHOOK_SECRET`
   - Value: a strong random string, e.g. from `openssl rand -base64 32`.
     Generate this yourself - do not paste a value shared in chat or a
     document.
4. Deploy > New deployment > type "Web app".
   - Execute as: **Me** (the deploying Google account). This is what makes
     the write happen with the sheet owner's own access, with no external
     grant needed.
   - Who has access: **Anyone**. Required because the Supabase function
     cannot sign in as a Google user - the shared secret from step 3 is the
     real access control, checked before anything is read or written.
   - Deploy, then authorise (choose account > Advanced > proceed to the
     unpublished-script warning > Allow). That warning is Google's standard
     notice for your own script and is expected.
5. Copy the Web app URL (`https://script.google.com/macros/s/.../exec`).
6. In Supabase (Edge Function secrets, from Muhammad's laptop):
   ```
   supabase secrets set GOOGLE_SHEETS_WEBHOOK_URL="<the /exec URL>"
   supabase secrets set CONVERTED_LEADS_SHEET_WEBHOOK_SECRET="<the same value as step 3>"
   ```

After any future edit to `Code.gs`, the live `/exec` URL keeps serving the
previously deployed version until you go to **Deploy > Manage deployments >
(pencil icon on the existing deployment) > Version: New version > Deploy.**
Editing and saving the script alone does not update it.

## Contract

`POST` body (JSON), always includes `secret`:

- `{"secret": "...", "action": "ping"}` - connectivity/secret check only.
  Writes nothing. Returns `{ok, pong, tab, spreadsheet, url}`.
- `{"secret": "...", "rows": [...]}` (or `"action": "sync"` alongside
  `rows`) - each row is an object with keys `converted_at`, `lead_id`,
  `full_name`, `email`, `phone`, `amount`, `currency`, `agent_name`,
  `assigned_agent_id`, `approver_name`, `approved_at`, `wa_channel`,
  `source`, `campaign`. Header is created on first write if missing. A
  `lead_id` already present in column B is UPDATED in place; a new one is
  APPENDED. Returns `{ok, updated, appended, spreadsheet, tab, url}`.

A request with a missing or wrong `secret` gets `{ok:false, error:
"unauthorized"}` and nothing is read or written.

## Testing before real data

The CRM's admin panel (Reports > Converted Leads Sheet, admin/super-admin
only) has **Ping webhook** and **Run synthetic test** buttons that exercise
this contract end to end using a synthetic `Lead ID` starting with
`TEST-SYNTHETIC-` - it can never collide with a real lead's UUID. The
synthetic test appends, then updates the same `Lead ID` with one changed
field to prove idempotency, and reports back whether that update matched the
existing row rather than appending a duplicate. Delete the synthetic row
from the sheet afterward; nothing in the CRM does that automatically.
