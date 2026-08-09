// Meta signs each webhook POST with HMAC-SHA256 over the exact request bytes.
// Keep this helper runtime-neutral so both Edge Functions use identical logic
// and the same module can be tested without Supabase or live traffic.

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** @param {string | undefined | null} value */
export function isMetaSignatureEnforced(value) {
  return (value ?? "").trim().toLowerCase() === "true";
}

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 */
function timingSafeEqualBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/** @param {string} hex */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

/**
 * @param {string} secret
 * @param {Uint8Array} rawBody
 */
async function hmacSha256(secret, rawBody) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
}

/**
 * Verify Meta's X-Hub-Signature-256 header without parsing or rewriting the
 * request body. Audit mode reports failures but deliberately allows them.
 *
 * @param {{
 *   rawBody: Uint8Array,
 *   signatureHeader: string | null,
 *   appSecret: string,
 *   enforced: boolean,
 * }} input
 * @returns {Promise<{allowed: boolean, verified: boolean, reason: string}>}
 */
export async function verifyMetaSignature(input) {
  const { rawBody, signatureHeader, appSecret, enforced } = input;

  if (Object.prototype.toString.call(rawBody) !== "[object Uint8Array]") {
    throw new TypeError("rawBody must be a Uint8Array");
  }

  if (!appSecret) {
    return {
      allowed: true,
      verified: false,
      reason: "META_APP_SECRET not set - verification skipped",
    };
  }

  let verified = false;
  let detail = "";
  const prefix = "sha256=";

  if (!signatureHeader) {
    detail = "no X-Hub-Signature-256 header";
  } else if (!signatureHeader.startsWith(prefix)) {
    detail = "signature header is not sha256=";
  } else {
    const providedHex = signatureHeader.slice(prefix.length).trim().toLowerCase();
    if (!SHA256_HEX_PATTERN.test(providedHex)) {
      detail = "signature is not a 64-character hex digest";
    } else {
      const provided = hexToBytes(providedHex);
      const expected = await hmacSha256(appSecret, rawBody);
      verified = timingSafeEqualBytes(provided, expected);
      detail = verified ? "signature valid" : "signature mismatch";
    }
  }

  if (verified) return { allowed: true, verified: true, reason: detail };
  if (!enforced) {
    return {
      allowed: true,
      verified: false,
      reason: `AUDIT ONLY, would have been rejected: ${detail}`,
    };
  }
  return { allowed: false, verified: false, reason: detail };
}

/**
 * Read a Request body exactly once and verify its Meta signature.
 *
 * @param {Request} request
 * @param {{appSecret: string, enforced: boolean}} config
 */
export async function readAndVerifyMetaRequest(request, config) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = await verifyMetaSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    appSecret: config.appSecret,
    enforced: config.enforced,
  });
  return { rawBody, signature };
}
