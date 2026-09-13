import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import worker from "../src/index.js";

// REF-003 — Android App Links verification contract.
//
// The Android manifest (com.zitro.mobile) declares an autoVerify App Link for
// https://www.zitronetwork.com/ref/<CODE>. Android can only associate that
// domain with the app if https://www.zitronetwork.com/.well-known/assetlinks.json
// publishes a Digital Asset Links statement naming this package and the SHA-256
// of the certificate that signs the *installed* app.
//
// The app ships exclusively through Google Play with Play App Signing enabled,
// so the runtime signer is the Play App Signing certificate — NOT the upload
// key. This is the same certificate freeRASP/Talsec already trusts at runtime
// in lib/main.dart, extracted mechanically with `apksigner verify --print-certs`
// from the Play-generated release-3 APK (mobile commit 7819e2c, PR #68).
const EXPECTED_PACKAGE = "com.zitro.mobile";
const EXPECTED_RELATION = "delegate_permission/common.handle_all_urls";
const EXPECTED_FINGERPRINT =
  "85:64:B8:1D:9B:70:B6:6B:60:A1:A6:2D:32:AC:1D:1D:0A:AE:97:FF:7F:F9:D8:F0:EF:9E:EF:FC:4C:21:DA:05";

// A real SHA-256 certificate fingerprint: 32 bytes, uppercase hex, colon
// separated. Rejects lowercase-only artefacts, wrong length, and placeholders.
const SHA256_FINGERPRINT_RE = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/;
const PLACEHOLDER_RE = /FINGERPRINT|PLACEHOLDER|XXXX|<|>|TODO|CHANGE|EXAMPLE/i;

const assetlinksPath = fileURLToPath(
  new URL("../.well-known/assetlinks.json", import.meta.url),
);

function readAssetlinksRaw() {
  return readFileSync(assetlinksPath, "utf8");
}

// Mock of Cloudflare Workers static assets (env.ASSETS): serves the real file
// from disk when it exists — exactly the path the Worker delegates to — and 404
// otherwise. Before the asset exists this makes both the contract test and the
// routing test fail (faithful RED for REF-003); after it exists they pass.
const assets = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/.well-known/assetlinks.json" && existsSync(assetlinksPath)) {
      return new Response(readAssetlinksRaw(), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response("<!DOCTYPE html>not found", {
      status: 404,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  },
};

function request(url) {
  return worker.fetch(new Request(url), { ASSETS: assets });
}

function androidStatements(statements) {
  return statements.filter(
    (s) => s?.target?.namespace === "android_app",
  );
}

// ---------------------------------------------------------------------------
// Digital Asset Links contract (the published file itself)
// ---------------------------------------------------------------------------

test("REF-003: .well-known/assetlinks.json exists", () => {
  assert.ok(
    existsSync(assetlinksPath),
    `Missing ${assetlinksPath}: Android cannot verify the App Link association ` +
      `www.zitronetwork.com <-> ${EXPECTED_PACKAGE}.`,
  );
});

test("REF-003: assetlinks.json is a parseable JSON array", () => {
  const parsed = JSON.parse(readAssetlinksRaw());
  assert.ok(Array.isArray(parsed), "assetlinks.json root must be an array");
  assert.ok(parsed.length >= 1, "assetlinks.json must contain a statement");
});

test("REF-003: contains an Android app statement with the handle_all_urls relation", () => {
  const parsed = JSON.parse(readAssetlinksRaw());
  const android = androidStatements(parsed);
  assert.equal(
    android.length,
    1,
    "exactly one android_app statement is expected",
  );
  const [statement] = android;
  assert.ok(
    Array.isArray(statement.relation) &&
      statement.relation.includes(EXPECTED_RELATION),
    `relation must include ${EXPECTED_RELATION}`,
  );
});

test("REF-003: targets the exact application id com.zitro.mobile", () => {
  const [statement] = androidStatements(JSON.parse(readAssetlinksRaw()));
  assert.equal(statement.target.namespace, "android_app");
  assert.equal(statement.target.package_name, EXPECTED_PACKAGE);
});

test("REF-003: declares real SHA-256 fingerprints, never a placeholder", () => {
  const [statement] = androidStatements(JSON.parse(readAssetlinksRaw()));
  const fingerprints = statement.target.sha256_cert_fingerprints;
  assert.ok(
    Array.isArray(fingerprints) && fingerprints.length >= 1,
    "sha256_cert_fingerprints must be a non-empty array",
  );
  for (const fp of fingerprints) {
    assert.equal(typeof fp, "string");
    assert.doesNotMatch(fp, PLACEHOLDER_RE, `placeholder fingerprint: ${fp}`);
    assert.match(
      fp,
      SHA256_FINGERPRINT_RE,
      `not a 32-byte colon-separated uppercase SHA-256: ${fp}`,
    );
  }
});

test("REF-003: trusts exactly the proven Play App Signing certificate", () => {
  const [statement] = androidStatements(JSON.parse(readAssetlinksRaw()));
  const fingerprints = statement.target.sha256_cert_fingerprints;
  assert.ok(
    fingerprints.includes(EXPECTED_FINGERPRINT),
    "the Play App Signing SHA-256 (runtime signer) must be present",
  );
  // Guard against re-introducing the upload key or the historical bad value.
  const UPLOAD_KEY =
    "B1:5B:09:F6:93:A6:7A:38:91:54:0D:D2:14:A1:0C:81:2C:E4:7D:7D:E9:DF:BF:DC:77:70:A7:04:3A:24:B7:62";
  const HISTORICAL_BAD =
    "DA:0B:6C:8F:9D:53:63:4A:42:79:E5:32:C5:28:15:30:3B:11:98:B6:15:A0:84:23:A4:C1:6C:AB:82:00:CA:4F";
  assert.ok(!fingerprints.includes(UPLOAD_KEY), "upload key must NOT be trusted");
  assert.ok(
    !fingerprints.includes(HISTORICAL_BAD),
    "the historical wrong fingerprint must NOT be present",
  );
});

// ---------------------------------------------------------------------------
// Worker routing contract (the asset must reach Android intact)
// ---------------------------------------------------------------------------

test("REF-003: worker serves assetlinks.json as 200 JSON without redirect", async () => {
  const response = await request(
    "https://www.zitronetwork.com/.well-known/assetlinks.json",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/json/,
    "Android requires an application/json content type",
  );
});

test("REF-003: worker does not transform the asset into HTML or a referral page", async () => {
  const response = await request(
    "https://www.zitronetwork.com/.well-known/assetlinks.json",
  );
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  assert.doesNotMatch(contentType, /text\/html/);
  assert.doesNotMatch(body, /<!DOCTYPE html>/i);
  assert.doesNotMatch(body, /ref-code|Fuiste invitado/);

  const parsed = JSON.parse(body);
  const [statement] = androidStatements(parsed);
  assert.equal(statement.target.package_name, EXPECTED_PACKAGE);
  assert.ok(
    statement.target.sha256_cert_fingerprints.includes(EXPECTED_FINGERPRINT),
  );
});

test("REF-003: the apex request for the asset canonicalizes to www (308), not HTML", async () => {
  // Android verifies the www host declared in the manifest; the apex only
  // redirects. This documents that .well-known is not special-cased into a
  // referral or 404 path on the apex.
  const response = await request(
    "https://zitronetwork.com/.well-known/assetlinks.json",
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://www.zitronetwork.com/.well-known/assetlinks.json",
  );
});
