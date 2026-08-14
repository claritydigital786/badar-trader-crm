import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const nudge = read('../supabase/functions/nudge-agents/index.ts');
const followUps = read('../supabase/functions/send-follow-ups/index.ts');
const automation = read('../supabase/functions/fire-automation/index.ts');
const migration = read('../supabase/migrations/20260814170000_protect_internal_edge_calls.sql');
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
  /REVOKE ALL ON FUNCTION public\.fire_automation_event\(TEXT, UUID\) FROM PUBLIC, anon;[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated, service_role;/,
  'The automation dispatcher must replace default PUBLIC execution with the minimum roles needed by authenticated trigger writes.',
);
assert.doesNotMatch(migration, /[0-9a-f]{64}/, 'The migration must never contain a generated secret value.');
assert.match(retiredNudgeMigration, /cron\.unschedule\(jobid\)/, 'The retired nudge scheduler must be removed safely by job ID.');
assert.match(retiredNudgeMigration, /nudge-agents-every-15-min-business-hours/, 'The recurring nudge job must be retired.');
assert.match(retiredNudgeMigration, /nudge-agents-6pm-pkt-close/, 'The close-of-day nudge job must be retired.');

console.log('Internal function security checks passed.');
