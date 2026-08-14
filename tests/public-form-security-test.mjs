import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const endpoint = read('../supabase/functions/submit-lead-form/index.ts');
const migration = read('../supabase/migrations/20260814171000_public_form_rate_limits.sql');

for (const formFile of ['../signals-form.html', '../course-form.html']) {
  const form = read(formFile);
  assert.match(form, /turnstile\/v0\/api\.js\?render=explicit/, `${formFile} must load Turnstile explicitly.`);
  assert.match(form, /fetch\(ENDPOINT\)[\s\S]*turnstile_site_key/, `${formFile} must retrieve the configured public site key.`);
  assert.match(form, /turnstile\.render\('#turnstile-box'/, `${formFile} must render the security widget.`);
  assert.match(form, /action:\s*'lead_form'/, `${formFile} must bind its token to the lead_form action.`);
  assert.match(form, /turnstile\.getResponse\(turnstileWidgetId\)/, `${formFile} must collect the generated token.`);
  assert.match(form, /fd\.append\('turnstile_token', turnstileToken\)/, `${formFile} must submit the token for server validation.`);
  assert.doesNotMatch(form, /TURNSTILE_SECRET_KEY/, `${formFile} must never contain the private Turnstile secret.`);
}

assert.match(endpoint, /TURNSTILE_SECRET_KEY/, 'The Edge Function must read the private Turnstile key from its environment.');
assert.match(endpoint, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/, 'The Edge Function must call Cloudflare Siteverify.');
assert.match(endpoint, /!result\?\.success[\s\S]*result\.action !== "lead_form"/, 'The Edge Function must require the exact lead_form action.');
assert.match(endpoint, /token\.length > 2048/, 'The Edge Function must enforce Cloudflare token length limits.');
assert.match(endpoint, /readFormDataWithinLimit\(req, MAX_REQUEST_BYTES\)/, 'The Edge Function must enforce the size cap while reading the real request body.');
assert.match(endpoint, /RequestTooLargeError[\s\S]*return json\(\{ ok: false, error: "Request is too large" \}, 413\)/, 'Oversized streamed bodies must return HTTP 413.');
assert.match(endpoint, /failed to clean up partially-created lead/, 'A failed multi-step submission must attempt to remove an orphaned lead.');
assert.match(endpoint, /consume_public_form_rate_limit/, 'The Edge Function must use the durable database rate limiter.');
assert.match(endpoint, /RATE_LIMIT_ATTEMPTS = 5[\s\S]*RATE_LIMIT_WINDOW_SECONDS = 15 \* 60/, 'The public form limit must remain five attempts per 15 minutes.');
assert.match(endpoint, /status: 503[\s\S]*Form security is not configured yet/, 'Missing production security keys must fail closed.');

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.public_form_rate_limits/, 'The durable rate-limit table must exist.');
assert.match(migration, /ENABLE ROW LEVEL SECURITY/, 'The rate-limit table must have RLS enabled.');
assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/, 'Browser roles must have no direct rate-limit-table privileges.');
assert.match(migration, /pg_advisory_xact_lock/, 'Concurrent submissions for one fingerprint must be serialized.');
assert.match(migration, /public_form_rate_limits_updated_at_idx/, 'Rate-limit cleanup must have an updated-at index.');
assert.match(migration, /DELETE FROM public\.public_form_rate_limits/, 'Expired rate-limit fingerprints must be cleaned up.');
assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/, 'Only the service role may consume a public-form rate-limit slot.');

console.log('Public form security checks passed.');
