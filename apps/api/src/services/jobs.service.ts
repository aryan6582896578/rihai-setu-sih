import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { piiPublic } from "../lib/pii.js";
import { audit } from "../lib/audit.js";
import { notifyJobApplicationStatus } from "./notifications.service.js";
import { sendPrisonerFamilyEvent, type FamilyEventKey } from "./family-notifications.service.js";
import { ApiError } from "../middleware/errors.js";
import type {
  CreateJobInput,
  JobApplicationDto,
  JobPostingDto,
  JobStatus,
  NgoStatsDto,
} from "@rihai/shared-types";

/**
 * NGO job-posting domain — the operational half of the employment pipeline.
 * Job rows live in the shared Postgres database and are mapped into the Python
 * recommender's stable Job contract at call time (see recommendations.service).
 */

function toJobDto(
  j: Prisma.JobPostingGetPayload<{ include: { ngo: { select: { name: true } } } }>,
  applicationCount?: number,
): JobPostingDto {
  return {
    id: j.id,
    ngoId: j.ngoId,
    ngoName: j.ngo.name,
    title: j.title,
    description: j.description,
    requiredSkills: j.requiredSkills,
    preferredSkills: j.preferredSkills,
    requiredCertificates: j.requiredCertificates,
    minExperienceMonths: j.minExperienceMonths,
    jobCategory: j.jobCategory,
    district: j.district,
    status: j.status as JobStatus,
    openings: j.openings,
    wageInfo: j.wageInfo,
    createdAt: j.createdAt.toISOString(),
    ...(applicationCount !== undefined ? { applicationCount } : {}),
  };
}

export async function createJob(
  ngoId: string,
  input: CreateJobInput,
): Promise<JobPostingDto> {
  const job = await prisma.jobPosting.create({
    data: {
      ngoId,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      requiredSkills: input.requiredSkills,
      preferredSkills: input.preferredSkills ?? [],
      requiredCertificates: input.requiredCertificates ?? [],
      minExperienceMonths: input.minExperienceMonths ?? 0,
      jobCategory: input.jobCategory?.trim() ?? "",
      district: input.district?.trim() ?? "",
      openings: input.openings ?? null,
      wageInfo: input.wageInfo ?? null,
      status: "active",
    },
    include: { ngo: { select: { name: true } } },
  });
  logger.info(`NGO job posted`, { jobId: job.id, ngoId, title: job.title });
  return toJobDto(job, 0);
}

async function getOwnedJob(jobId: string, actor: { id: string; role: string }) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) throw ApiError.notFound("Job posting not found");
  if (actor.role !== "super_admin" && job.ngoId !== actor.id) {
    throw ApiError.forbidden("This posting belongs to another NGO", "JOB_NOT_OWNED");
  }
  return job;
}

export async function listJobsForNgo(ngoId: string): Promise<JobPostingDto[]> {
  const jobs = await prisma.jobPosting.findMany({
    where: { ngoId },
    orderBy: { createdAt: "desc" },
    include: {
      ngo: { select: { name: true } },
      _count: { select: { applications: true } },
    },
  });
  return jobs.map((j) => toJobDto(j, j._count.applications));
}

export async function updateJob(
  jobId: string,
  actor: { id: string; role: string },
  patch: Partial<CreateJobInput> & { status?: JobStatus },
): Promise<JobPostingDto> {
  await getOwnedJob(jobId, actor);
  const updated = await prisma.jobPosting.update({
    where: { id: jobId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.requiredSkills !== undefined ? { requiredSkills: patch.requiredSkills } : {}),
      ...(patch.preferredSkills !== undefined ? { preferredSkills: patch.preferredSkills } : {}),
      ...(patch.requiredCertificates !== undefined
        ? { requiredCertificates: patch.requiredCertificates }
        : {}),
      ...(patch.minExperienceMonths !== undefined
        ? { minExperienceMonths: patch.minExperienceMonths }
        : {}),
      ...(patch.jobCategory !== undefined ? { jobCategory: patch.jobCategory.trim() } : {}),
      ...(patch.district !== undefined ? { district: patch.district.trim() } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.openings !== undefined ? { openings: patch.openings } : {}),
      ...(patch.wageInfo !== undefined ? { wageInfo: patch.wageInfo } : {}),
    },
    include: { ngo: { select: { name: true } } },
  });
  return toJobDto(updated);
}

