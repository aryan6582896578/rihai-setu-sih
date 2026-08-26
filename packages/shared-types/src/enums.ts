export const Role = {
  SuperAdmin: "super_admin",
  JailSuperintendent: "jail_superintendent",
  JailStaff: "jail_staff",
  DlsaLawyer: "dlsa_lawyer",
  Viewer: "viewer",
  NgoPartner: "ngo_partner",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ApplicationType = {
  Bail: "bail",
  PersonalBond: "personal_bond",
} as const;
export type ApplicationType = (typeof ApplicationType)[keyof typeof ApplicationType];

export const ApplicationStage = {
  Flagged: "flagged",
  Drafted: "drafted",
  Filed: "filed",
  HearingScheduled: "hearing_scheduled",
  OrderPassed: "order_passed",
  Released: "released",
} as const;
export type ApplicationStage = (typeof ApplicationStage)[keyof typeof ApplicationStage];

export const EligibilityStatus = {
  Eligible: "eligible",
  NotEligible: "not_eligible",
  Excluded: "excluded",
} as const;
export type EligibilityStatus = (typeof EligibilityStatus)[keyof typeof EligibilityStatus];

export const EnrollmentStatus = {
  Enrolled: "enrolled",
  InProgress: "in_progress",
  Completed: "completed",
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const CaseStatus = {
  Undertrial: "undertrial",
  Convict: "convict",
  Acquitted: "acquitted",
  Closed: "closed",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export const STAGE_ORDER: ApplicationStage[] = [
  ApplicationStage.Flagged,
  ApplicationStage.Drafted,
  ApplicationStage.Filed,
  ApplicationStage.HearingScheduled,
  ApplicationStage.OrderPassed,
  ApplicationStage.Released,
];
