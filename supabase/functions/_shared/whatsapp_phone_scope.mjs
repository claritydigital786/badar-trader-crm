// Decides whether an inbound WhatsApp Cloud API event is for the CRM's own
// number, based on Meta's `entry[].changes[].value.metadata.phone_number_id`.
//
// Meta's webhook is subscribed per WhatsApp Business Account, not per number,
// so an event for any number on that WABA can arrive at this same URL. This
// project shares a WABA with 3903, a number that must never be read, written,
// or replied to by this CRM under any circumstance. Without this check the
// webhook has no way to tell 3903's traffic apart from the CRM's own number
// and would process both identically.
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
