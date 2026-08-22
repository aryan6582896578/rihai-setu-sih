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
  stageHistory: Record<string, string>;
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
