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
//
// PR-A11 — /whitepaper/ is white paper v5.0, byte-identical to the GitHub
// Pages copy (zitro-whitepaper). Its wording is decided by the owner, so the
// contract no longer requires a canonical tag. IBM Plex is served from
// whitepaper/fonts/ (font-src 'self'); the Google Fonts stylesheet the
// document also links stays blocked by the unchanged CSP.

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

test("the whitepaper page is v5.4 and states that ZTR has no monetary value, in both languages", () => {
  assert.match(whitepaper, /Versión 5\.4/);
  assert.match(whitepaper, /Version 5\.4/);
  assert.match(whitepaper, /No tiene valor monetario/);
  assert.match(whitepaper, /It has no monetary value/);
});

// HALVING-9 — v5.2: 9 halving stages (0 to 9); the last one starts at
// 15,000,000 active miners, in both languages.
test("the whitepaper page describes 9 halving stages, in both languages", () => {
  assert.match(whitepaper, /<b>9<\/b><span>etapas de halving<\/span>/);
  assert.match(whitepaper, /<b>9<\/b><span>halving stages<\/span>/);
  assert.match(whitepaper, /<tr><td>9<\/td><td class="num">15\.000\.000<\/td>/);
  assert.match(whitepaper, /<tr><td>9<\/td><td class="num">15,000,000<\/td>/);
  assert.doesNotMatch(whitepaper, /<b>5<\/b><span>(etapas de halving|halving stages)<\/span>/);
});

// ACAD-RAW-1 — v5.4: the Academy is video only. Classes grant no ZTR and do
// not increase mining; increases earned before October 21, 2026 are kept.
// No Academy text promises ZTR or a +2% boost any more.
test("the whitepaper page describes the Academy as video only, with no ZTR and no mining boost, in both languages", () => {
  const text = visibleText(whitepaper);
  assert.match(text, /Las clases no otorgan ZTR ni aumentan el ritmo de minería/);
  assert.match(text, /Classes grant no ZTR and do not increase the mining pace/);
  assert.match(text, /completadas antes del 21 de octubre de 2026 se conservan/);
  assert.match(text, /completed before October 21, 2026 are kept/);
  assert.doesNotMatch(text, /\+2 ?%|\+14 ?%/);
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
    // COMPLIANCE-LEGAL: mining is symbolic (a record on Zitro's servers).
    /miner[ií]a en la nube|cloud mining/i,
    /multiplicadores?|multipliers?/i,
    /llegan primero|early participants/i,
    /dApps?/,
  ];
  for (const pattern of banned) {
    assert.doesNotMatch(text, pattern, `whitepaper contains ${pattern}`);
  }
});

test("the whitepaper page has no scripts and only loads Google Fonts, which the CSP blocks", () => {
  const sources = [...whitepaper.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  const external = sources.filter(
    (value) =>
      /^https?:/.test(value) &&
      !value.startsWith("https://www.zitronetwork.com/") &&
      !value.startsWith("https://fedeortiz9.github.io/zitro-terms/") &&
      !value.startsWith("https://fedeortiz9.github.io/zitro-privacy-policy/") &&
      !/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(value),
  );
  assert.deepEqual(external, []);
  assert.doesNotMatch(whitepaper, /<script/i);
  assert.doesNotMatch(whitepaper, /<img/i);
});

test("the whitepaper page serves its IBM Plex fonts from whitepaper/fonts/ with the OFL license", () => {
  const fontUrls = [...whitepaper.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]);
  assert.deepEqual(fontUrls.sort(), [
    "fonts/IBMPlexSans-Medium.woff2",
    "fonts/IBMPlexSans-Regular.woff2",
    "fonts/IBMPlexSans-SemiBold.woff2",
    "fonts/IBMPlexSerif-Medium.woff2",
  ]);
  let total = 0;
  for (const url of fontUrls) {
    const bytes = readFileSync(fileURLToPath(new URL(`../whitepaper/${url}`, import.meta.url)));
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2", url);
    total += bytes.length;
  }
  assert.ok(total < 200 * 1024, `fonts weigh ${total} bytes`);
  assert.match(read("../whitepaper/fonts/OFL.txt"), /SIL Open Font License, Version 1\.1/);
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
  // The CSP is unchanged: the Google Fonts stylesheet and font files stay
  // blocked and the page renders with its fallback fonts; the page's own
  // <style> needs 'unsafe-inline'.
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /font-src 'self'(;|$)/);
  assert.match(csp, /style-src 'unsafe-inline'(;|$)/);
  assert.doesNotMatch(csp, /fonts\.g/);
  assert.match(await response.text(), /No tiene valor monetario/);
});
