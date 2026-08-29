import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { requireAuth, loadPrisonerForUser, requireJailAccess } from "../middleware/auth.js";
import { roleIsOneOf, EDITOR_ROLES } from "../middleware/roles.js";
import {
  getPrisonerProduction,
  createProductionRecord,
  updateProductionRecord,
  getJailProductionSummary,
} from "../services/production.service.js";

export const productionRouter = Router();
productionRouter.use(requireAuth);

const createSchema = z.object({
  itemName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  quantity: z.coerce.number().min(1).default(1),
  producedAt: z.string().optional(),
  trainingProgramId: z.string().nullable().optional(),
  saleValueEstimate: z.coerce.number().min(0).nullable().optional(),
  karaBazaarListingStatus: z.enum(["not_listed", "pending", "listed"]).optional(),
  karaBazaarListingUrl: z.string().nullable().optional(),
});

const updateSchema = z.object({
  karaBazaarListingStatus: z.enum(["not_listed", "pending", "listed"]).optional(),
  karaBazaarListingUrl: z.string().nullable().optional(),
  saleValueEstimate: z.coerce.number().min(0).nullable().optional(),
});

// GET /api/v1/prisoners/:id/production
productionRouter.get(
  "/prisoners/:id/production",
  asyncHandler(async (req, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    res.json({ data: await getPrisonerProduction(req.params.id!) });
  }),
);

// POST /api/v1/prisoners/:id/production
productionRouter.post(
  "/prisoners/:id/production",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!roleIsOneOf(membership.roleAtJail, EDITOR_ROLES)) {
      throw ApiError.forbidden("Only jail staff or superintendents can log production entries");
    }
    const body = createSchema.parse(req.body);
    res.json({
      data: await createProductionRecord(req.params.id!, req.user!.id, body),
    });
  }),
);

// PATCH /api/v1/production/:id
productionRouter.patch(
  "/production/:id",
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    res.json({ data: await updateProductionRecord(req.params.id!, body) });
  }),
);

// GET /api/v1/jails/:jailId/production-summary
productionRouter.get(
  "/jails/:jailId/production-summary",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    res.json({ data: await getJailProductionSummary(req.params.jailId!) });
  }),
);
