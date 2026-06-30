// Tests for the pure selection/basket logic (programs-and-options model).
// Run with `node --test` (root package.json type:module makes .js ESM).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAndPriceSelection,
  priceOfSelection,
  labelsOfSelection,
  computeSelectionDiff,
  pickPrimaryCohort,
} from "./enrollment.js";

// Mock Test: three independent dates (choose any), all on sale.
const DATES = [
  { key: "mt-19jun", label: "19 Jun", price: 600, enrolling: true, choiceGroup: null, startsOn: "2026-06-19" },
  { key: "mt-26jun", label: "26 Jun", price: 600, enrolling: true, choiceGroup: null, startsOn: "2026-06-26" },
  { key: "mt-3jul",  label: "3 Jul",  price: 600, enrolling: true, choiceGroup: null, startsOn: "2026-07-03" },
];

// Olympiad: one "choose one" group, with a cheaper bundle.
const SUBJECTS = [
  { key: "oly-math", label: "Mathematics", price: 1000, enrolling: true, choiceGroup: "subject", startsOn: null },
  { key: "oly-sci",  label: "Science",     price: 1000, enrolling: true, choiceGroup: "subject", startsOn: null },
  { key: "oly-both", label: "Both",        price: 1500, enrolling: true, choiceGroup: "subject", startsOn: null },
];

test("choose-any: prices sum across picked dates", () => {
  const v = validateAndPriceSelection(DATES, ["mt-19jun", "mt-3jul"]);
  assert.equal(v.ok, true);
  assert.equal(v.price, 1200);
  assert.deepEqual(v.normalized, ["mt-19jun", "mt-3jul"]);
});

test("bundle is its own price, never a sum", () => {
  assert.equal(validateAndPriceSelection(SUBJECTS, ["oly-both"]).price, 1500);
  assert.equal(validateAndPriceSelection(SUBJECTS, ["oly-math"]).price, 1000);
});

test("choose-one: two from the same group is rejected", () => {
  const v = validateAndPriceSelection(SUBJECTS, ["oly-math", "oly-sci"]);
  assert.equal(v.ok, false);
  assert.match(v.error, /one option/i);
});

test("empty / all-invalid selections fail", () => {
  assert.equal(validateAndPriceSelection(DATES, []).ok, false);
  assert.equal(validateAndPriceSelection(DATES, ["nope"]).ok, false);
});

test("non-enrolling options are not pickable", () => {
  const closed = [{ ...DATES[0], enrolling: false }];
  assert.equal(validateAndPriceSelection(closed, ["mt-19jun"]).ok, false);
});

test("duplicates are de-duped, order preserved", () => {
  const v = validateAndPriceSelection(DATES, ["mt-26jun", "mt-26jun", "mt-19jun"]);
  assert.deepEqual(v.normalized, ["mt-26jun", "mt-19jun"]);
  assert.equal(v.price, 1200);
});

test("priceOfSelection reprices stored keys even if no longer on sale", () => {
  const ended = DATES.map((d) => ({ ...d, enrolling: false }));
  assert.equal(priceOfSelection(ended, ["mt-19jun", "mt-26jun"]), 1200);
  assert.equal(priceOfSelection(ended, ["gone"]), 0);
});

test("labelsOfSelection returns labels in options order", () => {
  assert.deepEqual(labelsOfSelection(DATES, ["mt-3jul", "mt-19jun"]), ["19 Jun", "3 Jul"]);
});

test("computeSelectionDiff: upgrade / downgrade / same", () => {
  assert.equal(computeSelectionDiff(DATES, ["mt-19jun"], ["mt-19jun", "mt-26jun"]).action, "upgrade");
  assert.equal(computeSelectionDiff(DATES, ["mt-19jun", "mt-26jun"], ["mt-19jun"]).action, "downgrade");
  assert.equal(computeSelectionDiff(SUBJECTS, ["oly-math"], ["oly-sci"]).action, "same");
  const up = computeSelectionDiff(DATES, ["mt-19jun"], ["mt-19jun", "mt-26jun"]);
  assert.equal(up.delta, 600);
});

test("pickPrimaryCohort: earliest date wins, undated sorts last, key tiebreak", () => {
  assert.equal(pickPrimaryCohort(DATES, ["mt-3jul", "mt-19jun"]), "mt-19jun");
  assert.equal(pickPrimaryCohort(SUBJECTS, ["oly-sci", "oly-math"]), "oly-math"); // both undated -> key asc
  assert.equal(pickPrimaryCohort(DATES, ["gone"]), null);
});
