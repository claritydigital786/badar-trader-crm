import assert from "node:assert/strict";
import {
  readFormDataWithinLimit,
  RequestTooLargeError,
} from "../_shared/public_form_security.mjs";

const form = new FormData();
form.set("first_name", "Safe test");
form.set("form_type", "course");
const smallRequest = new Request("https://example.test/submit", {
  method: "POST",
  body: form,
});
const parsed = await readFormDataWithinLimit(smallRequest, 4096);
assert.equal(parsed.get("first_name"), "Safe test");
assert.equal(parsed.get("form_type"), "course");

const oversizedRequest = new Request("https://example.test/submit", {
  method: "POST",
  body: new Uint8Array(33),
});
await assert.rejects(
  readFormDataWithinLimit(oversizedRequest, 32),
  RequestTooLargeError,
);

console.log("PASS public-form-body-limit-test");
