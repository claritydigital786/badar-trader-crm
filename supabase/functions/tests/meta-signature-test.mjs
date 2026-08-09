import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  isMetaSignatureEnforced,
  readAndVerifyMetaRequest,
  verifyMetaSignature,
} from "../_shared/meta_signature.mjs";

const encoder = new TextEncoder();
const secret = "It's a Secret to Everybody";
const referenceBody = encoder.encode("Hello, World!");

function sign(body, key = secret) {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

const referenceHeader = sign(referenceBody);
assert.equal(
  referenceHeader,
  "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
  "reference HMAC vector must match",
);

const valid = await verifyMetaSignature({
  rawBody: referenceBody,
  signatureHeader: referenceHeader,
  appSecret: secret,
  enforced: true,
});
assert.deepEqual(valid, { allowed: true, verified: true, reason: "signature valid" });

const tamperedBody = encoder.encode("Hello, World! ");
const tampered = await verifyMetaSignature({
  rawBody: tamperedBody,
  signatureHeader: referenceHeader,
  appSecret: secret,
  enforced: true,
});
assert.equal(tampered.allowed, false);
assert.equal(tampered.reason, "signature mismatch");

const audit = await verifyMetaSignature({
  rawBody: tamperedBody,
  signatureHeader: referenceHeader,
  appSecret: secret,
  enforced: false,
});
assert.equal(audit.allowed, true);
assert.equal(audit.verified, false);
assert.match(audit.reason, /^AUDIT ONLY/);

for (const [name, signatureHeader, reasonPattern] of [
  ["missing", null, /no X-Hub-Signature-256/],
  ["legacy sha1", "sha1=abc", /not sha256=/],
  ["non-hex", `sha256=${"z".repeat(64)}`, /64-character hex/],
  ["short", "sha256=abcd", /64-character hex/],
]) {
  const result = await verifyMetaSignature({
    rawBody: referenceBody,
    signatureHeader,
    appSecret: secret,
    enforced: true,
  });
  assert.equal(result.allowed, false, `${name} signature must be rejected`);
  assert.match(result.reason, reasonPattern);
}

const wrongSecret = await verifyMetaSignature({
  rawBody: referenceBody,
  signatureHeader: referenceHeader,
  appSecret: "wrong secret",
  enforced: true,
});
assert.equal(wrongSecret.allowed, false);

const uppercaseDigest = await verifyMetaSignature({
  rawBody: referenceBody,
  signatureHeader: `sha256=${referenceHeader.slice(7).toUpperCase()}`,
  appSecret: secret,
  enforced: true,
});
assert.equal(uppercaseDigest.verified, true);

for (const body of [
  encoder.encode(JSON.stringify({ text: "سلام دنیا", currency: "€", supplementary: "𐍈" })),
  encoder.encode('{"text":"\\u0633\\u0644\\u0627\\u0645"}'),
  new Uint8Array([0xff, 0xfe, 0x00, 0x7b]),
]) {
  const result = await verifyMetaSignature({
    rawBody: body,
    signatureHeader: sign(body),
    appSecret: secret,
    enforced: true,
  });
  assert.equal(result.verified, true, "exact payload bytes must verify");
}

const disabled = await verifyMetaSignature({
  rawBody: referenceBody,
  signatureHeader: null,
  appSecret: "",
  enforced: true,
});
assert.equal(disabled.allowed, true);
assert.match(disabled.reason, /verification skipped/);

assert.equal(isMetaSignatureEnforced(" true "), true);
assert.equal(isMetaSignatureEnforced("TRUE"), true);
assert.equal(isMetaSignatureEnforced("1"), false);
assert.equal(isMetaSignatureEnforced(undefined), false);

await assert.rejects(
  verifyMetaSignature({
    rawBody: "not bytes",
    signatureHeader: referenceHeader,
    appSecret: secret,
    enforced: true,
  }),
  TypeError,
);

const requestBody = JSON.stringify({ entry: [{ id: "123", changes: [] }], text: "سلام 𐍈" });
const requestBytes = encoder.encode(requestBody);
const signedRequest = new Request("https://example.test/webhook", {
  method: "POST",
  headers: { "x-hub-signature-256": sign(requestBytes) },
  body: requestBytes,
});
const requestResult = await readAndVerifyMetaRequest(signedRequest, {
  appSecret: secret,
  enforced: true,
});
assert.equal(requestResult.signature.verified, true);
assert.equal(new TextDecoder().decode(requestResult.rawBody), requestBody);
assert.equal(signedRequest.bodyUsed, true);

const replayRequest = new Request("https://example.test/webhook", {
  method: "POST",
  headers: { "x-hub-signature-256": sign(requestBytes) },
  body: `${requestBody} `,
});
const replayResult = await readAndVerifyMetaRequest(replayRequest, {
  appSecret: secret,
  enforced: true,
});
assert.equal(replayResult.signature.allowed, false);

console.log("PASS meta-signature-test");
