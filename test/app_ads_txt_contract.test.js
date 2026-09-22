import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import worker from "../src/index.js";

// WEB-APPADS-1 — IAB app-ads.txt authorization file.
//
// AdMob warned that the app's ad inventory can't be verified without a
// publicly reachable app-ads.txt: demand that requires verification stops
// bidding without it. Google discovers the file at https://<site>/app-ads.txt
// (the domain declared as the app's website in Play Console) with no link
// from any page. The line below authorizes AdMob's publisher account
// (pub-4139582015284072, from the app's AndroidManifest.xml) as a DIRECT
// seller.
const EXPECTED_LINE = "google.com, pub-4139582015284072, DIRECT, f08c47fec0942fa0";

const appAdsPath = fileURLToPath(new URL("../app-ads.txt", import.meta.url));

function readAppAdsRaw() {
  return readFileSync(appAdsPath, "utf8");
}

// Mock of Cloudflare Workers static assets (env.ASSETS): serves the real file
// from disk when it exists, with the content-type the real asset server
// assigns .txt files (text/plain), and 404 otherwise.
const assets = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/app-ads.txt" && existsSync(appAdsPath)) {
      return new Response(readAppAdsRaw(), {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
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

test("WEB-APPADS-1: app-ads.txt exists at the repo root", () => {
  assert.ok(existsSync(appAdsPath), `Missing ${appAdsPath}`);
});

test("WEB-APPADS-1: contains exactly the expected AdMob authorization line", () => {
  const raw = readAppAdsRaw();
  assert.equal(raw.replace(/\r?\n$/, ""), EXPECTED_LINE);
  assert.ok(!raw.startsWith("\n"), "must not start with a blank line");
  assert.ok(!raw.startsWith("﻿"), "must not start with a BOM");
});

test("WEB-APPADS-1: the line has exactly 4 comma-separated fields", () => {
  const line = readAppAdsRaw().trim();
  const fields = line.split(",").map((f) => f.trim());
  assert.equal(fields.length, 4);
  const [adSystem, publisherId, relationship, certAuthorityId] = fields;
  assert.equal(adSystem, "google.com");
  assert.equal(publisherId, "pub-4139582015284072");
  assert.equal(relationship, "DIRECT");
  assert.equal(certAuthorityId, "f08c47fec0942fa0");
});

test("WEB-APPADS-1: worker serves app-ads.txt as 200 plain text on www, without redirect", async () => {
  const response = await request("https://www.zitronetwork.com/app-ads.txt");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(
    response.headers.get("content-type") ?? "",
    /text\/plain/,
    "crawlers require a text/plain content type",
  );
  const body = await response.text();
  assert.equal(body.trim(), EXPECTED_LINE);
});

test("WEB-APPADS-1: worker does not transform the file into HTML or a referral page", async () => {
  const response = await request("https://www.zitronetwork.com/app-ads.txt");
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  assert.doesNotMatch(contentType, /text\/html/);
  assert.doesNotMatch(body, /<!DOCTYPE html>/i);
});

test("WEB-APPADS-1: the apex also serves app-ads.txt as 200, without redirecting to www", async () => {
  // IAB's crawler is strict about cross-domain redirects for this file, so
  // (unlike every other apex path, which redirects to www) app-ads.txt must
  // respond directly on the apex.
  const response = await request("https://zitronetwork.com/app-ads.txt");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  const body = await response.text();
  assert.equal(body.trim(), EXPECTED_LINE);
});

test("WEB-APPADS-1: an insecure apex request still upgrades to https (not left on http)", async () => {
  const response = await request("http://zitronetwork.com/app-ads.txt");
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://www.zitronetwork.com/app-ads.txt",
  );
});