export async function applyToJob(
  prisonerId: string,
  jobId: string,
  appliedBy: string,
  note?: string,
): Promise<JobApplicationDto> {
  const prisoner = await prisma.prisoner.findUnique({
    where: { id: prisonerId },
    select: { consentToShareProfile: true },
  });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");
  if (!prisoner.consentToShareProfile) {
    await prisma.prisoner.update({
      where: { id: prisonerId },
      data: { consentToShareProfile: true },
    });
  }

  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    include: { ngo: { select: { name: true } } },
  });
  if (!job) throw ApiError.notFound("Job posting not found");
  if (job.status !== "active") {
    throw ApiError.conflict("This posting is not accepting applications right now");
  }

  const dup = await prisma.jobApplication.findUnique({
    where: { jobId_prisonerId: { jobId, prisonerId } },
  });
  if (dup) throw ApiError.conflict("An application for this job already exists");

  const app = await prisma.jobApplication.create({
    data: { jobId, prisonerId, appliedBy, ...(note ? { note } : {}) },
  });

  audit({
    actorId: appliedBy,
    action: "job_application.create",
    entityType: "JobPosting",
    entityId: jobId,
    fieldsTouched: [`prisoner:${prisonerId}`],
  });
  logger.info(`Prisoner applied to job`, { jobId, prisonerId, byUser: appliedBy });

  return buildApplicationDto(app.id);
}

export async function buildApplicationDto(applicationRowId: string): Promise<JobApplicationDto> {
  const app = await prisma.jobApplication.findUniqueOrThrow({
    where: { id: applicationRowId },
    include: {
      job: true,
      prisoner: {
        include: {
          jail: { select: { name: true, district: true, contactPhone: true } },
          enrollments: { include: { program: true }, orderBy: { id: "asc" } },
        },
      },
    },
  });
  const pii = piiPublic(app.prisoner);
  const skills = app.prisoner.enrollments
    .filter((e) => e.status === "completed")
    .map((e) => e.program.name);
  return {
    id: app.id,
    jobId: app.jobId,
    jobTitle: app.job.title,
    prisonerId: app.prisonerId,
    prisonerName: pii.fullName,
    prisonerRegNo: app.prisoner.prisonerRegNo,
    jailName: app.prisoner.jail.name,
    jailDistrict: app.prisoner.jail.district,
    jailPhone: app.prisoner.jail.contactPhone,
    skills,
    educationBaseline: app.prisoner.educationBaseline,
    machinerySkills: app.prisoner.machinerySkills,
    targetDomain: app.prisoner.targetDomain,
    training: app.prisoner.enrollments.map((e) => ({
      program: e.program.name,
      category: e.program.category,
      status: e.status,
      progressPct: e.progressPct,
      certificateUrl: e.certificateUrl,
      completedAt: e.completedAt?.toISOString() ?? null,
    })),
    status: app.status as JobApplicationDto["status"],
    note: app.note,
    appliedAt: app.appliedAt.toISOString(),
  };
}

const NG0_APPLICATION_STATUSES = ["pending", "shortlisted", "rejected", "hired"] as const;

