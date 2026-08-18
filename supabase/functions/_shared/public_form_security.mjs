// Shared request-body protection for public multipart form endpoints.

export class RequestTooLargeError extends Error {}

/**
 * Read and parse multipart form data while enforcing the real streamed byte
 * count. Content-Length remains a useful fast rejection, but it is not trusted
 * as the only limit because a client can omit it and stream a chunked body.
 *
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<FormData>}
 */
export async function readFormDataWithinLimit(request, maxBytes) {
  if (!request.body) return request.formData();

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("request exceeds public form size limit");
      throw new RequestTooLargeError("Request is too large");
    }
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    chunks.push(copy.buffer);
  }

  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Blob(chunks),
  });
  return boundedRequest.formData();
}
