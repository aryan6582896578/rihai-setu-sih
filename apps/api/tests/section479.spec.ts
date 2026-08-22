import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateSection479, REASONS } from "../src/domain/section479.js";

const NOW = new Date("2026-08-22T00:00:00.000Z");
const DAY = 86_400_000;
const SENTENCE_YEARS = 6;
const HALF_DAYS = (SENTENCE_YEARS * 365) / 2;
const THIRD_DAYS = (SENTENCE_YEARS * 365) / 3;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - Math.floor(n) * DAY);
}

const base = {
  custodyStartDate: daysAgo(10),
  maxSentenceYears: SENTENCE_YEARS,
  carriesDeathOrLife: false,
  isFirstTimeOffender: true,
  pendingCaseCount: 0,
};

describe("Section 479 rule engine", () => {
  it("excludes when offence carries death penalty or life imprisonment", () => {
    const r = evaluateSection479({ ...base, carriesDeathOrLife: true, pendingCaseCount: 0 }, NOW);
    assert.equal(r.status, "excluded");
    assert.equal(r.reason, REASONS.deathOrLife);
  });

  it("death/life exclusion takes precedence over other rules", () => {
    const r = evaluateSection479(
      {
        ...base,
        carriesDeathOrLife: true,
        pendingCaseCount: 5,
        custodyStartDate: daysAgo(3000),
      },
      NOW,
    );
    assert.equal(r.status, "excluded");
    assert.equal(r.reason, REASONS.deathOrLife);
  });

  it("excludes when more than one case is pending", () => {
    const r = evaluateSection479({ ...base, pendingCaseCount: 2 }, NOW);
    assert.equal(r.status, "excluded");
    assert.equal(r.reason, REASONS.multiplePending);
  });

  it("does not exclude when exactly one case is pending (pendingCaseCount=1)", () => {
    const r = evaluateSection479({ ...base, pendingCaseCount: 1 }, NOW);
    assert.equal(r.status, "not_eligible");
    assert.equal(r.reason, REASONS.belowThreshold);
  });

  it("eligible at exactly half of maximum sentence", () => {
    const r = evaluateSection479({ ...base, custodyStartDate: daysAgo(HALF_DAYS) }, NOW);
    assert.equal(r.status, "eligible");
    assert.equal(r.reason, REASONS.halfSentence);
  });

  it("eligible past half of maximum sentence even for repeat offender", () => {
    const r = evaluateSection479(
      { ...base, isFirstTimeOffender: false, custodyStartDate: daysAgo(HALF_DAYS + 200) },
      NOW,
    );
    assert.equal(r.status, "eligible");
    assert.equal(r.reason, REASONS.halfSentence);
  });

  it("eligible at exactly one-third plus first-time offender boundary", () => {
    const r = evaluateSection479({ ...base, custodyStartDate: daysAgo(THIRD_DAYS) }, NOW);
    assert.equal(r.status, "eligible");
    assert.equal(r.reason, REASONS.thirdFirstTimer);
  });

  it("one day before the one-third threshold stays not eligible", () => {
    const r = evaluateSection479({ ...base, custodyStartDate: daysAgo(THIRD_DAYS - 1) }, NOW);
    assert.equal(r.status, "not_eligible");
    assert.equal(r.reason, REASONS.belowThreshold);
  });

  it("one-third reached but repeat offender -> not eligible", () => {
    const r = evaluateSection479(
      { ...base, isFirstTimeOffender: false, custodyStartDate: daysAgo(THIRD_DAYS + 30) },
      NOW,
    );
    assert.equal(r.status, "not_eligible");
    assert.equal(r.reason, REASONS.belowThreshold);
  });

  it("custody just started -> not eligible", () => {
    const r = evaluateSection479(base, NOW);
    assert.equal(r.status, "not_eligible");
    assert.equal(r.reason, REASONS.belowThreshold);
  });
});
