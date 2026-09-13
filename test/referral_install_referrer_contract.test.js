import assert from "node:assert/strict";
import test from "node:test";

import * as referralModule from "../src/index.js";

const { buildPlayStoreReferralUrl } = referralModule;

const ANDROID_PACKAGE_NAME = "com.zitro.mobile";
const DECODED_REFERRER = "utm_source=zitro_ref&ref=ABCD2345";

test("exports the Play Store referral URL builder", () => {
  assert.equal(typeof buildPlayStoreReferralUrl, "function");
});

test("builds a Google Play URL pinned to the Zitro Android package", () => {
  const url = new URL(buildPlayStoreReferralUrl("abcd2345").toString());

  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "play.google.com");
  assert.equal(url.port, "");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.pathname, "/store/apps/details");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("id"), ANDROID_PACKAGE_NAME);
});

test("encodes the install referrer payload exactly once", () => {
  const url = new URL(buildPlayStoreReferralUrl("abcd2345").toString());
  const referrer = url.searchParams.get("referrer");

  assert.equal(referrer, DECODED_REFERRER);

  const payload = new URLSearchParams(referrer);
  assert.equal(payload.get("utm_source"), "zitro_ref");
  assert.equal(payload.get("ref"), "ABCD2345");
  assert.deepEqual([...payload.keys()], ["utm_source", "ref"]);
});

test("carries only the two contract parameters on the Play URL", () => {
  const url = new URL(buildPlayStoreReferralUrl("ABCD2345").toString());

  assert.deepEqual([...url.searchParams.keys()], ["id", "referrer"]);
});

test("uppercases and trims the referral code before building the Play URL", () => {
  const variants = ["abcd2345", "ABCD2345", " abcd2345 ", "AbCd2345", "ABCD2345\r\n"];

  for (const variant of variants) {
    const url = new URL(buildPlayStoreReferralUrl(variant).toString());
    assert.equal(url.searchParams.get("referrer"), DECODED_REFERRER, JSON.stringify(variant));
  }
});

test("rejects every referral code the canonical policy rejects", () => {
  const hostile = [
    "ABCD1234",
    "ABCD234",
    "ABCD23456",
    "ＡBCD2345",
    "ABCD 2345",
    "ABCD2345\u0000",
    "ABCD2345&next=https://evil.example",
    "ABCD2345%26ref=EVIL",
    "ABCD2345#fragment",
    "../ABCD2345",
    "<CODE>",
    "ABCD2345?id=com.evil.app",
    "ABCD2345%0D%0A",
    "ABCD2345\r\nSet-Cookie: x=1",
    "",
    "   ",
    null,
    undefined,
    12345678,
    {},
    ["ABCD2345"],
  ];

  for (const value of hostile) {
    assert.throws(
      () => buildPlayStoreReferralUrl(value),
      { name: "TypeError", message: "Invalid referral code" },
      JSON.stringify(String(value)),
    );
  }
});

test("never lets a hostile code escape into the Play URL string", () => {
  const forbidden = ["evil.example", "javascript:", "%0D", "%0A", "com.evil"];
  const url = buildPlayStoreReferralUrl("abcd2345").toString();

  for (const needle of forbidden) {
    assert.ok(!url.includes(needle), `${needle} leaked into ${url}`);
  }
  assert.ok(url.startsWith("https://play.google.com/store/apps/details?"), url);
});

test("is a pure function with no cross-request state", () => {
  const first = buildPlayStoreReferralUrl("ABCD2345").toString();
  const second = buildPlayStoreReferralUrl("BCDE3456").toString();
  const third = buildPlayStoreReferralUrl("ABCD2345").toString();

  assert.equal(first, third);
  assert.notEqual(first, second);
  assert.ok(!second.includes("ABCD2345"), second);
  assert.ok(!first.includes("BCDE3456"), first);

  const mutated = buildPlayStoreReferralUrl("ABCD2345");
  mutated.searchParams.set("id", "com.evil.app");
  assert.equal(buildPlayStoreReferralUrl("ABCD2345").toString(), first);
});
