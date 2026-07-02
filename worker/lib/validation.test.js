// Tests for BD phone normalization/validation. `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBdPhone, isBdMobile } from "./validation.js";

test("normalizeBdPhone: strips leading 0, country code, punctuation", () => {
  assert.equal(normalizeBdPhone("01712345678"), "+8801712345678");     // local form
  assert.equal(normalizeBdPhone("1712345678"), "+8801712345678");      // bare subscriber
  assert.equal(normalizeBdPhone("+8801712345678"), "+8801712345678");  // already canonical
  assert.equal(normalizeBdPhone("8801712345678"), "+8801712345678");   // cc, no +
  assert.equal(normalizeBdPhone("017-1234 5678"), "+8801712345678");   // punctuation
  // Full number that was entered with both the country code AND a leading 0
  // (+880 01712345678) is recovered intact.
  assert.equal(normalizeBdPhone("+88001712345678"), "+8801712345678");
});

test("isBdMobile: only +880 + 10 digits starting 1", () => {
  assert.equal(isBdMobile("+8801712345678"), true);
  assert.equal(isBdMobile("+880172425555"), false);   // 9 digits (a truncated entry)
  assert.equal(isBdMobile("+8808172425555"), false);  // doesn't start 1
  assert.equal(isBdMobile("01712345678"), false);     // not canonical
});
