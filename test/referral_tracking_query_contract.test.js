import assert from "node:assert/strict";
import test from "node:test";

import worker, * as referralModule from "../src/index.js";

// FDA-REF-002 (WEB half) — PR-REF-F2.
//
// The canonical share link https://www.zitronetwork.com/ref/<CODE> loses its
// referral attribution whenever an external platform decorates it with tracking
// query parameters (fbclid, gclid, igshid, utm_*), because the Worker currently
// rejects ANY query string on the /ref/<CODE> route and serves a 404.
//
// Contract for this PR (also frozen input for the pending mobile half, PR-F3):
//   * ALLOWED tracking keys (case-sensitive, exact lowercase): fbclid, gclid,
//     igshid, utm_source, utm_medium, utm_campaign, utm_content, utm_term.
//   * Every query key must belong to the allowlist and appear at most once.
//   * A valid referral path + allowlisted tracking only  -> 308 to the CLEAN
//     canonical URL (no query), resolved in a SINGLE hop (lowercase included).
//   * The tracking VALUES are never used, rendered, forwarded or copied into the
//     Location, the HTML or the Google Play install referrer.
//   * Any unknown key, any duplicate key, any uppercase key name, or a fragment
//     -> reject (unchanged 404 fallback). Legacy routes stay strict.

const { buildPlayStoreReferralUrl } = referralModule;

// Expected allowlist, defined INDEPENDENTLY of production to catch accidental
// drift in either direction.
const EXPECTED_ALLOWED_TRACKING_KEYS = [
  "fbclid",
  "gclid",
  "igshid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

const CANONICAL_CLEAN = "https://www.zitronetwork.com/ref/ABCD2345";
const PLAY_HREF_RE = /href="(https:\/\/play\.google\.com[^"]*)"/;

function extractPlayHref(body) {
  const match = body.match(PLAY_HREF_RE);
  return match ? match[1].replace(/&amp;/g, "&") : null;
}

const assets = {
  async fetch() {
    return new Response("asset", { status: 404 });
  },
};

async function request(url) {
  return worker.fetch(new Request(url), { ASSETS: assets });
}

// --------------------------------------------------------------------------
// RED-F2-01 / 02 / 03 — single click identifiers canonicalize to a clean URL
// --------------------------------------------------------------------------

test("RED-F2-01: fbclid decorated referral link canonicalizes to the clean URL", async () => {
  const response = await request(`${CANONICAL_CLEAN}?fbclid=test123`);

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), CANONICAL_CLEAN);
});

test("RED-F2-02: gclid decorated referral link canonicalizes to the clean URL", async () => {
  const response = await request(`${CANONICAL_CLEAN}?gclid=google123`);

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), CANONICAL_CLEAN);
});

test("RED-F2-03: igshid decorated referral link canonicalizes to the clean URL", async () => {
  const response = await request(`${CANONICAL_CLEAN}?igshid=instagram123`);

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), CANONICAL_CLEAN);
});

// --------------------------------------------------------------------------
// RED-F2-04 — every utm_* key in the allowlist canonicalizes on its own
// --------------------------------------------------------------------------

test("RED-F2-04: each allowlisted utm_* key canonicalizes to the clean URL", async () => {
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const response = await request(`${CANONICAL_CLEAN}?${key}=x`);
    assert.equal(response.status, 308, key);
    assert.equal(response.headers.get("location"), CANONICAL_CLEAN, key);
  }
});

// --------------------------------------------------------------------------
// RED-F2-05 — combined trackers on a lowercase path resolve in ONE 308
// --------------------------------------------------------------------------

test("RED-F2-05: lowercase path with combined allowed trackers uses a single 308", async () => {
  const response = await request(
    "https://www.zitronetwork.com/ref/abcd2345?utm_source=instagram&utm_medium=social&utm_campaign=launch&fbclid=abc",
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), CANONICAL_CLEAN);
});

// --------------------------------------------------------------------------
// RED-F2-06 / 07 — unknown keys reject, even mixed with allowed ones
// --------------------------------------------------------------------------

