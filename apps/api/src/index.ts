import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { startCronJobs } from "./jobs/cron.js";

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Database connection verified");

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
