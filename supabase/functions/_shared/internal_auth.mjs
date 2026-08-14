// Shared authentication for server-to-server Edge Function calls.
// The secret value belongs in Supabase Edge secrets and Vault, never in Git.

const INTERNAL_SECRET_HEADER = "x-internal-function-secret";

/**
 * Compare two strings without returning early at the first differing byte.
 * The configured secret should be a high-entropy random value.
 *
 * @param {string} left
 * @param {string} right
 */
function timingSafeEqualStrings(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

/**
 * @param {Request} request
 * @param {string} configuredSecret
 * @returns {{authorized: boolean, status: number, reason: string}}
 */
export function verifyInternalRequest(request, configuredSecret) {
  if (!configuredSecret) {
    return { authorized: false, status: 503, reason: "internal function secret is not configured" };
  }
  const suppliedSecret = request.headers.get(INTERNAL_SECRET_HEADER) ?? "";
  if (!suppliedSecret) {
    return { authorized: false, status: 401, reason: "internal function secret is required" };
  }
  if (!timingSafeEqualStrings(suppliedSecret, configuredSecret)) {
    return { authorized: false, status: 401, reason: "internal function secret is invalid" };
  }
  return { authorized: true, status: 200, reason: "authorized" };
}

export { INTERNAL_SECRET_HEADER };
