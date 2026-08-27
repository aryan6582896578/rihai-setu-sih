import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Role } from "@rihai/shared-types";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { requireAuth, requireJailAccess } from "../middleware/auth.js";
import {
  buildExport,
  getComplianceMetrics,
} from "../services/compliance.service.js";

export const complianceJailRouter = Router({ mergeParams: true });
complianceJailRouter.use(requireAuth);

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function parseRange(req: Request): { from: Date; to: Date } {
  const parsed = rangeSchema.safeParse({ from: req.query.from, to: req.query.to });
  if (!parsed.success) {
    throw ApiError.badRequest("from and to (YYYY-MM-DD) are required");
  }
  return { from: parsed.data.from, to: parsed.data.to };
}

complianceJailRouter.get(
  "/",
  requireJailAccess,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.role === Role.DlsaLawyer || req.access?.roleAtJail === Role.DlsaLawyer) {
      throw ApiError.forbidden("DLSA Lawyers are not authorized to view compliance reports");
    }
    const { from, to } = parseRange(req);
    res.json({ data: await getComplianceMetrics(req.params.jailId!, from, to) });
  }),
);

complianceJailRouter.get(
  "/export",
  requireJailAccess,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.role === Role.DlsaLawyer || req.access?.roleAtJail === Role.DlsaLawyer) {
      throw ApiError.forbidden("DLSA Lawyers are not authorized to view compliance reports");
    }
    const { from, to } = parseRange(req);
    const format = z.enum(["csv", "xlsx", "pdf"]).catch("csv").parse(req.query.format);
    const out = await buildExport(
      req.params.jailId!,
      req.jail?.name ?? "jail",
      from,
      to,
      format,
    );
    if (out.url) return res.json({ data: { url: out.url } });
    res.setHeader("Content-Type", out.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.body);
  }),
);

export const complianceRollupRouter = Router();
complianceRollupRouter.use(requireAuth);

complianceRollupRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== Role.SuperAdmin) {
      throw ApiError.forbidden("Cross-jail compliance rollup is restricted to super admins");
    }
    const { from, to } = parseRange(req);
    res.json({ data: await getComplianceMetrics(null, from, to) });
  }),
);

complianceRollupRouter.get(
  "/export",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user || req.user.role !== Role.SuperAdmin) {
      throw ApiError.forbidden("Cross-jail compliance rollup is restricted to super admins");
    }
    const { from, to } = parseRange(req);
    const format = z.enum(["csv", "xlsx", "pdf"]).catch("csv").parse(req.query.format);
    const out = await buildExport(null, "all jails", from, to, format);
    if (out.url) return res.json({ data: { url: out.url } });
    res.setHeader("Content-Type", out.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }),
);
