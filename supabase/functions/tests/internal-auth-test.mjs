import assert from "node:assert/strict";
import {
  INTERNAL_SECRET_HEADER,
  verifyInternalRequest,
} from "../_shared/internal_auth.mjs";

const secret = "9f5d8d59711e369a53f30fd45d7990a26ab7962b85e14c75fe95eb6162515347";
const request = (value) => new Request("https://example.test/internal", {
  method: "POST",
  headers: value === undefined ? {} : { [INTERNAL_SECRET_HEADER]: value },
});

assert.deepEqual(
  verifyInternalRequest(request(secret), secret),
  { authorized: true, status: 200, reason: "authorized" },
);
assert.equal(verifyInternalRequest(request(undefined), secret).status, 401);
assert.equal(verifyInternalRequest(request("wrong"), secret).status, 401);
assert.equal(verifyInternalRequest(request(secret + "x"), secret).status, 401);
assert.equal(verifyInternalRequest(request(secret), "").status, 503);

console.log("PASS internal-auth-test");
