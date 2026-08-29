import { prisma } from "../lib/prisma.js";
import { ApiError } from "../middleware/errors.js";
import type {
  ProductionRecordDto,
  ProductionSummaryDto,
  JailProductionSummaryDto,
  KaraBazaarListingStatus,
} from "@rihai/shared-types";
import { logger } from "../lib/logger.js";

export async function getPrisonerProduction(prisonerId: string): Promise<ProductionSummaryDto> {
  const prisoner = await prisma.prisoner.findUnique({ where: { id: prisonerId } });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");

  const dbRecords = await prisma.productionRecord.findMany({
    where: { prisonerId },
    include: {
      trainingProgram: { select: { name: true } },
      recordedBy: { select: { name: true } },
    },
    orderBy: { producedAt: "desc" },
  });

  const records: ProductionRecordDto[] = dbRecords.map((r) => ({
    id: r.id,
    prisonerId: r.prisonerId,
    trainingProgramId: r.trainingProgramId,
    trainingProgramName: r.trainingProgram?.name ?? null,
    category: r.category,
    itemName: r.itemName,
    quantity: r.quantity,
    producedAt: r.producedAt.toISOString(),
    saleValueEstimate: r.saleValueEstimate,
    karaBazaarListingStatus: r.karaBazaarListingStatus as KaraBazaarListingStatus,
    karaBazaarListingUrl: r.karaBazaarListingUrl,
    recordedById: r.recordedById,
    recordedByName: r.recordedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  let totalItems = 0;
  let totalValueEstimate = 0;
  const byCategory: Record<string, number> = {};

  for (const r of records) {
    totalItems += r.quantity;
    if (r.saleValueEstimate) {
      totalValueEstimate += r.saleValueEstimate;
    }
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.quantity;
  }

  return {
    totalItems,
    totalValueEstimate,
    byCategory,
    records,
  };
}

export async function createProductionRecord(
  prisonerId: string,
  recordedById: string,
  data: {
    itemName: string;
    category: string;
    quantity: number;
    producedAt?: string | Date;
    trainingProgramId?: string | null;
    saleValueEstimate?: number | null;
    karaBazaarListingStatus?: KaraBazaarListingStatus;
    karaBazaarListingUrl?: string | null;
  },
): Promise<ProductionRecordDto> {
  const prisoner = await prisma.prisoner.findUnique({ where: { id: prisonerId } });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");

  const created = await prisma.productionRecord.create({
    data: {
      prisonerId,
      recordedById,
      itemName: data.itemName.trim(),
      category: data.category.trim(),
      quantity: Math.max(1, data.quantity ?? 1),
      producedAt: data.producedAt ? new Date(data.producedAt) : new Date(),
      trainingProgramId: data.trainingProgramId || null,
      saleValueEstimate: data.saleValueEstimate ?? null,
      karaBazaarListingStatus: data.karaBazaarListingStatus ?? "not_listed",
      karaBazaarListingUrl: data.karaBazaarListingUrl?.trim() || null,
    },
    include: {
      trainingProgram: { select: { name: true } },
      recordedBy: { select: { name: true } },
    },
  });

  logger.info(`Production record created for prisoner ${prisonerId}`, {
    itemName: created.itemName,
    quantity: created.quantity,
    byUser: recordedById,
  });

  return {
    id: created.id,
    prisonerId: created.prisonerId,
    trainingProgramId: created.trainingProgramId,
    trainingProgramName: created.trainingProgram?.name ?? null,
    category: created.category,
    itemName: created.itemName,
    quantity: created.quantity,
    producedAt: created.producedAt.toISOString(),
    saleValueEstimate: created.saleValueEstimate,
    karaBazaarListingStatus: created.karaBazaarListingStatus as KaraBazaarListingStatus,
    karaBazaarListingUrl: created.karaBazaarListingUrl,
    recordedById: created.recordedById,
    recordedByName: created.recordedBy?.name ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function updateProductionRecord(
  recordId: string,
  data: {
    karaBazaarListingStatus?: KaraBazaarListingStatus;
    karaBazaarListingUrl?: string | null;
    saleValueEstimate?: number | null;
  },
): Promise<ProductionRecordDto> {
  const existing = await prisma.productionRecord.findUnique({
    where: { id: recordId },
  });
  if (!existing) throw ApiError.notFound("Production record not found");

  const updated = await prisma.productionRecord.update({
    where: { id: recordId },
    data: {
      ...(data.karaBazaarListingStatus && { karaBazaarListingStatus: data.karaBazaarListingStatus }),
      ...(data.karaBazaarListingUrl !== undefined && {
        karaBazaarListingUrl: data.karaBazaarListingUrl?.trim() || null,
      }),
      ...(data.saleValueEstimate !== undefined && { saleValueEstimate: data.saleValueEstimate }),
    },
    include: {
      trainingProgram: { select: { name: true } },
      recordedBy: { select: { name: true } },
    },
  });

  return {
    id: updated.id,
    prisonerId: updated.prisonerId,
    trainingProgramId: updated.trainingProgramId,
    trainingProgramName: updated.trainingProgram?.name ?? null,
    category: updated.category,
    itemName: updated.itemName,
    quantity: updated.quantity,
    producedAt: updated.producedAt.toISOString(),
    saleValueEstimate: updated.saleValueEstimate,
    karaBazaarListingStatus: updated.karaBazaarListingStatus as KaraBazaarListingStatus,
    karaBazaarListingUrl: updated.karaBazaarListingUrl,
    recordedById: updated.recordedById,
    recordedByName: updated.recordedBy?.name ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function getJailProductionSummary(jailId: string): Promise<JailProductionSummaryDto> {
  const dbRecords = await prisma.productionRecord.findMany({
    where: { prisoner: { jailId } },
  });

  let totalItemsThisQuarter = 0;
  let totalEstimatedValue = 0;
  let listedOnKaraBazaarCount = 0;
  const byCategory: Record<string, number> = {};

  for (const r of dbRecords) {
    totalItemsThisQuarter += r.quantity;
    if (r.saleValueEstimate) {
      totalEstimatedValue += r.saleValueEstimate;
    }
    if (r.karaBazaarListingStatus === "listed") {
      listedOnKaraBazaarCount += r.quantity;
    }
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.quantity;
  }

  return {
    totalItemsThisQuarter,
    totalEstimatedValue,
    byCategory,
    listedOnKaraBazaarCount,
  };
}
