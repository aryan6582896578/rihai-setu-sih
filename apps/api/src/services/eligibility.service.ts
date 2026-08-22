import { CaseStatus } from "@rihai/shared-types";
import type { EligibilityAssessment } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { evaluateSection479 } from "../domain/section479.js";
import { ApiError } from "../middleware/errors.js";

export async function getPrimaryCase(prisonerId: string) {
  const cases = await prisma.caseRecord.findMany({
    where: { prisonerId },
    orderBy: { updatedAt: "desc" },
  });
  return (
    cases.find((c) => c.caseStatus === CaseStatus.Undertrial) ??
    cases.find((c) => c.caseStatus === CaseStatus.Convict) ??
    cases[0] ??
    null
  );
}

export async function recomputeForPrisoner(
  prisonerId: string,
  opts: { force?: boolean; actor?: string } = {},
): Promise<EligibilityAssessment | null> {
  const prisoner = await prisma.prisoner.findUnique({ where: { id: prisonerId } });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");

  const primaryCase = await getPrimaryCase(prisonerId);
  let result;
  if (!primaryCase) {
    result = { status: "excluded" as const, reason: "No case record on file" };
  } else if (primaryCase.caseStatus !== CaseStatus.Undertrial) {
    result = {
      status: "excluded" as const,
      reason: "Section 479 applies to undertrial detention only",
    };
  } else {
    result = evaluateSection479({
      custodyStartDate: primaryCase.custodyStartDate,
      maxSentenceYears: primaryCase.maxSentenceYears,
      carriesDeathOrLife: primaryCase.carriesDeathOrLife,
      isFirstTimeOffender: primaryCase.isFirstTimeOffender,
      pendingCaseCount: primaryCase.pendingCaseCount,
    });
  }

  if (!opts.force) {
    const latest = await prisma.eligibilityAssessment.findFirst({
      where: { prisonerId },
      orderBy: { computedAt: "desc" },
    });
    if (latest && latest.status === result.status && latest.reason === result.reason) {
      return latest;
    }
  }

  const inserted = await prisma.eligibilityAssessment.create({
    data: {
      prisonerId,
      status: result.status,
      reason: result.reason,
    },
  });

  logger.info(`Eligibility computed`, {
    prisonerId,
    status: result.status,
    trigger: opts.actor ?? "system",
    changed: true,
  });
  return inserted;
}

export async function recomputeAllPrisoners(): Promise<number> {
  let changed = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch: { id: string }[] = await prisma.prisoner.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (batch.length === 0) break;
    const last = batch[batch.length - 1];
    if (!last) break;
    cursor = last.id;

    for (const p of batch) {
      try {
        const before = await prisma.eligibilityAssessment.findFirst({
          where: { prisonerId: p.id },
          orderBy: { computedAt: "desc" },
        });
        await recomputeForPrisoner(p.id, { force: false, actor: "nightly-cron" });
        const after = await prisma.eligibilityAssessment.findFirst({
          where: { prisonerId: p.id },
          orderBy: { computedAt: "desc" },
        });
        if (before && after && after.id !== before.id) changed++;
      } catch (err) {
        logger.error(`Nightly eligibility recompute failed for prisoner ${p.id}`, err);
      }
    }
  }
  return changed;
}

export async function getLatestAssessment(prisonerId: string): Promise<EligibilityAssessment | null> {
  return prisma.eligibilityAssessment.findFirst({
    where: { prisonerId },
    orderBy: { computedAt: "desc" },
  });
}

export async function countEligibleWithoutApplication(jailId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS n
    FROM "Prisoner" p
    JOIN LATERAL (
      SELECT status FROM "EligibilityAssessment" e
      WHERE e.prisoner_id = p.id ORDER BY e.computed_at DESC LIMIT 1
    ) ea ON TRUE
    WHERE p.jail_id = ${jailId}
      AND ea.status = 'eligible'
      AND NOT EXISTS (
        SELECT 1 FROM "Application" a
        WHERE a.prisoner_id = p.id AND a.stage <> 'flagged'
      )
  `);
  return Number(rows[0]?.n ?? 0n);
}
