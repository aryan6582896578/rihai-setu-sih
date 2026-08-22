import { Router } from "express";
import { z } from "zod";
import { ApplicationType } from "@rihai/shared-types";
import { asyncHandler } from "../middleware/errors.js";
import { requireAuth, requireJailAccess } from "../middleware/auth.js";
import { requireAnyOf, MANAGER_ROLES } from "../middleware/roles.js";
import {
  bulkAutoDraft,
  listEligiblePrisoners,
} from "../services/superintendent.service.js";

export const superintendentRouter = Router({ mergeParams: true });

superintendentRouter.use(requireAuth);

superintendentRouter.get(
  "/eligible-prisoners",
  requireJailAccess,
  requireAnyOf(...MANAGER_ROLES),
  asyncHandler(async (req, res) => {
    res.json({ data: await listEligiblePrisoners(req.params.jailId!) });
  }),
);

const autoDraftSchema = z.object({
  prisonerIds: z.array(z.string().min(1)).min(1).max(50),
  type: z.nativeEnum(ApplicationType).default(ApplicationType.Bail),
});

superintendentRouter.post(
  "/auto-draft",
  requireJailAccess,
  requireAnyOf(...MANAGER_ROLES),
  asyncHandler(async (req, res) => {
    const body = autoDraftSchema.parse(req.body);
    const outcomes = await bulkAutoDraft(
      req.user!,
      req.params.jailId!,
      body.prisonerIds,
      body.type,
    );
    res.json({ data: outcomes });
  }),
);
