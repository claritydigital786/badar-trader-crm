import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const nudge = read('../supabase/functions/nudge-agents/index.ts');
const followUps = read('../supabase/functions/send-follow-ups/index.ts');
const automation = read('../supabase/functions/fire-automation/index.ts');
const migration = read('../supabase/migrations/20260814170000_protect_internal_edge_calls.sql');
const rpcClosureMigration = read('../supabase/migrations/20260815100000_close_automation_rpc_surface.sql');
const coreFunctionMigration = read('../supabase/migrations/20260815101000_harden_core_function_privileges.sql');
const retiredNudgeMigration = read('../supabase/migrations/20260814172000_remove_retired_nudge_schedule.sql');

for (const [name, source] of [
  ['nudge-agents', nudge],
  ['send-follow-ups', followUps],
  ['fire-automation', automation],
]) {
  assert.match(source, /verifyInternalRequest\(req, INTERNAL_FUNCTION_SECRET\)/, `${name} must authenticate internal calls.`);
  assert.match(source, /if \(!auth\.authorized\)/, `${name} must reject an invalid or missing internal secret.`);
  assert.match(source, /req\.method !== "POST"/, `${name} must reject non-POST requests.`);
}

assert.match(nudge, /const NUDGE_AGENTS_ENABLED = false;/, 'Agent reminders must ship disabled by default.');
assert.match(
  nudge,
  /if \(!NUDGE_AGENTS_ENABLED\)[\s\S]{0,250}no-op/,
  'The nudge function must stop before querying leads or sending messages while disabled.',
);

const protectedHeaders = migration.match(/'x-internal-function-secret'/g) || [];
assert.equal(protectedHeaders.length, 4, 'All three cron calls and the automation trigger call must include the internal secret header.');
assert.match(migration, /vault\.decrypted_secrets[\s\S]*internal_function_secret/, 'The database caller must read the secret from Vault.');
assert.match(migration, /vault\.decrypted_secrets[\s\S]*project_url/, 'The database caller must use the current environment URL from Vault.');
assert.doesNotMatch(migration, /vfskqzgphrunjxquqpks/, 'A disposable replay must never schedule calls to the production project reference.');
assert.match(migration, /WHERE EXISTS[\s\S]*project_url[\s\S]*internal_function_secret/, 'Cron calls must do nothing while either Vault value is absent.');
assert.match(migration, /IF pg_trigger_depth\(\) = 0 THEN[\s\S]*may only run from a database trigger/, 'Automation RPC calls must be rejected outside a trigger.');
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.fire_automation_event\(TEXT, UUID\) FROM PUBLIC, anon, authenticated;[\s\S]*GRANT EXECUTE[\s\S]*TO service_role;/,
  'The automation dispatcher must not be reachable as an authenticated client RPC.',
);
for (const source of [migration, rpcClosureMigration]) {
  for (const triggerFunction of [
    'trg_leads_created',
    'trg_leads_status_changed',
    'trg_leads_kyc_verified',
    'trg_transactions_deposit',
  ]) {
    assert.match(
      source,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${triggerFunction}\\(\\)[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`),
      `${triggerFunction} must run with its owner privilege after client dispatcher access is revoked.`,
    );
    assert.match(
      source,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${triggerFunction}\\(\\) FROM PUBLIC, anon, authenticated;`),
      `${triggerFunction} must not be callable through the Data API.`,
    );
  }
}
assert.doesNotMatch(migration, /[0-9a-f]{64}/, 'The migration must never contain a generated secret value.');

for (const triggerFunction of [
  'handle_new_user',
  'audit_leads',
  'set_updated_at',
  'set_status_changed_at',
  'guard_leads_admin_only_columns',
]) {
  assert.match(
    coreFunctionMigration,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${triggerFunction}\\(\\) FROM PUBLIC, anon, authenticated;`),
    `${triggerFunction} must not be callable through the Data API.`,
  );
}
assert.match(
  coreFunctionMigration,
  /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?NEW\.email,[\s\S]*?'agent'[\s\S]*?ON CONFLICT/,
  'New accounts must not be able to select their own authorization role through user metadata.',
);
assert.doesNotMatch(
  coreFunctionMigration,
  /NEW\.raw_user_meta_data->>'role'/,
  'User-controlled metadata must never determine a profile role.',
);
for (const helperFunction of ['is_admin', 'is_active_staff']) {
  assert.match(
    coreFunctionMigration,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${helperFunction}\\(\\) FROM PUBLIC, anon;[\\s\\S]*?GRANT EXECUTE ON FUNCTION public\\.${helperFunction}\\(\\) TO authenticated, service_role;`),
    `${helperFunction} must remain available to authenticated RLS policies but not anonymous RPC clients.`,
  );
}
for (const reportFunction of [
  'report_agent_performance',
  'report_source_performance',
  'report_financial_summary',
]) {
  assert.match(
    coreFunctionMigration,
    new RegExp(`REVOKE ALL ON FUNCTION public\\.${reportFunction}\\(\\) FROM PUBLIC, anon;`),
    `${reportFunction} must reject anonymous RPC clients.`,
  );
  assert.match(
    coreFunctionMigration,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${reportFunction}\\(\\) TO authenticated, service_role;`),
    `${reportFunction} must remain callable by the signed-in Admin reporting UI.`,
  );
}
assert.doesNotMatch(coreFunctionMigration, /SET search_path = public/, 'Security-sensitive functions must not use a writable search path.');

assert.match(retiredNudgeMigration, /cron\.unschedule\(jobid\)/, 'The retired nudge scheduler must be removed safely by job ID.');
assert.match(retiredNudgeMigration, /nudge-agents-every-15-min-business-hours/, 'The recurring nudge job must be retired.');
assert.match(retiredNudgeMigration, /nudge-agents-6pm-pkt-close/, 'The close-of-day nudge job must be retired.');

console.log('Internal function security checks passed.');
