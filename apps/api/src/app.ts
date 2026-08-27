import path from "node:path";
import fs from "node:fs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { accessLogStream, logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.routes.js";
import { jailsRouter } from "./routes/jails.routes.js";
import { applicationsRouter } from "./routes/applications.routes.js";
import {
  applicationActionsRouter,
  enrollmentsRouter,
  prisonersNestedRouter,
  prisonersRouter,
  trainingProgramsRouter,
} from "./routes/prisoners.routes.js";
import { superintendentRouter } from "./routes/superintendent.routes.js";
import {
  complianceJailRouter,
  complianceRollupRouter,
} from "./routes/compliance.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { courtJailRouter } from "./routes/court.routes.js";
import { applicationCourtRouter } from "./routes/application-court.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { portalRouter } from "./routes/portal.routes.js";
import { chatbotRouter, portalChatbotRouter } from "./routes/chatbot.routes.js";
import {
  ngoRouter,
  employmentPrisonerRouter,
  skillsCatalogRouter,
} from "./routes/employment.routes.js";
// PARKED: 
import {
  overcrowdingJailRouter,
  overcrowdingRollupRouter,
} from "./routes/overcrowding.routes.js";

import { verifyRouter } from "./routes/verify.routes.js";
import { prisma } from "./lib/prisma.js";
import { buildCertificateHtml } from "./services/certificates.service.js";
import { renderApplicationStatusSheet } from "./services/superintendent.service.js";

const uploadsDir = path.resolve(process.cwd(), process.cwd().endsWith("apps\\api") || process.cwd().endsWith("apps/api") ? "../../uploads" : "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(morgan("dev"));
  app.use(morgan("combined", { stream: accessLogStream }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Uploads serving with dynamic rendering fallback for missing files / demo certs & docs
  app.use("/uploads", (req, res, next) => {
    const relative = req.path.replace(/^\//, "");
    const diskPath = path.join(uploadsDir, relative);
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      return express.static(uploadsDir)(req, res, next);
    }
    void (async () => {
      try {
        const matches = req.path.match(/(cm[a-z0-9]+|SP-PSI-[0-9]+|application-[a-zA-Z0-9_-]+|cert-[a-zA-Z0-9_-]+)/g) ?? [];
        const keyword = matches[0] ?? "";

        // Certificate request
        if (req.path.includes("certificate")) {
          const cert = await prisma.enrollment.findFirst({
            where: {
              status: "completed",
              ...(keyword ? { OR: [{ id: keyword }, { certificateUrl: { contains: keyword } }] } : {}),
            },
            select: { id: true },
          });
          const certId = cert?.id ?? (await prisma.enrollment.findFirst({ where: { status: "completed" }, select: { id: true } }))?.id;
          if (certId) {
            const html = await buildCertificateHtml(certId);
            res.type("html").send(html);
            return;
          }
        }

        // Application document request
        if (req.path.includes("application") || req.path.includes("demo")) {
          const appRecord = await prisma.application.findFirst({
            where: {
              ...(keyword ? { OR: [{ id: keyword }, { generatedDocumentUrl: { contains: keyword } }] } : {}),
            },
            select: { id: true },
          });
          const appId = appRecord?.id ?? (await prisma.application.findFirst({ select: { id: true } }))?.id;
          if (appId) {
            const html = await renderApplicationStatusSheet(appId);
            res.type("html").send(html);
            return;
          }
        }

        next();
      } catch {
        next();
      }
    })();
  });

  app.use("/api/v1/verify", verifyRouter);
  app.use("/verify", verifyRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/jails", jailsRouter);
  app.use("/api/v1/jails/:jailId/prisoners", prisonersNestedRouter);
  app.use("/api/v1/jails/:jailId/superintendent", superintendentRouter);
  app.use("/api/v1/jails/:jailId", courtJailRouter);
  app.use("/api/v1/jails/:jailId/overcrowding", overcrowdingJailRouter);
  app.use("/api/v1/overcrowding", overcrowdingRollupRouter);
  app.use("/api/v1/applications", applicationCourtRouter);

  app.use("/api/v1/ngo", ngoRouter);
  app.use("/api/v1/prisoners", employmentPrisonerRouter);
  app.use("/api/v1/prisoners", prisonersRouter);
  app.use("/api/v1/enrollments", enrollmentsRouter);
  app.use("/api/v1/training-programs", trainingProgramsRouter);
  app.use("/api/v1/jails/:jailId/compliance-report", complianceJailRouter);
  app.use("/api/v1/compliance-report", complianceRollupRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/applications", applicationsRouter);
app.use("/api/v1/applications", applicationActionsRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/skills", skillsCatalogRouter);
app.use("/api/v1/chat", chatbotRouter);
app.use("/api/v1/portal/chat", portalChatbotRouter);
app.use("/api/v1/portal", portalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug(`Serving uploads from ${uploadsDir}`);
  return app;
}
