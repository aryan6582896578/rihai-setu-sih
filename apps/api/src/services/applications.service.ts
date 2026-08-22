import {
  ApplicationStage,
  STAGE_ORDER,
  type ApplicationDto,
} from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";
import { normalizeStageHistory } from "./prisoners.service.js";

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
    stageHistory: normalizeStageHistory(a.stageHistory as PrismaJson),
  };
}

type PrismaJson = Record<string, string>;

async function appendStage(
  applicationId: string,
  stage: ApplicationStage,
  extraData: Record<string, unknown> = {},
) {
  const current = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  });
  const history = normalizeStageHistory(current.stageHistory);
  history[stage] = new Date().toISOString();
  return prisma.application.update({
    where: { id: applicationId },
    data: { stage, stageHistory: history, ...extraData },
  });
}

export async function createManualApplication(
  prisonerId: string,
  type: "bail" | "personal_bond",
): Promise<ApplicationDto> {
  const activeApp = await prisma.application.findFirst({
    where: { prisonerId, stage: { notIn: ["order_passed", "released"] } },
  });
  if (activeApp) throw ApiError.conflict("An active application already exists for this prisoner");

  const app = await prisma.application.create({
    data: {
      prisonerId,
      type,
      stage: ApplicationStage.Flagged,
      stageHistory: { [ApplicationStage.Flagged]: new Date().toISOString() },
    },
    include: { reviewer: { select: { name: true } } },
  });
  return toApplicationDto(app);
}

export async function advanceStage(
  applicationId: string,
  target: ApplicationStage,
): Promise<ApplicationDto> {
  const app = await getApplicationOrFail(applicationId);

  const fromIdx = stageIndex(app.stage);
  const toIdx = stageIndex(target);
  if (toIdx < 0) throw ApiError.badRequest("Unknown target stage");
  if (toIdx === fromIdx) throw ApiError.conflict(`Application is already at stage ${target}`);
  if (toIdx < fromIdx) {
    throw ApiError.conflict("Stages can only move forward — application history cannot be rewritten");
  }

  if (target === ApplicationStage.Filed && !app.reviewedBy) {
    throw new ApiError(
      409,
      "REVIEW_REQUIRED",
      "This application must be marked Reviewed by a DLSA lawyer or superintendent before it can be filed",
    );
  }

  const extra: Record<string, unknown> = {};
  if (target === ApplicationStage.Filed && !app.filedDate) extra.filedDate = new Date();

  const updated = await appendStage(app.id, target, extra);
  logger.info(`Application ${app.id} advanced ${app.stage} -> ${target}`);

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
