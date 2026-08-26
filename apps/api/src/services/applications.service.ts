import {
  ApplicationStage,
  STAGE_ORDER,
  type ApplicationDto,
  type StageHistoryEntry,
} from "@rihai/shared-types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";
import { normalizeStageHistory } from "./prisoners.service.js";
import { notifyStageChange } from "./notifications.service.js";

export async function getApplicationOrFail(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!app) throw ApiError.notFound("Application not found");
  return app;
}

export function stageIndex(stage: ApplicationStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function toApplicationDto(a: {
  id: string;
  type: "bail" | "personal_bond";
  stage: ApplicationStage;
  generatedDocumentUrl: string | null;
  filedDate: Date | null;
  hearingDate: Date | null;
  orderOutcome: string | null;
  reviewedBy: string | null;
  reviewer?: { name: string } | null;
  reviewedAt: Date | null;
  updatedAt: Date;
  stageHistory: unknown;
}): ApplicationDto {
  return {
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
  };
}

async function actorName(userId?: string): Promise<string | undefined> {
  if (!userId) return undefined;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name;
}

function entry(at: Date, byName?: string, note?: string): StageHistoryEntry {
  return { at: at.toISOString(), ...(byName ? { byName } : {}), ...(note ? { note } : {}) };
}

export async function createManualApplication(
  prisonerId: string,
  type: "bail" | "personal_bond",
  actorId: string,
): Promise<ApplicationDto> {
  const activeApp = await prisma.application.findFirst({
    where: { prisonerId, stage: { notIn: ["order_passed", "released"] } },
  });
  if (activeApp) throw ApiError.conflict("An active application already exists for this prisoner");

  const byName = await actorName(actorId);
  const app = await prisma.application.create({
    data: {
      prisonerId,
      type,
      stage: ApplicationStage.Flagged,
      stageHistory: {
        [ApplicationStage.Flagged]: entry(new Date(), byName, "Opened manually"),
      } as unknown as Prisma.InputJsonValue,
    },
    include: { reviewer: { select: { name: true } } },
  });
  logger.info(`Manual application opened`, { prisonerId, applicationId: app.id, byUser: actorId });
  return toApplicationDto(app);
}

export async function appendStage(
  applicationId: string,
  stage: ApplicationStage,
  extraData: Record<string, unknown> = {},
  actorId?: string,
) {
  const current = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  });
  const history = normalizeStageHistory(current.stageHistory);
  history[stage] = entry(new Date(), await actorName(actorId));
  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { stage, stageHistory: history as unknown as Prisma.InputJsonValue, ...extraData },
  });

  if (stage !== current.stage) {
    void notifyStageChange(applicationId, stage).catch((err) =>
      logger.error("[notify] stage-change hook failed", err),
    );
  }
  return updated;
}

export async function advanceStage(
  applicationId: string,
  target: ApplicationStage,
  actorId: string,
): Promise<ApplicationDto> {
  const app = await getApplicationOrFail(applicationId);

  const fromIdx = stageIndex(app.stage);
  const toIdx = stageIndex(target);
  if (toIdx < 0) throw ApiError.badRequest("Unknown target stage");
  if (toIdx === fromIdx) throw ApiError.conflict(`Application is already at stage ${target}`);
  if (toIdx < fromIdx) {
    throw ApiError.conflict("Stages can only move forward — application history cannot be rewritten");
  }

  if (target === ApplicationStage.Filed) {
    // Two-step gate: a formal draft must EXIST and be APPROVED before anything
    // reaches the court. Drafts are clerical (any advancing role); approval is
    // the lawyer/superintendent checkpoint.
    if (!app.generatedDocumentUrl) {
      throw new ApiError(
        409,
        "DRAFT_REQUIRED",
        "Generate the formal draft document first — filing in court requires an existing draft",
      );
    }
    if (!app.reviewedBy) {
      throw new ApiError(
        409,
        "REVIEW_REQUIRED",
        "This draft must be approved (marked Reviewed) by a DLSA lawyer or superintendent before it can be filed",
      );
    }
  }

  if (target === ApplicationStage.Released) {
    if (app.orderOutcome !== "granted") {
      throw new ApiError(
        409,
        "ORDER_REQUIRED",
        "Release requires a granted court order — sync the court status first",
      );
    }
    const surety = await prisma.suretyStatus.findUnique({ where: { applicationId: app.id } });
    if (!surety || !surety.suretyArranged) {
      throw new ApiError(
        409,
        "SURETY_PENDING",
        "Bond/surety checklist must be completed (surety arranged) before release",
      );
    }
  }

  const extra: Record<string, unknown> = {};
  if (target === ApplicationStage.Filed && !app.filedDate) extra.filedDate = new Date();

  const updated = await appendStage(app.id, target, extra, actorId);
  logger.info(`Application ${app.id} advanced ${app.stage} -> ${target}`, { byUser: actorId });

  return toApplicationDto({ ...updated, reviewer: null });
}

export async function markReviewed(applicationId: string, reviewerId: string): Promise<ApplicationDto> {
  const app = await getApplicationOrFail(applicationId);
  if (stageIndex(app.stage) >= stageIndex(ApplicationStage.Filed)) {
    throw ApiError.conflict("Application has already been filed");
  }
  const updated = await prisma.application.update({
    where: { id: app.id },
    data: { reviewedBy: reviewerId, reviewedAt: new Date() },
    include: { reviewer: { select: { name: true } } },
  });
  logger.info(`Application ${app.id} marked reviewed`, { reviewerId });
  return toApplicationDto(updated);
}
