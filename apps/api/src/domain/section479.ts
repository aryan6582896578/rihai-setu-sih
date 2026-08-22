export type Section479Status = "eligible" | "not_eligible" | "excluded";

export interface Section479Input {
  custodyStartDate: Date;
  maxSentenceYears: number;
  carriesDeathOrLife: boolean;
  isFirstTimeOffender: boolean;
  pendingCaseCount: number;
}

export interface Section479Result {
  status: Section479Status;
  reason: string;
}

export const REASONS = {
  deathOrLife: "Offence carries death penalty or life imprisonment",
  multiplePending: "More than one pending case (investigation/inquiry/trial)",
  halfSentence: "Custody period has reached half of maximum sentence",
  thirdFirstTimer:
    "Custody period has reached one-third of maximum sentence and prisoner is a first-time offender",
  belowThreshold: "Custody period has not yet reached the statutory threshold",
} as const;

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

function custodyDaysSince(start: Date, now: Date): number {
  return Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
}

function yearsToDays(years: number): number {
  return (years * DAYS_PER_YEAR * MS_PER_DAY) / MS_PER_DAY;
}

/**
 * Deterministic Section 479 BNSS pre-screening. Pure, explainable, no model.
 * Rules are evaluated in this exact order — exclusions first.
 */
export function evaluateSection479(input: Section479Input, now: Date = new Date()): Section479Result {
  if (input.carriesDeathOrLife === true) {
    return { status: "excluded", reason: REASONS.deathOrLife };
  }

  if (input.pendingCaseCount > 1) {
    return { status: "excluded", reason: REASONS.multiplePending };
  }

  const daysInCustody = custodyDaysSince(input.custodyStartDate, now);

  if (daysInCustody >= yearsToDays(input.maxSentenceYears) / 2) {
    return { status: "eligible", reason: REASONS.halfSentence };
  }

  if (daysInCustody >= yearsToDays(input.maxSentenceYears) / 3 && input.isFirstTimeOffender) {
    return { status: "eligible", reason: REASONS.thirdFirstTimer };
  }

  return { status: "not_eligible", reason: REASONS.belowThreshold };
}
