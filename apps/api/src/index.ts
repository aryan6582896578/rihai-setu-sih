import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { startCronJobs } from "./jobs/cron.js";
import { ensureDemoPortalAccounts } from "./services/portal.service.js";
import { ensureNotificationTemplates } from "./services/family-notifications.service.js";

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Database connection verified");

  // Dev/demo convenience: keep stable known PINs on a few seeded prisoners so
  // the portal login page can offer one-click demo accounts. No-op in production.
  await ensureDemoPortalAccounts();

  // Prompt 11: seed EN/HI family-notification templates (skip-existing, so
  // super_admin edits made via /admin/notification-templates survive restarts).
  const created = await ensureNotificationTemplates();
  if (created > 0) logger.info(`Seeded ${created} notification template(s)`);

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });

  startCronJobs();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
