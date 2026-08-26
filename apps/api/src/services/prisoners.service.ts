import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ApplicationStage,
  CaseStatus,
  EligibilityStatus,
  type ApplicationDto,
  type CaseRecordDto,
  type EligibilityAssessmentDto,
  type EnrollmentDto,
  type NoteDto,
  type Paginated,
  type PrisonerDetail,
  type PrisonerListItem,
  type StageHistoryEntry,
} from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { storage } from "../lib/storage.js";
import { blindIndex, decryptField, piiPublic, piiWriteFragment } from "../lib/pii.js";
import { audit } from "../lib/audit.js";
import { ApiError } from "../middleware/errors.js";
import { getPrimaryCase, recomputeForPrisoner } from "./eligibility.service.js";
import { buildCertificateHtml } from "./certificates.service.js";
import { sendPrisonerFamilyEvent } from "./family-notifications.service.js";

const MS_PER_DAY = 86_400_000;

export function custodyLabel(days: number): string {
  if (days < 0) return "0 days";
  const months = Math.floor(days / 30.4375);
  const rem = days - Math.floor(months * 30.4375);
  if (months <= 0) return `${days} day${days === 1 ? "" : "s"}`;
  return `${months} mo ${rem} d`;
}

function toCaseDto(c: {
  id: string;
  cnrNumber: string | null;
  caseNumber: string;
  courtName: string;
  offence: string;
  maxSentenceYears: number;
  carriesDeathOrLife: boolean;
  isFirstTimeOffender: boolean;
  pendingCaseCount: number;
  custodyStartDate: Date;
  caseStatus: CaseStatus;
  updatedAt: Date;
}): CaseRecordDto {
  return {
    id: c.id,
    cnrNumber: c.cnrNumber,
    caseNumber: c.caseNumber,
    courtName: c.courtName,
    offence: c.offence,
    maxSentenceYears: c.maxSentenceYears,
    carriesDeathOrLife: c.carriesDeathOrLife,
    isFirstTimeOffender: c.isFirstTimeOffender,
    pendingCaseCount: c.pendingCaseCount,
    custodyStartDate: c.custodyStartDate.toISOString(),
    caseStatus: c.caseStatus,
    updatedAt: c.updatedAt.toISOString(),
  };
}

interface ListRowRaw {
  id: string;
  full_name_enc: string | null;
  full_name: string | null;
  prisoner_reg_no: string;
  case_number: string | null;
  offence: string | null;
  custody_start_date: Date | null;
  elig_status: EligibilityStatus | null;
  elig_reason: string | null;
  app_stage: string | null;
}

export interface ListPrisonersQuery {
  page: number;
  pageSize: number;
  search?: string;
  eligibility?: string;
  stage?: string;
}

