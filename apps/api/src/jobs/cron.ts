import cron from "node-cron";
import { computeStalledApplications } from "../services/stall.service.js";
import { recomputeAllPrisoners } from "../services/eligibility.service.js";
import { prisma } from "../lib/prisma.js";
import { CaseStatus } from "@rihai/shared-types";
import { logger } from "../lib/logger.js";

async function snapshotAllJails(): Promise<void> {
  const jails = await prisma.jail.findMany({ select: { id: true } });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const jail of jails) {
    const [occupancy, undertrials, convicts] = await Promise.all([
      prisma.prisoner.count({ where: { jailId: jail.id } }),
      prisma.prisoner.count({
        where: { jailId: jail.id, cases: { some: { caseStatus: CaseStatus.Undertrial } } },
      }),
      prisma.prisoner.count({
        where: { jailId: jail.id, cases: { some: { caseStatus: CaseStatus.Convict } } },
      }),
    ]);
    await prisma.occupancySnapshot.upsert({
      where: { jailId_date: { jailId: jail.id, date: today } },
      update: { occupancy, undertrialCount: undertrials, convictCount: convicts },
      create: {
        jailId: jail.id,
        date: today,
        occupancy,
        undertrialCount: undertrials,
        convictCount: convicts,
      },
    });
  }
  logger.info(`[cron] daily occupancy snapshots written`, { jails: jails.length });
}

export function startCronJobs(): void {
  cron.schedule("0 2 * * *", async () => {
    try {
      const changed = await recomputeAllPrisoners();
      logger.info(`[cron] nightly Section 479 eligibility sweep complete`, {
        prisonersChanged: changed,
      });
    } catch (err) {
      logger.error("[cron] nightly eligibility sweep failed", err);
    }

    try {
      const stalled = await computeStalledApplications();
      logger.info(`[cron] nightly stall sweep complete`, { stalledCount: stalled.length });
    } catch (err) {
      logger.error("[cron] nightly stall sweep failed", err);
    }

    try {
      await snapshotAllJails();
    } catch (err) {
      logger.error("[cron] occupancy snapshot failed", err);
    }
  });
  logger.info("[cron] scheduled nightly eligibility + stall + snapshot jobs at 02:00");
}