export async function updateApplicationStatus(
  applicationRowId: string,
  actor: { id: string; role: string },
  status: (typeof NG0_APPLICATION_STATUSES)[number],
): Promise<JobApplicationDto> {
  const app = await prisma.jobApplication.findUnique({
    where: { id: applicationRowId },
    include: {
      job: { select: { ngoId: true, title: true } },
      prisoner: {
        select: { jailId: true, consentToShareProfile: true },
      },
    },
  });
  if (!app) throw ApiError.notFound("Job application not found");
  if (actor.role !== "super_admin" && app.job.ngoId !== actor.id) {
    throw ApiError.forbidden("This application belongs to another NGO's posting", "APPLICATION_NOT_OWNED");
  }
  await prisma.jobApplication.update({ where: { id: applicationRowId }, data: { status } });

  // Tell the facility: staff coordinate the next steps on the ground.
  if (status !== "pending") {
    const dto = await buildApplicationDto(applicationRowId);
    const ngo = await prisma.user.findUnique({
      where: { id: app.job.ngoId },
      select: { name: true },
    });
    void notifyJobApplicationStatus({
      jailId: app.prisoner.jailId,
      applicationId: applicationRowId,
      prisonerName: dto.prisonerName,
      jobTitle: app.job.title,
      ngoName: ngo?.name ?? "An NGO partner",
      status: status as "shortlisted" | "hired" | "rejected",
    }).catch((err) => logger.error("[notify] job application status hook failed", err));

    // Templated family update via SMS/WhatsApp (consent-gated inside the
    // notification service; fire-and-forget by design).
    const familyEvent: FamilyEventKey | null =
      status === "shortlisted"
        ? "job_application_shortlisted"
        : status === "hired"
          ? "job_application_hired"
          : status === "rejected"
            ? "job_application_rejected"
            : null;
    if (familyEvent) {
      void sendPrisonerFamilyEvent({
        prisonerId: app.prisonerId,
        entityType: "JobApplication",
        entityId: applicationRowId,
        eventKey: familyEvent,
        extraVars: { job_title: app.job.title, ngo_name: ngo?.name ?? undefined },
      }).catch((err) => logger.error("[family] job application event failed", err));
    }

    audit({
      actorId: actor.id,
      action: "job_application.status",
      entityType: "JobApplication",
      entityId: applicationRowId,
      fieldsTouched: [`status:${status}`],
    });
  }
  return buildApplicationDto(applicationRowId);
}

export async function listApplicants(jobId: string, actor: { id: string; role: string }) {
  await getOwnedJob(jobId, actor);
  // Consent gate: profiles of prisoners without share-consent never reach NGOs.
  const apps = await prisma.jobApplication.findMany({
    where: { jobId, prisoner: { consentToShareProfile: true } },
    orderBy: { appliedAt: "desc" },
    select: { id: true },
  });
  return Promise.all(apps.map((a) => buildApplicationDto(a.id)));
}

export async function listApplicationsForPrisoner(prisonerId: string): Promise<JobApplicationDto[]> {
  const apps = await prisma.jobApplication.findMany({
    where: { prisonerId },
    orderBy: { appliedAt: "desc" },
    select: { id: true },
  });
  return Promise.all(apps.map((a) => buildApplicationDto(a.id)));
}

export async function ngoStats(ngoId: string): Promise<NgoStatsDto> {
  const [byStatus, totalApps, pendingApps, shortlistedApps, districts] = await Promise.all([
    prisma.jobPosting.groupBy({ by: ["status"], _count: { _all: true }, where: { ngoId } }),
    prisma.jobApplication.count({ where: { job: { ngoId } } }),
    prisma.jobApplication.count({ where: { job: { ngoId }, status: "pending" } }),
    prisma.jobApplication.count({ where: { job: { ngoId }, status: "shortlisted" } }),
    prisma.jobPosting.groupBy({ by: ["district"], _count: { _all: true }, where: { ngoId } }),
  ]);
  const get = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  return {
    activeJobs: get("active"),
    pausedJobs: get("paused"),
    closedJobs: get("closed"),
    totalApplications: totalApps,
    pendingApplications: pendingApps,
    shortlistedApplications: shortlistedApps,
    topDistricts: districts
      .map((d) => ({ district: d.district || "-", jobs: d._count._all }))
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 5),
  };
}
