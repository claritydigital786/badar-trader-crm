import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const schema = read('../supabase/schema.sql');
const migration = read('../supabase/migrations/20260815102000_protect_whatsapp_credentials.sql');
const notificationFunction = read('../supabase/functions/notify-admin-pending-approval/index.ts');

assert.doesNotMatch(
  html,
  /function sendWaViaBrowser|sendWaViaBrowser\(/,
  'No Inbox path may send with a WhatsApp token exposed to the browser.',
);
assert.doesNotMatch(
  html,
  /sendWaViaFunction[\s\S]{0,500}=== ['"]unavailable['"]/,
  'A secure-send outage must fail closed rather than activate a browser fallback.',
);
assert.match(
  html,
  /throw new Error\('Secure messaging service is unavailable\. Nothing was sent\.'\)/,
  'A secure-send outage must tell the Agent that nothing was sent.',
);
assert.match(
  html,
  /sb\.functions\.invoke\('notify-admin-pending-approval',[\s\S]{0,120}lead_id: leadId/,
  'Pending Approval alerts must use the authenticated server function.',
);
assert.doesNotMatch(
  html,
  /notifyAdminPendingApproval[\s\S]{0,900}wa_access_token/,
  'The pending-approval browser path must never read the WhatsApp token.',
);

for (const source of [schema, migration]) {
  assert.match(
    source,
    /DROP POLICY IF EXISTS "settings: agents read wa send creds" ON public\.settings;/,
    'The old Agent credential policy must be removed.',
  );
  assert.doesNotMatch(
    source,
    /CREATE POLICY "settings: agents read wa send creds"/,
    'The Agent credential policy must not be recreated.',
  );
  assert.match(
    source,
    /ALTER TABLE public\.pending_approval_notifications ENABLE ROW LEVEL SECURITY;/,
    'The notification ledger must use RLS.',
  );
  assert.match(
    source,
    /REVOKE ALL ON TABLE public\.pending_approval_notifications FROM PUBLIC, anon, authenticated;/,
    'The notification ledger must remain server-only.',
  );
}

assert.match(notificationFunction, /authClient\.auth\.getUser\(\)/, 'The notification function must validate the caller JWT.');
assert.match(
  notificationFunction,
  /contentLength > 2048[\s\S]{0,250}rawBody\.length > 2048/,
  'The authenticated endpoint must still cap its request body before parsing.',
);
assert.match(
  notificationFunction,
  /profile\?\.role === "admin" && !profile\?\.is_suspended/,
  'A suspended Admin must not be allowed to send a pending-approval alert.',
);
// `user` became nullable when conversion-hook gained a server-to-server path
// into this function (Phase 39), so the identity read is optional-chained. The
// rule it enforces is unchanged: an Agent may notify only for an assigned lead.
assert.match(
  notificationFunction,
  /isAssignedAgent[\s\S]{0,180}lead\.assigned_agent_id === user\??\.id/,
  'An Agent may notify only for an assigned lead.',
);
assert.match(
  notificationFunction,
  /lead\.status !== "pending_approval"/,
  'The function must reject notifications for any other lead status.',
);
assert.match(
  notificationFunction,
  /pending_approval_notifications[\s\S]{0,1500}claimError\?\.code === "23505"/,
  'The server must claim each status transition before sending.',
);
assert.match(
  notificationFunction,
  /existing\?\.state === "sent"[\s\S]{0,120}already_notified: true/,
  'A completed notification must be deduplicated.',
);
assert.match(
  notificationFunction,
  /\.eq\("state", existing\?\.state[\s\S]{0,160}\.eq\("claimed_at", existing\?\.claimed_at/,
  'A retry must use an optimistic claim so concurrent callers cannot both send.',
);
assert.doesNotMatch(
  notificationFunction,
  /return json\(\{ ok: false, error \}, 502\)|return json\(\{ ok: false, error: message \}, 502\)/,
  'Raw provider and network errors must not be returned to the browser.',
);
assert.doesNotMatch(
  notificationFunction,
  /body\?\.(?:to|phone|message|token)/,
  'The browser must not choose the recipient, message, phone, or credential.',
);

console.log('WhatsApp credential security checks passed.');
