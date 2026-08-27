import { Router } from "express";
import { z } from "zod";
import { Role } from "@rihai/shared-types";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { requireAuth, requireJailAccess } from "../middleware/auth.js";
import {
  getCurrentState,
  getProjection,
  getBacklogBreakdown,
  getRollup,
} from "../services/overcrowding.service.js";

export const overcrowdingJailRouter = Router({ mergeParams: true });
overcrowdingJailRouter.use(requireAuth);

const daysSchema = z.coerce.number().int().refine((v) => [30, 60, 90].includes(v), {
  message: "days must be one of 30|60|90",
});

overcrowdingJailRouter.get(
  "/current",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    if (req.user?.role === Role.DlsaLawyer || req.access?.roleAtJail === Role.DlsaLawyer) {
      throw ApiError.forbidden("DLSA Lawyers are not authorized to view overcrowding metrics");
    }
    res.json({ data: await getCurrentState(req.params.jailId!) });
  }),
);

overcrowdingJailRouter.get(
  "/projection",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    if (req.user?.role === Role.DlsaLawyer || req.access?.roleAtJail === Role.DlsaLawyer) {
      throw ApiError.forbidden("DLSA Lawyers are not authorized to view overcrowding metrics");
    }
    const parsed = daysSchema.safeParse(Number(req.query.days ?? 30));
    const days = parsed.success ? (parsed.data as 30 | 60 | 90) : 30;
    res.json({ data: await getProjection(req.params.jailId!, days) });
  }),
);

overcrowdingJailRouter.get(
  "/backlog-breakdown",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    if (req.user?.role === Role.DlsaLawyer || req.access?.roleAtJail === Role.DlsaLawyer) {
      throw ApiError.forbidden("DLSA Lawyers are not authorized to view overcrowding metrics");
    }
    res.json({ data: await getBacklogBreakdown(req.params.jailId!) });
  }),
);

export const overcrowdingRollupRouter = Router();
overcrowdingRollupRouter.use(requireAuth);

overcrowdingRollupRouter.get(
  "/rollup",
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== Role.SuperAdmin) {
      throw ApiError.forbidden("Cross-jail rollup is restricted to super admins");
    }
    res.json({ data: await getRollup() });
  }),
);

void ApiError;

