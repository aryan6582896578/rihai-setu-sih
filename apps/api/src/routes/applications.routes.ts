import { Router } from "express";
import { asyncHandler } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { escalateApplication } from "../services/stall.service.js";

export const applicationsRouter = Router();

applicationsRouter.post(
  "/:id/escalate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const alert = await escalateApplication(req.user!.id, req.user!.role, req.params.id!);
    res.json({
      data: {
        applicationId: alert.entityId,
        stage: alert.stage,
        daysStalled: alert.daysStalled,
        escalated: alert.escalated,
        escalatedAt: alert.escalatedAt?.toISOString() ?? null,
      },
    });
  }),
);
