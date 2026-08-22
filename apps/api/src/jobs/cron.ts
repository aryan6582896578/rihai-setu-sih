import cron from "node-cron";
import { computeStalledApplications } from "../services/stall.service.js";
import { recomputeAllPrisoners } from "../services/eligibility.service.js";
import { logger } from "../lib/logger.js";

export function startCronJobs(): void {
  cron.schedule("0 2 * * *", async () => {
    try {
      const stalled = await computeStalledApplications();
      logger.info(`[cron] nightly stall sweep complete`, { stalledCount: stalled.length });
    } catch (err) {
      logger.error("[cron] nightly stall sweep failed", err);
    }

    try {
      const changed = await recomputeAllPrisoners();
      logger.info(`[cron] nightly Section 479 eligibility sweep complete`, {
        prisonersChanged: changed,
      });
    } catch (err) {
      logger.error("[cron] nightly eligibility sweep failed", err);
    }
  });
  logger.info("[cron] scheduled nightly stall + eligibility sweeps at 02:00");
}
