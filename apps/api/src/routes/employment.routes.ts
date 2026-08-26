import { Router, type Response } from "express";
import { z } from "zod";
import { Role } from "@rihai/shared-types";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import {
  loadPrisonerForUser,
  requireAuth,
  type AuthedRequest,
} from "../middleware/auth.js";
import { EDITOR_ROLES, roleIsOneOf } from "../middleware/roles.js";
import {
  applyToJob,
  listApplicants,
  listApplicationsForPrisoner,
  listJobsForNgo,
  createJob,
  updateJob,
  ngoStats,
  updateApplicationStatus,
} from "../services/jobs.service.js";
import { getSkillCatalog, recommendedJobsForPrisoner } from "../services/recommendations.service.js";

export const ngoRouter = Router();
ngoRouter.use(requireAuth);

function requireNgoPartner(req: AuthedRequest, res: Response, next: (err?: unknown) => void) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== Role.NgoPartner && req.user.role !== Role.SuperAdmin) {
    return next(ApiError.forbidden("This area is restricted to NGO partner accounts", "NGO_ONLY"));
  }
  next();
}

const jobSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(4000).optional(),
  requiredSkills: z.array(z.string().trim().min(1)).min(1),
  preferredSkills: z.array(z.string().trim().min(1)).optional(),
  requiredCertificates: z.array(z.string().trim().min(1)).optional(),
  minExperienceMonths: z.coerce.number().int().min(0).max(480).optional(),
  jobCategory: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  openings: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  wageInfo: z.string().trim().max(120).nullable().optional(),
});

ngoRouter.use(requireNgoPartner);

ngoRouter.get(
  "/jobs",
  asyncHandler(async (req: AuthedRequest, res) => {
    const scope = req.user!.role === Role.SuperAdmin && req.query.all === "1" ? undefined : req.user!.id;
    res.json({ data: await listJobsForNgo(scope ?? req.user!.id) });
  }),
);

ngoRouter.post(
  "/jobs",
  asyncHandler(async (req: AuthedRequest, res) => {
    const input = jobSchema.parse(req.body);
    res.status(201).json({ data: await createJob(req.user!.id, input as never) });
  }),
);

ngoRouter.patch(
  "/jobs/:jobId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const patch = jobSchema.partial().extend({ status: z.enum(["active", "paused", "closed"]).optional() }).parse(req.body);
    res.json({ data: await updateJob(req.params.jobId!, req.user!, patch as never) });
  }),
);

ngoRouter.get(
  "/jobs/:jobId/applications",
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: await listApplicants(req.params.jobId!, req.user!) });
  }),
);

ngoRouter.patch(
  "/applications/:applicationId/status",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ status: z.enum(["pending", "shortlisted", "rejected", "hired"]) }).parse(req.body);
    res.json({
      data: await updateApplicationStatus(req.params.applicationId!, req.user!, body.status),
    });
  }),
);

ngoRouter.get(
  "/stats",
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: await ngoStats(req.user!.id) });
  }),
);

// ---- Jail-side employment endpoints (prisoner profile) ----

export const employmentPrisonerRouter = Router({ mergeParams: true });
employmentPrisonerRouter.use(requireAuth);

async function guardEditor(req: AuthedRequest) {
  const prisonerId =
    (req.params.prisonerId as string | undefined) ?? (req.params.id as string | undefined);
  if (!prisonerId) throw ApiError.badRequest("prisonerId path parameter is required");
  const { membership } = await loadPrisonerForUser(req.user!, prisonerId);
  if (!roleIsOneOf(membership.roleAtJail, EDITOR_ROLES)) {
    throw ApiError.forbidden("Only jail staff can manage job applications");
  }
  return prisonerId;
}

employmentPrisonerRouter.get(
  "/:id/recommended-jobs",
  asyncHandler(async (req: AuthedRequest, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    const topK = z.coerce.number().int().min(1).max(10).catch(5).parse(req.query.topK);
    res.json({ data: await recommendedJobsForPrisoner(req.params.id!, topK) });
  }),
);

employmentPrisonerRouter.get(
  "/:id/job-applications",
  asyncHandler(async (req: AuthedRequest, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    res.json({ data: await listApplicationsForPrisoner(req.params.id!) });
  }),
);

employmentPrisonerRouter.post(
  "/:id/job-applications",
  asyncHandler(async (req: AuthedRequest, res) => {
    const prisonerId = await guardEditor(req);
    const body = z.object({ jobId: z.string().min(1), note: z.string().max(500).optional() }).parse(req.body);
    res.status(201).json({ data: await applyToJob(prisonerId, body.jobId, req.user!.id, body.note) });
  }),
);

// Skill catalog proxy for the NGO posting form (canonical tags come from Python).
export const skillsCatalogRouter = Router();
skillsCatalogRouter.use(requireAuth);
skillsCatalogRouter.get(
  "/catalog",
  asyncHandler(async (_req: AuthedRequest, res) => {
    res.json({ data: await getSkillCatalog() });
  }),
);
