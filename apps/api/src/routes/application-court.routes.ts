import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { requireAuth, loadPrisonerForUser } from "../middleware/auth.js";
import { roleIsOneOf, EDITOR_ROLES, ADVANCE_ROLES } from "../middleware/roles.js";
import {
  syncCourtStatus,
  assignLawyer,
  getSuretyStatus,
  upsertSuretyStatus,
} from "../services/court.service.js";

export const applicationCourtRouter = Router();
applicationCourtRouter.use(requireAuth);

async function appPrisonerId(applicationId: string): Promise<string> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { prisonerId: true },
  });
  if (!app) throw ApiError.notFound("Application not found");
  return app.prisonerId;
}

async function guardEditor(req: Request) {
  const prisonerId = await appPrisonerId(req.params.id!);
  const { membership } = await loadPrisonerForUser(req.user!, prisonerId);
  if (!roleIsOneOf(membership.roleAtJail, EDITOR_ROLES)) {
    throw ApiError.forbidden("Only jail staff or superintendents can do this");
  }
}

applicationCourtRouter.post(
  "/:id/sync-court-status",
  asyncHandler(async (req, res) => {
    const prisonerId = await appPrisonerId(req.params.id!);
    const { membership } = await loadPrisonerForUser(req.user!, prisonerId);
    if (!roleIsOneOf(membership.roleAtJail, ADVANCE_ROLES)) {
      throw ApiError.forbidden("Your role cannot trigger court syncs");
    }
    res.json({ data: await syncCourtStatus(req.params.id!, req.user!.id) });
  }),
);

applicationCourtRouter.post(
  "/:id/assign-lawyer",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        method: z.enum(["round_robin", "manual"]).default("round_robin"),
        lawyerId: z.string().optional(),
      })
      .parse(req.body ?? {});
    await guardEditor(req);
    res.json({ data: await assignLawyer(req.params.id!, { ...body, actorId: req.user!.id }) });
  }),
);

applicationCourtRouter.get(
  "/:id/surety-status",
  asyncHandler(async (req, res) => {
    const prisonerId = await appPrisonerId(req.params.id!);
    await loadPrisonerForUser(req.user!, prisonerId);
    res.json({ data: await getSuretyStatus(req.params.id!) });
  }),
);

applicationCourtRouter.patch(
  "/:id/surety-status",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        bondAmount: z.coerce.number().min(0).optional(),
        suretyRequired: z.boolean().optional(),
        suretyArranged: z.boolean().optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body);
    await guardEditor(req);
    res.json({ data: await upsertSuretyStatus(req.params.id!, body) });
  }),
);



