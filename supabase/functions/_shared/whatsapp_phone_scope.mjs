// Decides whether an inbound WhatsApp Cloud API event is for the CRM's own
// number, based on Meta's `entry[].changes[].value.metadata.phone_number_id`.
//
// Meta's webhook is subscribed per WhatsApp Business Account, not per number,
// so an event for any number on that WABA can arrive at this same URL. This
// project shares a WABA with +92 371 5773903, which this guard must never let
// into the automated-reply path. Without this check the webhook has no way to
// tell that number's traffic apart from the one it is configured for and
// would process both identically.
//
// Current state, to keep the two facts apart:
//   +92 371 5773903 - the business LIVE PRIMARY production number. Handled by
//     a separate, deliberately independent ingest-only branch in
//     whatsapp-webhook (real messages become real leads, nothing is ever sent
//     back). It is never allowed through THIS function, which gates the full
//     bot path only.
//   +971 52 558 6541 - the business TEST-ONLY bot-testing number, and the one
//     this function's expectedPhoneNumberId is configured for today. It is
//     the number the automated bot physically replies from.
// Business role and technical routing point opposite ways here on purpose;
// changing either is a separate, deliberate decision, not a comment edit.
//
// Fails closed on every ambiguous case: a missing incoming id, an unconfigured
// expected id, or a mismatch are all treated as "not allowed". There is no
// path in this function that returns true without an exact string match.

export function isAllowedPhoneNumberId(incomingPhoneNumberId, expectedPhoneNumberId) {
  const incoming = typeof incomingPhoneNumberId === "string" ? incomingPhoneNumberId.trim() : "";
  const expected = typeof expectedPhoneNumberId === "string" ? expectedPhoneNumberId.trim() : "";

  if (!incoming || !expected) return false;
  return incoming === expected;
}
