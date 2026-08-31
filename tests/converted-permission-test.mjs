// Converted is admin/system-only (Muhammad, 2026-08-31).
//
// Before this, any agent could mark any lead assigned to them Converted: the
// Inbox tier picker and the lead-detail Status dropdown both offered it to
// everyone, and nothing server-side stopped the write. "Converted" could mean
// a lead had merely said yes on WhatsApp.
//
// These assertions pin BOTH halves: the UI must not offer it to an agent, and
// the database trigger - the actual control - must exist and must exempt the
// trusted backend paths. The UI half alone is not a permission system, so a
// change that keeps the dropdown gated but drops the trigger must still fail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html      = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260831040000_restrict_converted_to_admins.sql', import.meta.url), 'utf8');
const schema    = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const hook      = readFileSync(new URL('../supabase/functions/conversion-hook/index.ts', import.meta.url), 'utf8');
const webhook   = readFileSync(new URL('../supabase/functions/whatsapp-webhook/index.ts', import.meta.url), 'utf8');

// ── UI: the Inbox tier picker ──────────────────────────────
assert.match(
  html,
  /function canMarkConverted\(\)\s*\{\s*return currentProfile\?\.role === 'admin';/,
  'canMarkConverted() must gate on the real profile role, not on which inbox scope is open.',
);
const tierSelect = html.slice(
  html.indexOf('<select class="conv-tier-select"'),
  html.indexOf('</select>', html.indexOf('<select class="conv-tier-select"')),
);
assert.ok(tierSelect.length > 0, 'The Inbox tier picker must still exist.');
assert.match(
  tierSelect,
  /canMarkConverted\(\)/,
  'The Converted option in the tier picker must be gated behind canMarkConverted().',
);
assert.doesNotMatch(
  tierSelect,
  /^\s*<option value="closed"(?![^>]*disabled)/m,
  'Converted must never be an unconditional, enabled option in the tier picker.',
);
assert.match(
  tierSelect,
  /value="closed" selected disabled/,
  'An already-converted lead must still show its real tier to an agent, disabled rather than hidden.',
);
for (const tier of ['new', 'warm', 'hot', 'qualified']) {
  assert.match(
    tierSelect,
    new RegExp(`value="${tier}"`),
    `An agent must still be able to classify a lead as ${tier}.`,
  );
}

// ── UI: the lead-detail Status dropdown ────────────────────
const statusSelect = html.slice(
  html.indexOf('<select id="det-status"'),
  html.indexOf('</select>', html.indexOf('<select id="det-status"')),
);
assert.ok(statusSelect.length > 0, 'The lead-detail Status dropdown must still exist.');
assert.match(
  statusSelect,
  /filter\(s => s !== 'converted' \|\| isAdmin \|\| lead\.status === 'converted'\)/,
  'Converted must be filtered out of the Status dropdown for non-admins.',
);
assert.match(
  statusSelect,
  /pending_approval/,
  'Agents must keep Pending Approval - it is how a conversion legitimately reaches an admin.',
);

// ── Database: the real control ─────────────────────────────
for (const [name, sql] of [['migration', migration], ['schema.sql', schema]]) {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enforce_converted_admin_only\(\)/,
    `${name} must define the guard function.`);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF manual_tier, status ON public\.leads/,
    `${name} must attach the guard to both INSERT and UPDATE of the two protected columns.`);
  assert.match(sql, /IF auth\.uid\(\) IS NULL OR public\.is_admin\(\) THEN\s*\n\s*RETURN NEW;/,
    `${name} must exempt admins and trusted backend (service-role) writes.`);
  assert.match(sql, /NEW\.manual_tier = 'closed' AND old_tier IS DISTINCT FROM 'closed'/,
    `${name} must block only the transition INTO closed, so unrelated updates on an already-converted lead still work.`);
  assert.match(sql, /NEW\.status = 'converted' AND old_status IS DISTINCT FROM 'converted'/,
    `${name} must block the transition INTO status=converted the same way.`);
}
assert.doesNotMatch(
  migration,
  /DROP POLICY|CREATE POLICY|ALTER POLICY/,
  'The guard must not rewrite RLS - agents keep every other column on their own leads.',
);

// ── The legitimate conversion paths must be untouched ──────
assert.match(
  hook,
  /SUPABASE_SERVICE_ROLE_KEY/,
  'conversion-hook must keep using the service role key, which is what exempts it from the guard.',
);
assert.match(
  hook,
  /status: "converted"/,
  'conversion-hook remains a legitimate system conversion path.',
);
assert.match(
  html,
  /document_type', 'deposit_screenshot'[\s\S]{0,400}?Cannot approve - no Deposit Screenshot/,
  'approveConversion must still require a deposit screenshot before an admin can convert.',
);

// ── Qualified stays distinct from Converted ────────────────
assert.match(
  webhook,
  /status: "qualified"/,
  'The bot must still mark a deposit-yes as qualified.',
);
assert.doesNotMatch(
  webhook,
  /status: "converted"/,
  'The chatbot must never convert a lead on its own - saying yes to the deposit is not a conversion.',
);
assert.match(
  html,
  /if \(status === 'qualified'\) return 'qualified';/,
  'computeLeadTier must keep qualified as its own tier, never folded into closed.',
);

console.log('Converted-permission checks passed.');
