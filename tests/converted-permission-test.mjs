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
// Converted is derived from leads.status, never from a picked tier.
assert.match(
  html,
  /if \(status === 'converted'\) return 'closed';/,
  'computeLeadTier must derive Converted from leads.status.',
);
assert.match(
  html,
  /if \(lead\?\.manual_tier && lead\.manual_tier !== 'closed'\) return lead\.manual_tier;/,
  'A stored manual_tier of closed must never be able to masquerade as a conversion.',
);
const tierFnStart = html.indexOf('function computeLeadTier');
const tierFn = html.slice(tierFnStart, html.indexOf('\n}', tierFnStart));
// Compare the real statements, not prose - a comment mentioning manual_tier
// above the status check must not count as the check itself.
assert.ok(
  tierFn.indexOf("if (status === 'converted') return 'closed';") <
  tierFn.indexOf('return lead.manual_tier;'),
  'Status must be checked BEFORE manual_tier, so no manual value can outrank the real outcome.',
);
assert.match(
  tierFn,
  /status === 'qualified' \|\| status === 'pending_approval'/,
  'A deposit form submission parked at pending_approval must show as Qualified, not Converted.',
);
const tierSelect = html.slice(
  html.indexOf('<select class="conv-tier-select"'),
  html.indexOf('</select>', html.indexOf('<select class="conv-tier-select"')),
);
assert.ok(tierSelect.length > 0, 'The Inbox tier picker must still exist.');
assert.doesNotMatch(
  tierSelect,
  /<option value="closed"(?![^>]*disabled)/,
  'Converted must never be a selectable tier option, for any role.',
);
assert.match(
  tierSelect,
  /value="closed" selected disabled/,
  'A genuinely converted lead must still show its real state, disabled rather than hidden.',
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
  /filter\(s => s !== 'converted' \|\| lead\.status === 'converted'\)/,
  'Converted must be filtered out of the generic Status dropdown for every role - approveConversion is the only route.',
);
assert.match(
  statusSelect,
  /const lock = \(s === 'converted'\) \? ' disabled' : '';/,
  'Where Converted is shown at all it must be disabled, never selectable.',
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
  assert.match(sql, /IF is_backend THEN\s*\n\s*RETURN NEW;/,
    `${name} must exempt trusted backend (service-role) writes, including a future broker-verification path.`);
  assert.match(sql, /NEW\.manual_tier = 'closed' AND old_tier IS DISTINCT FROM 'closed'/,
    `${name} must stop any signed-in client writing manual_tier='closed'.`);
  assert.ok(
    sql.indexOf("NEW.manual_tier = 'closed'") < sql.indexOf('IF public.is_admin() THEN'),
    `${name} must block manual_tier='closed' BEFORE the admin exemption - it is retired for everyone, not just agents.`);
  assert.match(sql, /NEW\.status = 'converted' AND old_status IS DISTINCT FROM 'converted'/,
    `${name} must block an agent moving a lead INTO Converted.`);
  assert.match(sql, /old_status = 'converted' AND NEW\.status IS DISTINCT FROM 'converted'/,
    `${name} must block an agent moving a lead OUT of Converted.`);
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
assert.doesNotMatch(
  hook,
  /status: "converted"/,
  'An unverified deposit-confirmation form must NOT declare a conversion.',
);
assert.match(
  hook,
  /status: "pending_approval"/,
  'conversion-hook must park an unverified deposit submission at pending_approval.',
);
assert.doesNotMatch(
  hook,
  /converted_at: nowIso/,
  'converted_at means "when this genuinely converted" - only approveConversion may stamp it.',
);
for (const field of ['deposit_platform', 'deposit_amount', 'deposit_account_ref', 'account_balance']) {
  assert.match(hook, new RegExp(field), `conversion-hook must still record ${field} as evidence for the admin.`);
}
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
  /if \(status === 'qualified' \|\| status === 'pending_approval'\) return 'qualified';/,
  'computeLeadTier must keep qualified as its own tier, never folded into closed.',
);

console.log('Converted-permission checks passed.');
