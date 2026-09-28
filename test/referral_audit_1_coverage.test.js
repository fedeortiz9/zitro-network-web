// REFERRAL-AUDIT-1 (2026-09-28) — cobertura que faltaba en la mitad web del
// sistema de referidos. Solo tests: fija comportamiento que YA existe en
// src/index.js y que ninguna suite anterior verificaba.
//
//  RA1-W-01  no hay ramificación por User-Agent (misma página para Chrome,
//            Safari iOS, WebViews de Instagram/Facebook/WhatsApp y escritorio)
//  RA1-W-02  HEAD sobre /ref/<CODE> responde como GET (mismo status y cache)
//  RA1-W-03  la página /ref no promete dinero ni atribución automática y no
//            expone ningún host ajeno en href/src
//  RA1-W-04  /ref/<CODE>/ (barra final) y /REF/<CODE> no se aceptan
//  RA1-W-05  el referrer de Play sobrevive a un código con espacios o en
//            minúsculas: siempre canónico, codificado una sola vez
//  RA1-W-06  apex/http con /ref/<code minúsculas>?fbclid= converge en dos
//            saltos a la URL canónica (cadena de redirecciones)

import assert from "node:assert/strict";
import test from "node:test";

import worker, { buildPlayStoreReferralUrl } from "../src/index.js";

const assets = {
  async fetch() {
    return new Response("asset", { status: 404 });
  },
};

async function request(url, init = {}) {
  return worker.fetch(new Request(url, init), { ASSETS: assets });
}

const USER_AGENTS = {
  curl: "curl/8.5.0",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  instagramWebView:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 Instagram 340.0.0.0",
  facebookWebView:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]",
  whatsapp: "WhatsApp/2.24.20.76 A",
};

test("RA1-W-01: /ref/<CODE> renders the same page for every user agent (no UA branching)", async () => {
  const bodies = new Map();
  for (const [name, ua] of Object.entries(USER_AGENTS)) {
    const response = await request("https://www.zitronetwork.com/ref/ABCD2345", {
      headers: { "user-agent": ua },
    });
    assert.equal(response.status, 200, `status for ${name}`);
    bodies.set(name, await response.text());
  }
  const reference = bodies.get("curl");
  for (const [name, body] of bodies) {
    assert.equal(body, reference, `body differs for ${name}`);
  }
  // iOS y escritorio reciben el mismo botón de Play: no hay App Store ni
  // rama alternativa, el fallback universal es "Copiar código".
  assert.match(reference, /play\.google\.com\/store\/apps\/details\?id=com\.zitro\.mobile/);
  assert.match(reference, /Copiar código/);
});

test("RA1-W-02: HEAD /ref/<CODE> mirrors GET status and cache policy", async () => {
  const head = await request("https://www.zitronetwork.com/ref/ABCD2345", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("cache-control"), "private, no-store");
  assert.match(head.headers.get("content-type") ?? "", /text\/html/);

  const headLower = await request("https://www.zitronetwork.com/ref/abcd2345", { method: "HEAD" });
  assert.equal(headLower.status, 308);
  assert.equal(headLower.headers.get("location"), "https://www.zitronetwork.com/ref/ABCD2345");
});

test("RA1-W-03: the /ref page promises no money and no automatic attribution, and links only to own hosts", async () => {
  const response = await request("https://www.zitronetwork.com/ref/ABCD2345");
  const body = await response.text();
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

  // Vocabulario que Google Play (engaño / promesas económicas) y los propios
  // términos ("ZTR sin valor monetario") no admiten en una invitación.
  const forbidden = [
    /\bdinero\b/i,
    /\bganancias?\b/i,
    /\bgan[aá]s?\b/i,
    /\bearn/i,
    /\bmoney\b/i,
    /\bUSD\b/,
    /\$\s?\d/,
    /\bcripto(moneda)?s?\b/i,
    /\bcrypto\b/i,
    /\bautom[aá]tic/i,
    /\bgratis\b/i,
    /\bfree\b/i,
  ];
  for (const re of forbidden) {
    assert.doesNotMatch(visible, re, `forbidden wording ${re}`);
  }

  // Todos los href/src apuntan a hosts propios o a play.google.com.
  const allowedHosts = new Set([
    "www.zitronetwork.com",
    "play.google.com",
    "fedeortiz9.github.io",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ]);
  const refs = [...body.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    if (ref.startsWith("#") || ref.startsWith("/") || ref.startsWith("data:")) continue;
    const url = new URL(ref);
    assert.equal(url.protocol, "https:", ref);
    assert.ok(allowedHosts.has(url.host), `unexpected host in ${ref}`);
  }
});

test("RA1-W-04: trailing slash and uppercase /REF/ prefix are not referral routes", async () => {
  const trailing = await request("https://www.zitronetwork.com/ref/ABCD2345/");
  assert.equal(trailing.status, 404);
  assert.equal(trailing.headers.get("location"), null);

  const upperPrefix = await request("https://www.zitronetwork.com/REF/ABCD2345");
  assert.equal(upperPrefix.status, 404);

  const bare = await request("https://www.zitronetwork.com/ref/");
  assert.equal(bare.status, 404);
});

test("RA1-W-05: the Play referrer payload is canonical and single-encoded for any accepted input", async () => {
  const expected =
    "https://play.google.com/store/apps/details?id=com.zitro.mobile&referrer=utm_source%3Dzitro_ref%26ref%3DABCD2345";
  for (const input of ["ABCD2345", " abcd2345 ", "AbCd2345\n"]) {
    assert.equal(buildPlayStoreReferralUrl(input).toString(), expected, JSON.stringify(input));
  }
  const referrer = new URL(expected).searchParams.get("referrer");
  assert.equal(referrer, "utm_source=zitro_ref&ref=ABCD2345");
  // Sin doble codificación: decodificar de nuevo no cambia nada.
  assert.equal(decodeURIComponent(referrer), referrer);
});

test("RA1-W-06: apex + lowercase + tracking converges to the canonical URL in at most two hops", async () => {
  const first = await request("https://zitronetwork.com/ref/abcd2345?fbclid=abc");
  assert.equal(first.status, 308);
  const firstLocation = first.headers.get("location");
  assert.equal(firstLocation, "https://www.zitronetwork.com/ref/abcd2345");

  const second = await request(firstLocation);
  assert.equal(second.status, 308);
  assert.equal(second.headers.get("location"), "https://www.zitronetwork.com/ref/ABCD2345");

  const final = await request(second.headers.get("location"));
  assert.equal(final.status, 200);
  assert.match(await final.text(), /data-code="ABCD2345"/);
});