test("RED-F2-06: an unknown query key is rejected with no Location", async () => {
  const response = await request(`${CANONICAL_CLEAN}?next=https://evil.example`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("RED-F2-07: an allowed tracker mixed with an unknown key rejects the whole URL", async () => {
  const response = await request(`${CANONICAL_CLEAN}?fbclid=x&next=https://evil.example`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

// --------------------------------------------------------------------------
// RED-F2-08 — a duplicated allowed key is rejected (deterministic parser)
// --------------------------------------------------------------------------

test("RED-F2-08: a duplicated allowed tracking key is rejected", async () => {
  for (const query of ["fbclid=a&fbclid=b", "utm_source=a&utm_source=b"]) {
    const response = await request(`${CANONICAL_CLEAN}?${query}`);
    assert.equal(response.status, 404, query);
    assert.equal(response.headers.get("location"), null, query);
  }
});

// --------------------------------------------------------------------------
// RED-F2-09 — key names are case-sensitive lowercase only
// --------------------------------------------------------------------------

test("RED-F2-09: uppercase or mixed-case tracking key names are rejected", async () => {
  for (const query of ["FBCLID=x", "GCLID=x", "UTM_SOURCE=x", "utm_Source=x"]) {
    const response = await request(`${CANONICAL_CLEAN}?${query}`);
    assert.equal(response.status, 404, query);
    assert.equal(response.headers.get("location"), null, query);
  }
});

// --------------------------------------------------------------------------
// RED-F2-10 — an empty tracking value still canonicalizes
// --------------------------------------------------------------------------

test("RED-F2-10: an empty allowed tracking value canonicalizes to the clean URL", async () => {
  const response = await request(`${CANONICAL_CLEAN}?fbclid=`);

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), CANONICAL_CLEAN);
});

// --------------------------------------------------------------------------
// RED-F2-11 — no tracking value leaks anywhere downstream
// --------------------------------------------------------------------------

test("RED-F2-11: tracking values never leak into Location, HTML or Play referrer", async () => {
  const decorated = await request(`${CANONICAL_CLEAN}?fbclid=SECRET123&utm_source=facebook`);
  assert.equal(decorated.status, 308);
  const location = decorated.headers.get("location");
  assert.equal(location, CANONICAL_CLEAN);
  assert.ok(!location.includes("SECRET123"));
  assert.ok(!location.includes("facebook"));

  const page = await request(location);
  assert.equal(page.status, 200);
  const body = await page.text();
  assert.ok(!body.includes("SECRET123"), "tracking value leaked into HTML");
  assert.ok(!body.includes("facebook"), "external utm_source value leaked into HTML");

  const href = extractPlayHref(body);
  assert.ok(href, "no Google Play anchor rendered");
  const playUrl = new URL(href);
  assert.equal(playUrl.searchParams.get("referrer"), "utm_source=zitro_ref&ref=ABCD2345");
  assert.equal(playUrl.toString(), buildPlayStoreReferralUrl("ABCD2345").toString());
});

// --------------------------------------------------------------------------
// RED-F2-12 — the clean canonical page keeps returning 200 (no redirect loop)
// --------------------------------------------------------------------------

test("RED-F2-12: the clean canonical referral page still returns 200", async () => {
  const response = await request(CANONICAL_CLEAN);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});

// --------------------------------------------------------------------------
// RED-F2-13 — allowed tracking never rescues an invalid code
// --------------------------------------------------------------------------

test("RED-F2-13: an invalid referral code with allowed tracking is rejected", async () => {
  const response = await request("https://www.zitronetwork.com/ref/ABCD1234?fbclid=x");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

// --------------------------------------------------------------------------
// RED-F2-14 — allowed tracking never rescues an invalid path shape
// --------------------------------------------------------------------------

test("RED-F2-14: an invalid referral path with allowed tracking is rejected", async () => {
  const urls = [
    "https://www.zitronetwork.com/ref/ABCD2345/extra?fbclid=x",
    "https://www.zitronetwork.com/ref/ABCD2345/?fbclid=x",
    "https://www.zitronetwork.com/ref//ABCD2345?fbclid=x",
  ];

  for (const url of urls) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get("location"), null, url);
  }
});

// --------------------------------------------------------------------------
// RED-F2-15 — a fragment is never relaxed, even with allowed tracking
// --------------------------------------------------------------------------

test("RED-F2-15: a fragment with allowed tracking is still rejected", async () => {
  const response = await request(`${CANONICAL_CLEAN}?fbclid=x#fragment`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

// --------------------------------------------------------------------------
// RED-F2-16 — legacy routes stay strict and are not widened by this PR
// --------------------------------------------------------------------------

test("RED-F2-16: legacy routes are not widened with tracking parameters", async () => {
  const urls = [
    "https://www.zitronetwork.com/?ref=ABCD2345&utm_source=facebook",
    "https://www.zitronetwork.com/register?ref=ABCD2345&fbclid=x",
  ];

  for (const url of urls) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get("location"), null, url);
  }
});

// --------------------------------------------------------------------------
// Hostile tracking values are canonicalized away without leaking (§52)
// --------------------------------------------------------------------------

test("hostile tracking values are discarded and never reach the Location", async () => {
  const hostile = [
    "fbclid=https://evil.example",
    "utm_source=%3Cscript%3E",
    "utm_campaign=%0D%0ALocation%3Ahttps%3A%2F%2Fevil.example",
  ];

  for (const query of hostile) {
    const response = await request(`${CANONICAL_CLEAN}?${query}`);
    assert.equal(response.status, 308, query);
    assert.equal(response.headers.get("location"), CANONICAL_CLEAN, query);
    for (const needle of ["evil.example", "script", "%0D", "%0A", "\r", "\n"]) {
      assert.ok(!response.headers.get("location").includes(needle), `${needle} leaked for ${query}`);
    }
  }
});

// --------------------------------------------------------------------------
// The frozen allowlist has exactly eight members (drift guard)
// --------------------------------------------------------------------------

test("the tracking allowlist accepts exactly the eight audited keys", async () => {
  for (const key of EXPECTED_ALLOWED_TRACKING_KEYS) {
    const response = await request(`${CANONICAL_CLEAN}?${key}=x`);
    assert.equal(response.status, 308, `allowed key rejected: ${key}`);
    assert.equal(response.headers.get("location"), CANONICAL_CLEAN, key);
  }
  // A representative sample of look-alike keys that must NOT be accepted.
  for (const key of ["utm_redirect", "utm_url", "utm_next", "ref", "fbclidx", "xfbclid"]) {
    const response = await request(`${CANONICAL_CLEAN}?${key}=x`);
    assert.equal(response.status, 404, `look-alike key accepted: ${key}`);
    assert.equal(response.headers.get("location"), null, key);
  }
});
