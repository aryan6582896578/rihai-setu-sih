import {
  ApplicationStage,
  type ApplicationDto,
} from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { courtStatusProvider } from "../lib/court-status-provider.js";
import { piiPublic } from "../lib/pii.js";
import { ApiError } from "../middleware/errors.js";
import { getPrimaryCase } from "./eligibility.service.js";
import { appendStage, toApplicationDto } from "./applications.service.js";
import { sendFamilyEvent } from "./family-notifications.service.js";

const MS_PER_DAY = 86_400_000;

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

export async function getCourtTracking(jailId: string): Promise<CourtTrackingRow[]> {
  const apps = await prisma.application.findMany({
    where: {
      prisoner: { jailId },
      // Concluded orders stay visible (with their outcome) so superintendents
      // can trace what happened; only released cases leave the court queue.
      stage: {
        in: [ApplicationStage.Filed, ApplicationStage.HearingScheduled, ApplicationStage.OrderPassed],
      },
    },
    include: { prisoner: true },
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();
  const rows: CourtTrackingRow[] = [];
  for (const app of apps) {
    const primary = await getPrimaryCase(app.prisonerId);
    rows.push({
      applicationId: app.id,
      prisonerId: app.prisonerId,
      prisonerName: piiPublic(app.prisoner).fullName,
      caseNumber: primary?.caseNumber ?? "-",
      cnrNumber: primary?.cnrNumber ?? null,
      stage: app.stage,
      hearingDate: app.hearingDate?.toISOString() ?? null,
      orderOutcome: app.orderOutcome,
      daysSinceFiled: app.filedDate
        ? Math.floor((now - app.filedDate.getTime()) / MS_PER_DAY)
        : null,
    });
  }
  return rows.sort((a, b) => (b.daysSinceFiled ?? -1) - (a.daysSinceFiled ?? -1));
}

export async function syncCourtStatus(
  applicationId: string,
  actorId: string,
): Promise<{ application: ApplicationDto; hearingDate: string | null; orderOutcome: string | null }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!app) throw ApiError.notFound("Application not found");
  if (app.stage === ApplicationStage.Released) {
    throw ApiError.conflict("Application has already reached Released stage");
  }

  const primary = await getPrimaryCase(app.prisonerId);
  const cnr = primary?.cnrNumber ?? `MOCK-${app.id.slice(-8).toUpperCase()}`;
  const status = await courtStatusProvider.getStatus(cnr, app.filedDate ?? undefined);

  let stage = app.stage;
  const extra: Record<string, unknown> = {};

  if (status.hearingDate && !app.hearingDate) {
    extra.hearingDate = status.hearingDate;
  }

  const outcome = status.orderOutcome ?? "granted";
  extra.orderOutcome = outcome;
  stage = ApplicationStage.OrderPassed;

  if (outcome === "granted") {
    const existing = await prisma.suretyStatus.findUnique({
      where: { applicationId: app.id },
    });
    if (!existing) {
      await prisma.suretyStatus.create({
        data: { applicationId: app.id, suretyRequired: true },
      });
    }
  }
  if (extra.hearingDate) {
    void sendFamilyEvent(app.id, "hearing_scheduled").catch((err) =>
      logger.error("[notify] hearing hook failed", err),
    );
  }

  const updated = await appendStage(app.id, stage, extra, actorId);

  if (outcome === "granted") {
    void sendFamilyEvent(app.id, "order_granted_bond_required").catch((err) =>
      logger.error("[notify] order granted hook failed", err),
    );
  }

  logger.info(`Court status synced`, {
    applicationId: app.id,
    cnr,
    outcome: outcome,
    newStage: updated.stage,
    byUser: actorId,
  });

  return {
    application: toApplicationDto({ ...updated, reviewer: null }),
    hearingDate: updated.hearingDate?.toISOString() ?? null,
    orderOutcome: updated.orderOutcome ?? outcome,
  };
}



// ---------- Legal aid assignment ----------

export interface UnassignedRow {
  applicationId: string;
  prisonerId: string;
  prisonerName: string;
  prisonerRegNo: string;
  caseNumber: string;
  stage: ApplicationStage;
  openedAt: string;
}

export async function getUnassignedQueue(jailId: string): Promise<UnassignedRow[]> {
  // Any application still short of release can need a DLSA lawyer (Prompt 4:
  // the queue key is "no LegalAidAssignment yet", not a particular stage).
  const apps = await prisma.application.findMany({
    where: {
      prisoner: { jailId },
      legalAidAssignment: { is: null },
      stage: { not: ApplicationStage.Released },
    },
    include: { prisoner: true },
    orderBy: { updatedAt: "asc" },
  });

  const rows: UnassignedRow[] = [];
  for (const app of apps) {
    const primary = await getPrimaryCase(app.prisonerId);
    const pii = piiPublic(app.prisoner);
    rows.push({
      applicationId: app.id,
      prisonerId: app.prisonerId,
      prisonerName: pii.fullName,
      prisonerRegNo: app.prisoner.prisonerRegNo,
      caseNumber: primary?.caseNumber ?? "-",
      stage: app.stage,
      openedAt: app.updatedAt.toISOString(),
    });
  }
  return rows;
}

