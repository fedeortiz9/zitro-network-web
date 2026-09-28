import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import worker from "../src/index.js";

// LEGAL-COPY-1 — the site's whitepaper is the one bundled in the app.
//
// The hero's "Leer Whitepaper" buttons used to open the public
// zitro-whitepaper repo, which promises a BEP-20 token, its distribution
// through mining and exchange listings. That contradicts the Terms (ZTR is
// internal points with no monetary value). The site now serves the app's
// whitepaper at /whitepaper/ and every link points there.

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const whitepaper = read("../whitepaper/index.html");

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

test("the whitepaper page states that ZTR has no monetary value, in both languages", () => {
  assert.match(whitepaper, /No tiene valor monetario/);
  assert.match(whitepaper, /It has no monetary value/);
  assert.match(whitepaper, /<link rel="canonical" href="https:\/\/www\.zitronetwork\.com\/whitepaper\/">/);
});

test("the whitepaper page promises no token, exchange, yield or earnings", () => {
  const text = visibleText(whitepaper);
  const banned = [
    /BEP-?20/i,
    /\btoken\b/i,
    /\bexchanges?\b/i,
    /\bDEX\b/,
    /listad[oa]|listing/i,
    /liquidez|liquidity/i,
    /staking|airdrop/i,
    /rendimiento|\byield\b|rentabilidad|profit|ganancia/i,
    /\bearn/i,
    /c[oó]mo se gana/i,
    /distribuci[oó]n inicial|initial distribution/i,
  ];
  for (const pattern of banned) {
    assert.doesNotMatch(text, pattern, `whitepaper contains ${pattern}`);
  }
});

test("the whitepaper page loads only same-origin resources allowed by the CSP", () => {
  const sources = [...whitepaper.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  const external = sources.filter(
    (value) =>
      /^https?:/.test(value) &&
      !value.startsWith("https://www.zitronetwork.com/") &&
      !value.startsWith("https://fedeortiz9.github.io/zitro-terms/") &&
      !value.startsWith("https://fedeortiz9.github.io/zitro-privacy-policy/"),
  );
  assert.deepEqual(external, []);
  assert.doesNotMatch(whitepaper, /<link[^>]+stylesheet/);
  assert.doesNotMatch(whitepaper, /<script[^>]+src=/);
});

test("every site link to the whitepaper points to /whitepaper/, none to the token document", () => {
  for (const page of ["../index.html", "../404.html", "../eliminar-cuenta/index.html"]) {
    const html = read(page);
    assert.doesNotMatch(html, /fedeortiz9\.github\.io\/zitro-whitepaper/, page);
  }
  const heroLinks = [...read("../index.html").matchAll(/<a class="btn btn-primary hero-[^"]*" href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(heroLinks, ["/whitepaper/", "/whitepaper/"]);
});

test("the worker serves /whitepaper/ from static assets with the security headers", async () => {
  const assets = {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/whitepaper/") {
        return new Response(whitepaper, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  };
  const response = await worker.fetch(new Request("https://www.zitronetwork.com/whitepaper/"), { ASSETS: assets });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /font-src 'self'/);
  assert.match(await response.text(), /No tiene valor monetario/);
});