export async function listPrisoners(
  jailId: string,
  q: ListPrisonersQuery,
): Promise<Paginated<PrisonerListItem>> {
  // Tier-1 names are encrypted at rest; exact-name search goes through the HMAC
  // blind index. Reg-no and case-number (Tier-2) stay ILIKE-searchable.
  const nameIdx = blindIndex(q.search);
  const searchClause = q.search
    ? Prisma.sql` AND (p.name_idx = ${nameIdx} OR p.prisoner_reg_no ILIKE ${"%" + q.search + "%"} OR c.case_number ILIKE ${"%" + q.search + "%"})`
    : Prisma.empty;

  const eligibilityClause =
    q.eligibility === "pending"
      ? Prisma.sql` AND ea.id IS NULL`
      : q.eligibility
        ? Prisma.sql` AND ea.status::text = ${q.eligibility}`
        : Prisma.empty;

  const stageClause =
    q.stage === "none"
      ? Prisma.sql` AND a.id IS NULL`
      : q.stage
        ? Prisma.sql` AND a.stage::text = ${q.stage}`
        : Prisma.empty;

  const lateral = Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT c.* FROM "CaseRecord" c WHERE c.prisoner_id = p.id
      ORDER BY (CASE WHEN c.case_status = 'undertrial' THEN 0 ELSE 1 END), c.updated_at DESC
      LIMIT 1
    ) c ON TRUE
    LEFT JOIN LATERAL (
      SELECT e.id, e.status, e.reason FROM "EligibilityAssessment" e
      WHERE e.prisoner_id = p.id ORDER BY e.computed_at DESC LIMIT 1
    ) ea ON TRUE
    LEFT JOIN LATERAL (
      SELECT a.id, a.stage FROM "Application" a
      WHERE a.prisoner_id = p.id ORDER BY a.updated_at DESC LIMIT 1
    ) a ON TRUE
  `;

  const whereBase = Prisma.sql`FROM "Prisoner" p ${lateral} WHERE p.jail_id = ${jailId} ${searchClause} ${eligibilityClause} ${stageClause}`;

  const [rowsRaw, countRows] = await Promise.all([
    prisma.$queryRaw<ListRowRaw[]>(Prisma.sql`
      SELECT p.id, p.full_name_enc, p.full_name, p.prisoner_reg_no,
             c.case_number, c.offence, c.custody_start_date,
             ea.status AS elig_status, ea.reason AS elig_reason,
             a.stage AS app_stage
      ${whereBase}
      ORDER BY p.name_idx ASC NULLS LAST, p.prisoner_reg_no ASC
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}
    `),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n ${whereBase}`),
  ]);

  const now = new Date();
  const data: PrisonerListItem[] = rowsRaw.map((r) => {
    const custodyDays = r.custody_start_date
      ? Math.floor((now.getTime() - r.custody_start_date.getTime()) / MS_PER_DAY)
      : 0;
    return {
      id: r.id,
      fullName: decryptField(r.full_name_enc) ?? r.full_name ?? "",
      prisonerRegNo: r.prisoner_reg_no,
      caseNumber: r.case_number ?? "-",
      offence: r.offence ?? "-",
      custodyDays,
      custodyDurationLabel: r.custody_start_date ? custodyLabel(custodyDays) : "-",
      eligibility:
        r.elig_status !== null
          ? { status: r.elig_status, reason: r.elig_reason ?? undefined }
          : { status: "pending" },
      applicationStage: (r.app_stage as ApplicationStage | null) ?? null,
    };
  });

  return { data, page: q.page, pageSize: q.pageSize, total: Number(countRows[0]?.n ?? 0n) };
}

export async function getPrisonerDetail(prisonerId: string, auditCtx?: { actorId?: string; actorName?: string; ip?: string }): Promise<PrisonerDetail> {
  const prisoner = await prisma.prisoner.findUnique({
    where: { id: prisonerId },
    include: {
      cases: { orderBy: { updatedAt: "desc" } },
      applications: {
        orderBy: { updatedAt: "desc" },
        include: {
          reviewer: { select: { name: true } },
          legalAidAssignment: { include: { lawyer: { select: { name: true, email: true } } } },
        },
      },
      enrollments: { include: { program: true }, orderBy: { id: "asc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");
  const pii = piiPublic(prisoner);

  audit({
    actorId: auditCtx?.actorId,
    actorName: auditCtx?.actorName,
    action: "prisoner.read",
    entityType: "Prisoner",
    entityId: prisoner.id,
    fieldsTouched: ["full_name", "date_of_birth", "photo_url"],
    ipAddress: auditCtx?.ip,
  });

  const primaryCase = await getPrimaryCase(prisonerId);
  const latestAssessment = await prisma.eligibilityAssessment.findFirst({
    where: { prisonerId },
    orderBy: { computedAt: "desc" },
  });

  const applications: ApplicationDto[] = prisoner.applications.map((a) => ({
    id: a.id,
    type: a.type,
    stage: a.stage,
    generatedDocumentUrl: a.generatedDocumentUrl,
    filedDate: a.filedDate?.toISOString() ?? null,
    hearingDate: a.hearingDate?.toISOString() ?? null,
    orderOutcome: a.orderOutcome,
    reviewedBy: a.reviewedBy,
    reviewedByName: a.reviewer?.name ?? null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
    stageHistory: normalizeStageHistory(a.stageHistory),
    assignedLawyer: a.legalAidAssignment
      ? `${a.legalAidAssignment.lawyer.name} (${a.legalAidAssignment.lawyer.email})`
      : null,
  }));

  const enrollments: EnrollmentDto[] = prisoner.enrollments.map((e) => ({
    id: e.id,
    status: e.status,
    progressPct: e.progressPct,
    certificateUrl: e.certificateUrl,
    completedAt: e.completedAt?.toISOString() ?? null,
    program: { id: e.program.id, name: e.program.name, category: e.program.category },
  }));

  const notes: NoteDto[] = prisoner.notes.map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.author.name,
    createdAt: n.createdAt.toISOString(),
  }));

  let eligibility: EligibilityAssessmentDto | null = null;
  if (latestAssessment) {
    eligibility = {
      id: latestAssessment.id,
      status: latestAssessment.status,
      reason: latestAssessment.reason,
      computedAt: latestAssessment.computedAt.toISOString(),
    };
  }

  return {
    id: prisoner.id,
    jailId: prisoner.jailId,
    fullName: pii.fullName,
    prisonerRegNo: prisoner.prisonerRegNo,
    dateOfBirth: pii.dateOfBirth ?? new Date(0).toISOString(),
    gender: prisoner.gender,
    admissionDate: prisoner.admissionDate.toISOString(),
    photoUrl: pii.photoUrl,
    consentToShareProfile: prisoner.consentToShareProfile,
    cases: prisoner.cases.map(toCaseDto),
    primaryCaseId: primaryCase?.id ?? null,
    eligibility,
    applications,
    enrollments,
    notes,
  };
}

export function normalizeStageHistory(
  raw: unknown,
): Partial<Record<ApplicationStage, StageHistoryEntry>> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: Partial<Record<ApplicationStage, StageHistoryEntry>> = {};
    for (const [stage, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") {
        out[stage as ApplicationStage] = { at: value };
      } else if (value && typeof value === "object" && typeof (value as { at?: unknown }).at === "string") {
        const v = value as { at: string; byName?: string; note?: string };
        out[stage as ApplicationStage] = { at: v.at, byName: v.byName, note: v.note };
      }
    }
    return out;
  }
  return {};
}

