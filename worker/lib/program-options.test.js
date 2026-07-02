// Regression net for the date-driven lifecycle helpers. Zero-dependency:
// run with `node --test` (root package.json type:module makes .js ESM).
//
// IMPORTANT: deriveCohortStage here has a SQL mirror, cohortStageSQL() in
// worker/routes/admin.js (used by the dashboard scoping). If you change the
// rules below, change that CASE expression to match - these cases are the
// shared contract both implementations must satisfy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCohortStage, deriveRegState } from "./program-options.js";

const TODAY = "2026-06-19";
const stage = (status, eo, ec, so, eoEnd) => deriveCohortStage(status, eo, ec, so, eoEnd, TODAY);

test("deriveCohortStage: draft/archived are manual overrides (dates ignored)", () => {
  assert.equal(stage("draft", "2026-01-01", "2026-12-31", null, null), "draft");
  assert.equal(stage("archived", "2026-01-01", "2026-12-31", null, null), "archived");
});

test("deriveCohortStage: no date signals falls back to stored status", () => {
  assert.equal(stage("enrolling", null, null, null, null), "enrolling");
  assert.equal(stage("ended", null, null, null, null), "ended");
  assert.equal(stage("running", null, null, null, null), "running");
});

test("deriveCohortStage: upcoming before the enrol window opens", () => {
  assert.equal(stage("enrolling", "2026-07-01", "2026-07-31", null, null), "upcoming");
});

test("deriveCohortStage: enrolling inside the window (and open-ended)", () => {
  assert.equal(stage("enrolling", "2026-06-01", "2026-06-30", null, null), "enrolling");
  assert.equal(stage("upcoming", "2026-06-01", null, null, null), "enrolling"); // no close = still open
  assert.equal(stage("enrolling", null, "2026-06-30", null, null), "enrolling"); // open with no explicit start
});

test("deriveCohortStage: running after enrol closes, before session ends", () => {
  assert.equal(stage("enrolling", "2026-05-01", "2026-06-10", "2026-06-15", "2026-07-30"), "running");
});

test("deriveCohortStage: ended after the session end date", () => {
  assert.equal(stage("enrolling", "2026-01-01", "2026-02-01", null, "2026-06-10"), "ended");
  // ended wins even if the enrol window looks future (bad/legacy data)
  assert.equal(stage("enrolling", "2026-08-01", null, null, "2026-06-10"), "ended");
});

test("deriveRegState: year-round is always open; else window-driven", () => {
  assert.equal(deriveRegState(true, null, null, TODAY), "open");
  assert.equal(deriveRegState(false, "2026-07-01", "2026-07-31", TODAY), "upcoming");
  assert.equal(deriveRegState(false, "2026-06-01", "2026-06-10", TODAY), "closed");
  assert.equal(deriveRegState(false, "2026-06-01", "2026-06-30", TODAY), "open");
  assert.equal(deriveRegState(false, null, null, TODAY), "closed");
});

// ── scheduleLabelFromRuns: the descriptive schedule line ────────────────────
import { scheduleLabelFromRuns } from "./program-options.js";
const run = (o) => ({ stage: "enrolling", ...o });

test("schedule: deadline + session start, both stated", () => {
  const label = scheduleLabelFromRuns([run({ startsOn: "2026-08-03", enrollCloses: "2026-07-10" })]);
  assert.equal(label, "Registration ends 10 July 2026 · Session starts 3 August 2026");
});

test("schedule: deadline only (undated competitions)", () => {
  assert.equal(
    scheduleLabelFromRuns([run({ enrollCloses: "2026-07-10" })]),
    "Registration ends 10 July 2026",
  );
});

test("schedule: session only (no enrolment close set)", () => {
  assert.equal(
    scheduleLabelFromRuns([run({ startsOn: "2026-06-19" })]),
    "Session starts 19 June 2026",
  );
});

test("schedule: several runs -> latest deadline + earliest session start", () => {
  const label = scheduleLabelFromRuns([
    run({ startsOn: "2026-07-31", enrollCloses: "2026-07-27" }),
    run({ startsOn: "2026-06-19", enrollCloses: "2026-07-01" }),
  ]);
  assert.equal(label, "Registration ends 27 July 2026 · Session starts 19 June 2026");
});

test("schedule: only ended/archived runs -> empty (caller falls back to manual label)", () => {
  assert.equal(scheduleLabelFromRuns([{ stage: "ended", startsOn: "2026-06-19", enrollCloses: "2026-06-30" }]), "");
  assert.equal(scheduleLabelFromRuns([]), "");
});