export async function listAvailableLawyers(jailId: string) {
  const accesses = await prisma.jailAccess.findMany({
    where: { jailId, roleAtJail: "dlsa_lawyer", user: { isActive: true } },
    include: {
      user: {
        select: { id: true, name: true, email: true, _count: { select: { legalAidAssignments: true } } },
      },
    },
  });
  return accesses
    .map((a) => ({
      lawyerId: a.user.id,
      name: a.user.name,
      email: a.user.email,
      activeCases: a.user._count.legalAidAssignments,
    }))
    .sort((x, y) => x.activeCases - y.activeCases);
}

export async function assignLawyer(
  applicationId: string,
  opts: { method: "round_robin" | "manual"; lawyerId?: string; actorId: string },
): Promise<{ lawyerName: string; method: string }> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!app) throw ApiError.notFound("Application not found");

  const existing = await prisma.legalAidAssignment.findUnique({
    where: { applicationId },
    include: { lawyer: { select: { name: true } } },
  });
  if (existing) {
    return { lawyerName: existing.lawyer.name, method: existing.method };
  }

  const lawyers = await listAvailableLawyers(app.prisoner.jailId);
  if (lawyers.length === 0) {
    throw ApiError.conflict("No active DLSA lawyer has JailAccess to this jail");
  }

  let chosen = lawyers[0];
  if (!chosen) {
    throw ApiError.conflict("No active DLSA lawyer has JailAccess to this jail");
  }
  if (opts.method === "manual") {
    if (!opts.lawyerId) throw ApiError.badRequest("lawyerId required for manual assignment");
    const match = lawyers.find((l) => l.lawyerId === opts.lawyerId);
    if (!match) throw ApiError.conflict("Selected lawyer is not an active DLSA lawyer at this jail");
    chosen = match;
  }

  await prisma.legalAidAssignment.create({
    data: {
      applicationId,
      lawyerId: chosen.lawyerId,
      method: opts.method,
    },
  });
  logger.info(`DLSA lawyer assigned`, {
    applicationId,
    lawyerId: chosen.lawyerId,
    method: opts.method,
    byUser: opts.actorId,
  });
  return { lawyerName: chosen.name, method: opts.method };
}

// ---------- Surety checklist ----------

export async function getSuretyStatus(applicationId: string) {
  const s = await prisma.suretyStatus.findUnique({ where: { applicationId } });
  return s
    ? {
        bondAmount: s.bondAmount,
        suretyRequired: s.suretyRequired,
        suretyArranged: s.suretyArranged,
        arrangedAt: s.arrangedAt?.toISOString() ?? null,
        notes: s.notes,
      }
    : null;
}

export async function upsertSuretyStatus(
  applicationId: string,
  input: { bondAmount?: number; suretyRequired?: boolean; suretyArranged?: boolean; notes?: string },
) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) throw ApiError.notFound("Application not found");

  const data = {
    ...(input.bondAmount !== undefined ? { bondAmount: input.bondAmount } : {}),
    ...(input.suretyRequired !== undefined ? { suretyRequired: input.suretyRequired } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.suretyArranged !== undefined
      ? {
          suretyArranged: input.suretyArranged,
          arrangedAt: input.suretyArranged ? new Date() : null,
        }
      : {}),
  };

  const existing = await prisma.suretyStatus.findUnique({ where: { applicationId } });
  const s = existing
    ? await prisma.suretyStatus.update({ where: { applicationId }, data })
    : await prisma.suretyStatus.create({
        data: { applicationId, ...data, suretyRequired: data.suretyRequired ?? true },
      });

  // Prompt 11: the flip to arranged (not a re-save of an already-arranged
  // checklist) tells the family release processing is underway.
  const flippedToArranged =
    input.suretyArranged === true && !(existing?.suretyArranged ?? false);
  if (flippedToArranged) {
    void sendFamilyEvent(applicationId, "surety_arranged").catch((err) =>
      logger.error("[notify] surety hook failed", err),
    );
  }

  return {
    bondAmount: s.bondAmount,
    suretyRequired: s.suretyRequired,
    suretyArranged: s.suretyArranged,
    arrangedAt: s.arrangedAt?.toISOString() ?? null,
    notes: s.notes,
  };
}

export async function getAssignedLawyerMap(applicationIds: string[]): Promise<Map<string, string>> {
  if (applicationIds.length === 0) return new Map();
  const rows = await prisma.legalAidAssignment.findMany({
    where: { applicationId: { in: applicationIds } },
    include: { lawyer: { select: { name: true, email: true } } },
  });
  return new Map(rows.map((r) => [r.applicationId, `${r.lawyer.name} (${r.lawyer.email})`]));
}

export async function getSuretyGrantedList(jailId: string) {
  const apps = await prisma.application.findMany({
    where: { prisoner: { jailId }, orderOutcome: "granted" },
    include: { prisoner: true, suretyStatus: true },
    orderBy: { updatedAt: "desc" },
  });
  return apps.map((a) => ({
    applicationId: a.id,
    prisonerName: piiPublic(a.prisoner).fullName,
    stage: a.stage,
    orderOutcome: a.orderOutcome,
    bondAmount: a.suretyStatus?.bondAmount ?? null,
    suretyRequired: a.suretyStatus?.suretyRequired ?? false,
    suretyArranged: a.suretyStatus?.suretyArranged ?? false,
    arrangedAt: a.suretyStatus?.arrangedAt?.toISOString() ?? null,
    notes: a.suretyStatus?.notes ?? "",
  }));
}

