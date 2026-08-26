import type {
  ApplicationStage,
  ApplicationType,
  CaseStatus,
  EligibilityStatus,
  EnrollmentStatus,
  Role,
} from "./enums";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: UserDto;
}

export interface JailListItem {
  id: string;
  name: string;
  state: string;
  district: string;
  code: string;
  sanctionedCapacity: number;
  currentCount: number;
  occupancyPct: number;
  undertrialCount: number;
}

export interface ActivityStageChange {
  kind: "application_stage_change";
  at: string;
  prisonerId: string;
  prisonerName: string;
  detail: string;
}

export interface ActivityAdmission {
  kind: "new_admission";
  at: string;
  prisonerId: string;
  prisonerName: string;
  detail: string;
}

export type ActivityItem = ActivityStageChange | ActivityAdmission;

export interface JailStats {
  jail: {
    id: string;
    name: string;
    district: string;
    state: string;
    code: string;
    address: string | null;
    contactPhone: string | null;
  };
  currentOccupancy: number;
  sanctionedCapacity: number;
  capacityPct: number;
  totalPrisoners: number;
  undertrialCount: number;
  convictCount: number;
  staffCount: number;
  recentActivity: ActivityItem[];
}

export interface StaffMember {
  accessId: string;
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  roleAtJail: Role;
  globalRole: Role;
}

export interface CreateStaffResult {
  staff: StaffMember;
  temporaryPassword?: string;
}