async function generateRegNo(jailCode: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = `${jailCode}-P${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.prisoner.findUnique({ where: { prisonerRegNo: candidate } });
    if (!existing) return candidate;
  }
  throw ApiError.conflict("Could not generate a unique registration number — try again");
}

export interface CreatePrisonerServiceInput {
  fullName: string;
  prisonerRegNo?: string;
  dateOfBirth: Date | string;
  gender: string;
  admissionDate?: Date | string;
  // Prompt 11: family contact + consent captured at intake (staff-entered).
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinConsentGiven?: boolean;
  nextOfKinPreferredChannel?: "sms" | "whatsapp";
  nextOfKinPreferredLocale?: "en" | "hi";
  case: {
    cnrNumber?: string;
    caseNumber: string;
    courtName: string;
    offence: string;
    maxSentenceYears: number;
    carriesDeathOrLife: boolean;
    isFirstTimeOffender: boolean;
    pendingCaseCount: number;
    custodyStartDate: Date | string;
    caseStatus: CaseStatus;
  };
}

export async function createPrisoner(
  jailId: string,
  jailCode: string,
  input: CreatePrisonerServiceInput,
  actorId: string,
): Promise<PrisonerDetail> {
  const regNo = input.prisonerRegNo?.trim() || (await generateRegNo(jailCode));
  const regConflict = await prisma.prisoner.findUnique({ where: { prisonerRegNo: regNo } });
  if (regConflict) throw ApiError.conflict(`Registration number ${regNo} already exists`);

  const created = await prisma.$transaction(async (tx) => {
    const prisoner = await tx.prisoner.create({
      data: {
        jailId,
        prisonerRegNo: regNo,
        gender: input.gender,
        admissionDate: input.admissionDate ? new Date(input.admissionDate) : new Date(),
        ...piiWriteFragment({
          fullName: input.fullName.trim(),
          dateOfBirth: input.dateOfBirth,
          ...(input.nextOfKinName !== undefined ? { nextOfKinName: input.nextOfKinName.trim() } : {}),
          ...(input.nextOfKinPhone !== undefined ? { nextOfKinPhone: input.nextOfKinPhone.trim() } : {}),
        }),
        ...(input.nextOfKinConsentGiven !== undefined
          ? { nextOfKinConsentGiven: input.nextOfKinConsentGiven }
          : {}),
        ...(input.nextOfKinPreferredChannel !== undefined
          ? { nextOfKinPreferredChannel: input.nextOfKinPreferredChannel }
          : {}),
        ...(input.nextOfKinPreferredLocale !== undefined
          ? { nextOfKinPreferredLocale: input.nextOfKinPreferredLocale }
          : {}),
      },
    });
    await tx.caseRecord.create({
      data: {
        prisonerId: prisoner.id,
        cnrNumber: input.case.cnrNumber || null,
        caseNumber: input.case.caseNumber.trim(),
        courtName: input.case.courtName.trim(),
        offence: input.case.offence.trim(),
        maxSentenceYears: input.case.maxSentenceYears,
        carriesDeathOrLife: input.case.carriesDeathOrLife,
        isFirstTimeOffender: input.case.isFirstTimeOffender,
        pendingCaseCount: input.case.pendingCaseCount,
        custodyStartDate: new Date(input.case.custodyStartDate),
        caseStatus: input.case.caseStatus ?? CaseStatus.Undertrial,
      },
    });
    return prisoner;
  });

  await recomputeForPrisoner(created.id, { force: true, actor: actorId });
  audit({
    actorId,
    action: "prisoner.write",
    entityType: "Prisoner",
    entityId: created.id,
    fieldsTouched: ["full_name", "date_of_birth", "case_record.create"],
  });
  logger.info(`New prisoner admitted`, { prisonerId: created.id, regNo, byUser: actorId });
  return getPrisonerDetail(created.id);
}

export interface UpdateCaseInput {
  cnrNumber?: string | null;
  caseNumber?: string;
  courtName?: string;
  offence?: string;
  maxSentenceYears?: number;
  carriesDeathOrLife?: boolean;
  isFirstTimeOffender?: boolean;
  pendingCaseCount?: number;
  custodyStartDate?: Date | string;
  caseStatus?: CaseStatus;
}

export async function updateCaseRecord(
  prisonerId: string,
  caseId: string,
  input: UpdateCaseInput,
  actorId: string,
): Promise<{ case: CaseRecordDto; assessment: EligibilityAssessmentDto | null }> {
  const existing = await prisma.caseRecord.findUnique({ where: { id: caseId } });
  if (!existing || existing.prisonerId !== prisonerId) {
    throw ApiError.notFound("Case record not found for this prisoner");
  }

  await prisma.caseRecord.update({
    where: { id: caseId },
    data: {
      ...(input.cnrNumber !== undefined ? { cnrNumber: input.cnrNumber || null } : {}),
      ...(input.caseNumber !== undefined ? { caseNumber: input.caseNumber.trim() } : {}),
      ...(input.courtName !== undefined ? { courtName: input.courtName.trim() } : {}),
      ...(input.offence !== undefined ? { offence: input.offence.trim() } : {}),
      ...(input.maxSentenceYears !== undefined ? { maxSentenceYears: input.maxSentenceYears } : {}),
      ...(input.carriesDeathOrLife !== undefined
        ? { carriesDeathOrLife: input.carriesDeathOrLife }
        : {}),
      ...(input.isFirstTimeOffender !== undefined
        ? { isFirstTimeOffender: input.isFirstTimeOffender }
        : {}),
      ...(input.pendingCaseCount !== undefined ? { pendingCaseCount: input.pendingCaseCount } : {}),
      ...(input.custodyStartDate !== undefined
        ? { custodyStartDate: new Date(input.custodyStartDate) }
        : {}),
      ...(input.caseStatus !== undefined ? { caseStatus: input.caseStatus } : {}),
    },
  });

  const assessment = await recomputeForPrisoner(prisonerId, { force: true, actor: actorId });
  const updated = await prisma.caseRecord.findUniqueOrThrow({ where: { id: caseId } });

  return {
    case: toCaseDto(updated),
    assessment: assessment
      ? {
          id: assessment.id,
          status: assessment.status,
          reason: assessment.reason,
          computedAt: assessment.computedAt.toISOString(),
        }
      : null,
  };
}

export async function updatePersonalInfo(
  prisonerId: string,
  input: {
    fullName?: string;
    dateOfBirth?: Date | string;
    gender?: string;
    admissionDate?: Date | string;
    nextOfKinName?: string;
    nextOfKinPhone?: string;
  },
  auditCtx?: { actorId?: string },
): Promise<void> {
  await prisma.prisoner.update({
    where: { id: prisonerId },
    data: {
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.admissionDate !== undefined ? { admissionDate: new Date(input.admissionDate) } : {}),
      ...piiWriteFragment({
        ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.nextOfKinName !== undefined ? { nextOfKinName: input.nextOfKinName.trim() } : {}),
        ...(input.nextOfKinPhone !== undefined ? { nextOfKinPhone: input.nextOfKinPhone.trim() } : {}),
      }),
    },
  });
  const touched = [
    ...(input.fullName !== undefined ? ["full_name"] : []),
    ...(input.dateOfBirth !== undefined ? ["date_of_birth"] : []),
    ...(input.gender !== undefined ? ["gender"] : []),
    ...(input.admissionDate !== undefined ? ["admission_date"] : []),
    ...(input.nextOfKinName !== undefined ? ["next_of_kin_name"] : []),
    ...(input.nextOfKinPhone !== undefined ? ["next_of_kin_phone"] : []),
  ];
  audit({
    actorId: auditCtx?.actorId,
    action: "prisoner.write",
    entityType: "Prisoner",
    entityId: prisonerId,
    fieldsTouched: touched,
  });
}

export async function setPhotoUrl(
  prisonerId: string,
  photoUrl: string,
  auditCtx?: { actorId?: string },
): Promise<void> {
  await prisma.prisoner.update({
    where: { id: prisonerId },
    data: piiWriteFragment({ photoUrl }),
  });
  audit({
    actorId: auditCtx?.actorId,
    action: "prisoner.write",
    entityType: "Prisoner",
    entityId: prisonerId,
    fieldsTouched: ["photo_url"],
  });
}

// ---- Next-of-kin contact + family-notification consent (Prompt 11) ----

export interface NextOfKinDto {
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  consentGiven: boolean;
  preferredChannel: "sms" | "whatsapp" | null;
  preferredLocale: "en" | "hi" | null;
}

export async function getNextOfKin(prisonerId: string): Promise<NextOfKinDto> {
  const p = await prisma.prisoner.findUniqueOrThrow({
    where: { id: prisonerId },
    select: {
      nextOfKinNameEnc: true,
      nextOfKinName: true,
      nextOfKinPhoneEnc: true,
      nextOfKinPhone: true,
      nextOfKinConsentGiven: true,
      nextOfKinPreferredChannel: true,
      nextOfKinPreferredLocale: true,
    },
  });
  return {
    nextOfKinName: decryptField(p.nextOfKinNameEnc) ?? p.nextOfKinName ?? null,
    nextOfKinPhone: decryptField(p.nextOfKinPhoneEnc) ?? p.nextOfKinPhone ?? null,
    consentGiven: p.nextOfKinConsentGiven,
    preferredChannel: (p.nextOfKinPreferredChannel as "sms" | "whatsapp" | null) ?? null,
    preferredLocale: (p.nextOfKinPreferredLocale as "en" | "hi" | null) ?? null,
  };
}

export async function updateNextOfKin(
  prisonerId: string,
  input: {
    nextOfKinName?: string;
    nextOfKinPhone?: string;
    consentGiven?: boolean;
    preferredChannel?: "sms" | "whatsapp";
    preferredLocale?: "en" | "hi";
  },
  auditCtx?: { actorId?: string; actorName?: string },
): Promise<NextOfKinDto> {
  await prisma.prisoner.update({
    where: { id: prisonerId },
    data: {
      ...piiWriteFragment({
        ...(input.nextOfKinName !== undefined ? { nextOfKinName: input.nextOfKinName.trim() } : {}),
        ...(input.nextOfKinPhone !== undefined ? { nextOfKinPhone: input.nextOfKinPhone.trim() } : {}),
      }),
      ...(input.consentGiven !== undefined
        ? { nextOfKinConsentGiven: input.consentGiven }
        : {}),
      ...(input.preferredChannel !== undefined
        ? { nextOfKinPreferredChannel: input.preferredChannel }
        : {}),
      ...(input.preferredLocale !== undefined
        ? { nextOfKinPreferredLocale: input.preferredLocale }
        : {}),
    },
  });
  const touched = [
    ...(input.nextOfKinName !== undefined ? ["next_of_kin_name"] : []),
    ...(input.nextOfKinPhone !== undefined ? ["next_of_kin_phone"] : []),
    ...(input.consentGiven !== undefined ? ["next_of_kin_consent_given"] : []),
    ...(input.preferredChannel !== undefined ? ["next_of_kin_preferred_channel"] : []),
    ...(input.preferredLocale !== undefined ? ["next_of_kin_preferred_locale"] : []),
  ];
  audit({
    actorId: auditCtx?.actorId,
    actorName: auditCtx?.actorName,
    action: "next_of_kin.write",
    entityType: "Prisoner",
    entityId: prisonerId,
    fieldsTouched: touched,
  });
  logger.info(`Next-of-kin record updated`, { prisonerId, fields: touched });
  return getNextOfKin(prisonerId);
}

export async function addNote(prisonerId: string, authorId: string, body: string): Promise<NoteDto> {
  const note = await prisma.note.create({
    data: { prisonerId, authorId, body: body.trim() },
    include: { author: { select: { name: true } } },
  });
  return {
    id: note.id,
    body: note.body,
    authorName: note.author.name,
    createdAt: note.createdAt.toISOString(),
  };
}

export async function enrollInProgram(prisonerId: string, programId: string): Promise<EnrollmentDto> {
  const program = await prisma.trainingProgram.findUnique({ where: { id: programId } });
  if (!program) throw ApiError.notFound("Training program not found");
  const existing = await prisma.enrollment.findUnique({
    where: { prisonerId_programId: { prisonerId, programId } },
  });
  if (existing) throw ApiError.conflict("Already enrolled in this program");

  const e = await prisma.enrollment.create({
    data: { prisonerId, programId, status: "enrolled", progressPct: 0 },
    include: { program: true },
  });
  return {
    id: e.id,
    status: e.status,
    progressPct: e.progressPct,
    certificateUrl: e.certificateUrl,
    completedAt: e.completedAt?.toISOString() ?? null,
    program: { id: e.program.id, name: e.program.name, category: e.program.category },
  };
}

export async function updateEnrollment(
  enrollmentId: string,
  input: { progressPct?: number; markComplete?: boolean; regenerate?: boolean },
): Promise<EnrollmentDto> {
  const existing = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!existing) throw ApiError.notFound("Enrollment not found");

  const progress =
    input.progressPct !== undefined
      ? Math.max(0, Math.min(100, Math.round(input.progressPct)))
      : existing.progressPct;
  const complete = input.markComplete === true;
  const status = complete ? "completed" : progress >= 100 ? "in_progress" : existing.status;

  let certificateUrl = existing.certificateUrl;
  let completedAt = existing.completedAt;

  if (complete && (!certificateUrl || input.regenerate === true)) {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPct: progress, status, completedAt: completedAt ?? new Date() },
    });
    const certHtml = await buildCertificateHtml(enrollmentId);
    const stored = await storage.save(`certificates/certificate-${enrollmentId}.html`, certHtml);
    certificateUrl = stored.url;
    completedAt = existing.completedAt ?? new Date();
  }

  const e = await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: { progressPct: progress, status, certificateUrl, ...(completedAt ? { completedAt } : {}) },
    include: { program: true },
  });

  // First time this enrollment reaches completed -> tell the family (consent-
  // gated inside the notification service; fire-and-forget by design).
  if (existing.status !== "completed" && e.status === "completed") {
    void sendPrisonerFamilyEvent({
      prisonerId: existing.prisonerId,
      entityType: "Enrollment",
      entityId: enrollmentId,
      eventKey: "skill_course_completed",
      extraVars: { program_name: e.program.name },
    }).catch((err) => logger.error("[family] skill completion event failed", err));
  }

  return {
    id: e.id,
    status: e.status,
    progressPct: e.progressPct,
    certificateUrl: e.certificateUrl,
    completedAt: e.completedAt?.toISOString() ?? null,
    program: { id: e.program.id, name: e.program.name, category: e.program.category },
  };
}

