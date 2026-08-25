import assert from "node:assert/strict";
import test from "node:test";

import worker, * as referralModule from "../src/index.js";

const { buildCanonicalReferralUrl, normalizeReferralCode } = referralModule;

const assets = {
  async fetch() {
    return new Response("asset", { status: 404 });
  },
};

async function request(url) {
  return worker.fetch(new Request(url), { ASSETS: assets });
}

async function rawRequestUrl(url) {
  return worker.fetch({ url }, { ASSETS: assets });
}

test("exports the canonical referral validation API", () => {
  assert.equal(typeof normalizeReferralCode, "function");
  assert.equal(typeof buildCanonicalReferralUrl, "function");
});

test("normalizes referral codes only within the canonical ASCII alphabet", () => {
  assert.equal(normalizeReferralCode(" abcd2345 "), "ABCD2345");
  assert.equal(normalizeReferralCode("ABCD2345"), "ABCD2345");
  assert.equal(normalizeReferralCode("ABCD1234"), null);
  assert.equal(normalizeReferralCode("ABC2345"), null);
  assert.equal(normalizeReferralCode("ABCD23456"), null);
  assert.equal(normalizeReferralCode("ＡBCD2345"), null);
  assert.equal(normalizeReferralCode("ABCD2345\r\n"), "ABCD2345");
  assert.equal(normalizeReferralCode("ABCD 2345"), null);
  assert.equal(normalizeReferralCode("ABCD2345\u0000"), null);
});

test("builds the only canonical referral URL", () => {
  assert.equal(
    buildCanonicalReferralUrl("abcd2345").toString(),
    "https://www.zitronetwork.com/ref/ABCD2345",
  );
  assert.throws(() => buildCanonicalReferralUrl("ABCD1234"));
});

test("renders only the exact uppercase canonical referral route without query parameters", async () => {
  const response = await request("https://www.zitronetwork.com/ref/ABCD2345");
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /data-code="ABCD2345"/);
  assert.doesNotMatch(body, />Abrir app</);
  assert.match(body, /Copiar código/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("redirects a lowercase referral route once to the uppercase canonical URL", async () => {
  const response = await request("https://www.zitronetwork.com/ref/abcd2345");

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://www.zitronetwork.com/ref/ABCD2345",
  );
  assert.equal(response.headers.get("cache-control"), null);
});

test("rejects hostile referral route variants", async () => {
  const urls = [
    "https://www.zitronetwork.com/ref/ABCD1234",
    "https://www.zitronetwork.com/ref/ABCD234",
    "https://www.zitronetwork.com/ref/ABCD23456",
    "https://www.zitronetwork.com/ref/ABCD23456789012345678",
    "https://www.zitronetwork.com/ref/ABCD2345678901234567890123456789012345678901234567890123456789",
    "https://www.zitronetwork.com/ref/ABCD23456789012345678901234567890123456789012345678901234567890",
    "https://www.zitronetwork.com/ref/ABCD2345/extra",
    "https://www.zitronetwork.com/ref/ABCD%2F2345",
    "https://www.zitronetwork.com/ref/ABCD2345%0D%0A",
    "https://www.zitronetwork.com/ref/%EF%BC%A1BCD2345",
    "https://www.zitronetwork.com/ref/ABCD2345?next=https://evil.example",
    "https://www.zitronetwork.com/ref/ABCD2345#fragment",
  ];

  for (const url of urls) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
  }
});

test("does not canonicalize an untrusted host into the official domain", async () => {
  const response = await request("http://evil.example/ref/ABCD2345");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("permanently canonicalizes the apex without copying arbitrary query or fragment", async () => {
  const response = await request(
    "https://zitronetwork.com/ref/ABCD2345?next=https%3A%2F%2Fevil.example#fragment",
  );

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://www.zitronetwork.com/ref/ABCD2345",
  );
});

test("rejects userinfo and non-default-port referral URLs", async () => {
  const userInfoResponse = await rawRequestUrl(
    "https://trusted@www.zitronetwork.com/ref/ABCD2345",
  );
  const portResponse = await request("https://www.zitronetwork.com:444/ref/ABCD2345");

  assert.equal(userInfoResponse.status, 404);
  assert.equal(userInfoResponse.headers.get("location"), null);
  assert.equal(portResponse.status, 404);
  assert.equal(portResponse.headers.get("location"), null);
});

test("redirects only allowed legacy variants with one valid code", async () => {
  const urls = [
    "https://www.zitronetwork.com/?ref=abcd2345",
    "https://www.zitronetwork.com/register?ref=abcd2345",
    "https://www.zitronetwork.com/register?=abcd2345",
  ];

  for (const url of urls) {
    const response = await request(url);
    assert.equal(response.status, 308, url);
    assert.equal(
      response.headers.get("location"),
      "https://www.zitronetwork.com/ref/ABCD2345",
      url,
    );
  }
});

test("does not create an open redirect from legacy query parameters", async () => {
  const response = await request(
    "https://www.zitronetwork.com/register?ref=ABCD2345&next=https%3A%2F%2Fevil.example",
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("accepts every audited legacy format but rejects duplicates, fragments, double encoding and extra slashes", async () => {
  const allowed = [
    "https://www.zitronetwork.com/?ref=ABCD2345",
    "https://www.zitronetwork.com/?=ABCD2345",
    "https://www.zitronetwork.com/register?ref=ABCD2345",
    "https://www.zitronetwork.com/register?=ABCD2345",
  ];
  const rejected = [
    "https://www.zitronetwork.com/?ref=ABCD2345&ref=BCDEFGHJ",
    "https://www.zitronetwork.com/register?ref=ABCD2345#fragment",
    "https://www.zitronetwork.com/ref/%2541BCD2345",
    "https://www.zitronetwork.com/ref//ABCD2345",
    "https://www.zitronetwork.com/ref/ABCD2345%0D%0A",
  ];

  for (const url of allowed) {
    const response = await request(url);
    assert.equal(response.status, 308, url);
    assert.equal(response.headers.get("location"), "https://www.zitronetwork.com/ref/ABCD2345", url);
  }
  for (const url of rejected) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
  }
});

test("escapes rendered data and sends defensive page headers", async () => {
  const response = await request("https://www.zitronetwork.com/ref/ABCD2345");
  const csp = response.headers.get("content-security-policy");

  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains; preload");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("permissions-policy"), "clipboard-write=(self)");
});