export interface StallRow {
  applicationId: string;
  prisonerId: string;
  prisonerName: string;
  caseNumber: string;
  courtName: string;
  stage: ApplicationStage;
  daysStalled: number;
  escalated: boolean;
  escalatedAt: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type EligibilityBadge = EligibilityStatus | "pending";

export interface PrisonerListItem {
  id: string;
  fullName: string;
  prisonerRegNo: string;
  caseNumber: string;
  offence: string;
  custodyDays: number;
  custodyDurationLabel: string;
  eligibility: { status: EligibilityBadge; reason?: string };
  applicationStage: ApplicationStage | null;
}

export interface CaseRecordDto {
  id: string;
  cnrNumber: string | null;
  caseNumber: string;
  courtName: string;
  offence: string;
  maxSentenceYears: number;
  carriesDeathOrLife: boolean;
  isFirstTimeOffender: boolean;
  pendingCaseCount: number;
  custodyStartDate: string;
  caseStatus: CaseStatus;
  updatedAt: string;
}

export interface EligibilityAssessmentDto {
  id: string;
  status: EligibilityStatus;
  reason: string;
  computedAt: string;
}

export interface StageHistoryEntry {
  at: string;
  byName?: string;
  note?: string;
}

export interface ApplicationDto {
  id: string;
  type: ApplicationType;
  stage: ApplicationStage;
  generatedDocumentUrl: string | null;
  filedDate: string | null;
  hearingDate: string | null;
  orderOutcome: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  stageHistory: Partial<Record<ApplicationStage, StageHistoryEntry>>;
  assignedLawyer?: string | null;
}

export interface TrainingProgramDto {
  id: string;
  name: string;
  category: string;
}

export interface EnrollmentDto {
  id: string;
  status: EnrollmentStatus;
  progressPct: number;
  certificateUrl: string | null;
  completedAt: string | null;
  program: TrainingProgramDto;
}

export interface NoteDto {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface PrisonerDetail {
  id: string;
  jailId: string;
  fullName: string;
  prisonerRegNo: string;
  dateOfBirth: string;
  gender: string;
  admissionDate: string;
  photoUrl: string | null;
  consentToShareProfile: boolean;
  cases: CaseRecordDto[];
  primaryCaseId: string | null;
  eligibility: EligibilityAssessmentDto | null;
  applications: ApplicationDto[];
  enrollments: EnrollmentDto[];
  notes: NoteDto[];
}

export interface CreatePrisonerInput {
  fullName: string;
  prisonerRegNo?: string;
  dateOfBirth: string;
  gender: string;
  admissionDate?: string;
  case: {
    cnrNumber?: string;
    caseNumber: string;
    courtName: string;
    offence: string;
    maxSentenceYears: number;
    carriesDeathOrLife: boolean;
    isFirstTimeOffender: boolean;
    pendingCaseCount: number;
    custodyStartDate: string;
    caseStatus?: CaseStatus;
  };
}

export interface EligiblePrisonerRow {
  prisonerId: string;
  fullName: string;
  prisonerRegNo: string;
  caseNumber: string;
  offence: string;
  custodyDays: number;
  eligibilityReason: string;
  maxSentenceYears: number;
  carriesDeathOrLife: boolean;
  isFirstTimeOffender: boolean;
  pendingCaseCount: number;
}

export interface AutoDraftOutcome {
  prisonerId: string;
  ok: boolean;
  applicationId?: string;
  documentUrl?: string;
  llmSource?: "openai" | "template";
  error?: string;
}

export interface CourtTrackingRow {
  applicationId: string;
  prisonerId: string;
  prisonerName: string;
  caseNumber: string;
  cnrNumber: string | null;
  stage: ApplicationStage;
  hearingDate: string | null;
  orderOutcome: string | null;
  daysSinceFiled: number | null;
}

export interface AvailableLawyer {
  lawyerId: string;
  name: string;
  email: string;
  activeCases: number;
}

export interface UnassignedRow {
  applicationId: string;
  prisonerId: string;
  prisonerName: string;
  prisonerRegNo: string;
  caseNumber: string;
  stage: ApplicationStage;
  openedAt: string;
}

export interface SuretyStatusDto {
  bondAmount: number | null;
  suretyRequired: boolean;
  suretyArranged: boolean;
  arrangedAt: string | null;
  notes: string | null;
}

export interface GrantedSuretyRow {
  applicationId: string;
  prisonerName: string;
  stage: ApplicationStage;
  orderOutcome: string | null;
  bondAmount: number | null;
  suretyRequired: boolean;
  suretyArranged: boolean;
  arrangedAt: string | null;
  notes: string | null;
}

export interface ProjectionPoint {
  day: number;
  baseline: number;
  projected: number;
}

export interface OvercrowdingRollup {
  jails: {
    jailId: string;
    name: string;
    district: string;
    state: string;
    occupancy: number;
    sanctionedCapacity: number;
    capacityPct: number;
    eligibleButUnprocessed: number;
  }[];
  totals: {
    occupancy: number;
    sanctionedCapacity: number;
    capacityPct: number;
    eligibleButUnprocessed: number;
  };
  projection30: {
    baselineSum: number;
    projectedSum: number;
  };
}

export interface ComplianceMetrics {
  eligibleIdentified: number;
  applicationsFiled: number;
  releasesCompleted: number;
  avgDaysFlaggedToReleased: number | null;
}

// ---------- NGO job posting + recommendations (Prompt: employment pipeline) ----------

export type JobStatus = "active" | "paused" | "closed";

export interface JobPostingDto {
  id: string;
  ngoId: string;
  ngoName: string;
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredCertificates: string[];
  minExperienceMonths: number;
  jobCategory: string;
  district: string;
  status: JobStatus;
  openings: number | null;
  wageInfo: string | null;
  createdAt: string;
  applicationCount?: number;
}

export interface CreateJobInput {
  title: string;
  description?: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  requiredCertificates?: string[];
  minExperienceMonths?: number;
  jobCategory?: string;
  district?: string;
  openings?: number | null;
  wageInfo?: string | null;
}

export type JobApplicationStatus = "pending" | "shortlisted" | "rejected" | "hired";

export interface TrainingRecordDto {
  program: string;
  category: string;
  status: "completed" | "in_progress" | "enrolled";
  progressPct: number;
  certificateUrl: string | null;
  completedAt: string | null;
}

export interface JobApplicationDto {
  id: string;
  jobId: string;
  jobTitle: string;
  prisonerId: string;
  prisonerName: string;
  prisonerRegNo: string;
  jailName: string;
  jailDistrict: string;
  jailPhone: string | null;
  skills: string[];
  educationBaseline: string | null;
  machinerySkills: string | null;
  targetDomain: string | null;
  training: TrainingRecordDto[];
  status: JobApplicationStatus;
  note: string | null;
  appliedAt: string;
}

export interface NgoStatsDto {
  activeJobs: number;
  pausedJobs: number;
  closedJobs: number;
  totalApplications: number;
  pendingApplications: number;
  shortlistedApplications: number;
  topDistricts: { district: string; jobs: number }[];
}

export interface RecommendationDto {
  job_id: string;
  score: number;
  cosine_similarity: number;
  eligible_for_recommendation: boolean;
  explanation: string;
  matched_required_skills: string[];
  missing_required_skills: string[];
  ineligibility_reasons: string[];
  component_scores: Record<string, number>;
  job: JobPostingDto;
  appliedAlready: boolean;
}

// ---------- Prisoner portal (Prompt 10) ----------

export interface PortalPrisonerDto {
  prisonerId: string;
  fullName: string;
  prisonerRegNo: string;
  jailName: string;
}

export interface PortalLoginResponse {
  accessToken: string;
  pinChangeRequired: boolean;
  prisoner: PortalPrisonerDto;
}

export type PortalEligibilityStatus = EligibilityStatus | "none";

export interface PortalProfileDto {
  prisonerId: string;
  fullName: string;
  prisonerRegNo: string;
  photoUrl: string | null;
  gender: string;
  jailName: string;
  jailDistrict: string;
  admissionDate: string | null;
  custodyDurationLabel: string;
  eligibility: {
    status: PortalEligibilityStatus;
    headline: string;
    plainReason: string;
    computedAt: string | null;
  };
  applications: ApplicationDto[];
}

export type PortalDocumentKind = "skill_certificate" | "application_document";

export interface PortalDocumentDto {
  id: string;
  kind: PortalDocumentKind;
  title: string;
  detail: string;
  issuedAt: string | null;
  url: string;
}
