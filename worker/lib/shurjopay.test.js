// Regression net for shurjopayOutcome - the money-critical classifier that
// decides whether a verified payment is success/failed/cancelled/pending.
// Zero-dependency: run with `node --test` (root package.json type:module makes
// .js ESM), or `node --test worker/lib/shurjopay.test.js`.
//
// PRODUCTION INCIDENT this guards against: IBBL i-banking and mCash return
// transaction_status "Completed" (not "Success") and wallets return "Success",
// so keying success off transaction_status alone stranded those rails as
// pending. The contract: trust sp_code "1000" first, then bank_status, then
// transaction_status (incl. "Completed"/"00").
import { test } from "node:test";
import assert from "node:assert/strict";
import { shurjopayOutcome } from "./shurjopay.js";

test("shurjopayOutcome: sp_code 1000 is authoritative success regardless of other fields", () => {
  assert.equal(shurjopayOutcome({ sp_code: "1000" }), "success");
  // sp_code wins even if the descriptive fields look unfinished.
  assert.equal(shurjopayOutcome({ sp_code: "1000", bank_status: "Pending", transaction_status: "Initiated" }), "success");
});

test("shurjopayOutcome: bank_status Success is success", () => {
  assert.equal(shurjopayOutcome({ sp_code: "1001", bank_status: "Success" }), "success");
});

test("shurjopayOutcome: IBBL/mCash 'Completed' transaction_status is success (the incident)", () => {
  assert.equal(shurjopayOutcome({ sp_code: "1005", transaction_status: "Completed" }), "success");
  // uppercased variant seen in the wild
  assert.equal(shurjopayOutcome({ transaction_status: "COMPLETED" }), "success");
  // numeric "00" success code some rails return
  assert.equal(shurjopayOutcome({ transaction_status: "00" }), "success");
});

test("shurjopayOutcome: wallet 'Success' transaction_status is success", () => {
  assert.equal(shurjopayOutcome({ transaction_status: "Success" }), "success");
});

test("shurjopayOutcome: cancelled rails", () => {
  assert.equal(shurjopayOutcome({ bank_status: "Cancel" }), "cancelled");
  assert.equal(shurjopayOutcome({ bank_status: "Cancelled" }), "cancelled");
  assert.equal(shurjopayOutcome({ transaction_status: "Cancel" }), "cancelled");
  assert.equal(shurjopayOutcome({ transaction_status: "Cancelled" }), "cancelled");
});

test("shurjopayOutcome: failed rails", () => {
  assert.equal(shurjopayOutcome({ bank_status: "Failed" }), "failed");
  assert.equal(shurjopayOutcome({ transaction_status: "Failed" }), "failed");
});

test("shurjopayOutcome: success precedence over a stray cancel/fail string", () => {
  // sp_code 1000 must override a contradictory bank_status.
  assert.equal(shurjopayOutcome({ sp_code: "1000", bank_status: "Failed" }), "success");
});

test("shurjopayOutcome: unknown/transient stays pending for retry", () => {
  assert.equal(shurjopayOutcome({}), "pending");
  assert.equal(shurjopayOutcome(null), "pending");
  assert.equal(shurjopayOutcome({ bank_status: "Pending", transaction_status: "Initiated" }), "pending");
  assert.equal(shurjopayOutcome({ sp_code: "1011" }), "pending");
});

test("shurjopayOutcome: case-insensitive and whitespace-tolerant", () => {
  assert.equal(shurjopayOutcome({ bank_status: "  success  " }), "success");
  assert.equal(shurjopayOutcome({ transaction_status: " completed " }), "success");
  assert.equal(shurjopayOutcome({ sp_code: " 1000 " }), "success");
});
