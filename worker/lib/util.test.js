// Regression net for the money-critical pure helpers extracted from the
// checkout/callback routes so they can be tested without a DB. Zero-dependency:
// run with `node --test` or `node --test worker/lib/util.test.js`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { couponDiscount, amountCoversBilled, couponAppliesToType } from "./util.js";

test("couponDiscount: percent off rounds to nearest taka", () => {
  assert.equal(couponDiscount(1000, "percent", 10), 900);
  assert.equal(couponDiscount(1000, "percent", 100), 0);
  assert.equal(couponDiscount(999, "percent", 33), 669); // 999*0.67 = 669.33 -> 669
});

test("couponDiscount: flat amount off, floored at 0", () => {
  assert.equal(couponDiscount(1000, "flat", 250), 750);
  assert.equal(couponDiscount(1000, "amount", 250), 750); // anything not 'percent' is flat
  // a flat discount larger than the price can't go negative
  assert.equal(couponDiscount(200, "flat", 500), 0);
});

test("amountCoversBilled: exact and over-payment cover the bill", () => {
  assert.equal(amountCoversBilled(1000, 1000), true);
  assert.equal(amountCoversBilled(1001, 1000), true);
});

test("amountCoversBilled: sub-epsilon shortfall still covers (rounding slack)", () => {
  assert.equal(amountCoversBilled(999.995, 1000), true); // within 0.01
});

test("amountCoversBilled: real underpayment fails", () => {
  assert.equal(amountCoversBilled(900, 1000), false);
  assert.equal(amountCoversBilled(999.98, 1000), false); // beyond the 0.01 epsilon
});

test("amountCoversBilled: non-finite verified amount fails", () => {
  assert.equal(amountCoversBilled(NaN, 1000), false);
  // Number.isFinite(Infinity) is false, so even +Infinity is rejected.
  assert.equal(amountCoversBilled(Infinity, 1000), false);
});

test("couponAppliesToType: JSON array and legacy CSV both work", () => {
  assert.equal(couponAppliesToType('["nqr","stem-foundation"]', "nqr"), true);
  assert.equal(couponAppliesToType('["nqr"]', "stem-foundation"), false);
  assert.equal(couponAppliesToType("nqr, stem-foundation", "stem-foundation"), true); // legacy CSV
  assert.equal(couponAppliesToType("nqr", "stem-foundation"), false);
});
