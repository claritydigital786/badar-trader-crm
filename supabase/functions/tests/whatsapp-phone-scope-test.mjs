import assert from "node:assert/strict";
import { isAllowedPhoneNumberId } from "../_shared/whatsapp_phone_scope.mjs";

// The CRM's configured number matches itself.
assert.equal(isAllowedPhoneNumberId("118197985836353", "118197985836353"), true);

// 3903 (or any other number on the same WABA) must never pass, even if it is
// the only other id ever seen in practice.
assert.equal(isAllowedPhoneNumberId("1222094190991826", "118197985836353"), false);

// Missing incoming id - fails closed, not treated as "everything allowed".
assert.equal(isAllowedPhoneNumberId("", "118197985836353"), false);
assert.equal(isAllowedPhoneNumberId(undefined, "118197985836353"), false);
assert.equal(isAllowedPhoneNumberId(null, "118197985836353"), false);

// Unconfigured expected id - fails closed rather than accepting anything.
assert.equal(isAllowedPhoneNumberId("118197985836353", ""), false);
assert.equal(isAllowedPhoneNumberId("118197985836353", undefined), false);

// Both missing - still closed.
assert.equal(isAllowedPhoneNumberId("", ""), false);

// Non-string inputs never coerce into a false match.
assert.equal(isAllowedPhoneNumberId(118197985836353, "118197985836353"), false);

// Whitespace is trimmed before comparing, but does not make an empty id real.
assert.equal(isAllowedPhoneNumberId(" 118197985836353 ", "118197985836353"), true);
assert.equal(isAllowedPhoneNumberId("   ", "118197985836353"), false);

console.log("whatsapp-phone-scope-test: all assertions passed");
