import { Router } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import {
  ApplicationStage,
  ApplicationType,
  CaseStatus,
  Role,
  type PrisonerListItem,
} from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { uploadsDir } from "../lib/paths.js";
import { audit } from "../lib/audit.js";
import { ApiError, asyncHandler } from "../middleware/errors.js";
import {
  loadPrisonerForUser,
  requireAuth,
  requireJailAccess,
} from "../middleware/auth.js";
import { requireAnyOf, EDITOR_ROLES, REVIEW_ROLES, ADVANCE_ROLES, roleIsOneOf } from "../middleware/roles.js";
import {
  addNote,
  createPrisoner,
  enrollInProgram,
  getPrisonerDetail,
  listPrisoners,
  setPhotoUrl,
  updateCaseRecord,
  updateEnrollment,
  updatePersonalInfo,
} from "../services/prisoners.service.js";
import { recomputeForPrisoner } from "../services/eligibility.service.js";
import {
  advanceStage,
  createManualApplication,
  markReviewed,
  toApplicationDto,
} from "../services/applications.service.js";
import { renderApplicationStatusSheet } from "../services/superintendent.service.js";

export const prisonersRouter = Router();
export const prisonersNestedRouter = Router({ mergeParams: true });

prisonersRouter.use(requireAuth);
prisonersNestedRouter.use(requireAuth);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  eligibility: z.enum(["eligible", "not_eligible", "excluded", "pending"]).optional(),
  stage: z.string().optional(),
});

prisonersNestedRouter.get(
  "/",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const result: PrisonerListItemPaginated = await listPrisoners(req.params.jailId!, q);
    audit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: "prisoner.list_read",
      entityType: "Prisoner",
      entityId: req.params.jailId!,
      fieldsTouched: [`count:${result.total}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json(result);
  }),
);

type PrisonerListItemPaginated = {
  data: PrisonerListItem[];
  page: number;
  pageSize: number;
  total: number;
};

const caseSchema = z.object({
  cnrNumber: z.string().trim().max(40).optional().nullable(),
  caseNumber: z.string().trim().min(1).max(80).optional(),
  courtName: z.string().trim().min(1).max(160).optional(),
  offence: z.string().trim().min(1).max(200).optional(),
  maxSentenceYears: z.coerce.number().int().min(0).max(50).optional(),
  carriesDeathOrLife: z.boolean().optional(),
  isFirstTimeOffender: z.boolean().optional(),
  pendingCaseCount: z.coerce.number().int().min(0).max(100).optional(),
  custodyStartDate: z.coerce.date().optional(),
  caseStatus: z.nativeEnum(CaseStatus).optional(),
});

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  prisonerRegNo: z.string().trim().max(40).optional(),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(["male", "female", "other"]),
  admissionDate: z.coerce.date().optional(),
  case: z.object({
    cnrNumber: z.string().trim().max(40).optional(),
    caseNumber: z.string().trim().min(1).max(80),
    courtName: z.string().trim().min(1).max(160),
    offence: z.string().trim().min(1).max(200),
    maxSentenceYears: z.coerce.number().int().min(0).max(50),
    carriesDeathOrLife: z.boolean(),
    isFirstTimeOffender: z.boolean(),
    pendingCaseCount: z.coerce.number().int().min(0).max(100),
    custodyStartDate: z.coerce.date(),
    caseStatus: z.nativeEnum(CaseStatus).default(CaseStatus.Undertrial),
  }),
});

prisonersNestedRouter.post(
  "/",
  requireJailAccess,
  requireAnyOf(...EDITOR_ROLES),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const detail = await createPrisoner(
      req.params.jailId!,
      req.jail!.code,
      input,
      req.user!.id,
    );
    res.status(201).json({ data: detail });
  }),
);

prisonersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    res.json({
      data: await getPrisonerDetail(req.params.id!, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        ip: req.ip ?? undefined,
      }),
    });
  }),
);

const personalSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  admissionDate: z.coerce.date().optional(),
});

prisonersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can edit prisoner details");
    }
    const input = personalSchema.parse(req.body);
    await updatePersonalInfo(req.params.id!, input, { actorId: req.user!.id });
    res.json({ data: await getPrisonerDetail(req.params.id!) });
  }),
);

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(uploadsDir(), "photos")),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().slice(0, 6);
    cb(null, `photo-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG/PNG/WebP photos are allowed"));
  },
});

prisonersRouter.post(
  "/:id/photo",
  photoUpload.single("photo"),
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can upload prisoner photos");
    }
    if (!req.file) throw ApiError.badRequest("photo file is required");
    const url = `/uploads/photos/${req.file.filename}`;
    await setPhotoUrl(req.params.id!, url, { actorId: req.user!.id });
    res.json({ data: { photoUrl: url } });
  }),
);

prisonersRouter.get(
  "/:id/case",
  asyncHandler(async (req, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    const detail = await getPrisonerDetail(req.params.id!);
    res.json({ data: detail.cases });
  }),
);

prisonersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (![Role.SuperAdmin as Role, Role.JailSuperintendent].includes(membership.roleAtJail as Role)) {
      throw ApiError.forbidden("Only superintendents can delete prisoner records");
    }
    await prisma.prisoner.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

prisonersRouter.patch(
  "/:id/case/:caseId",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can edit case records");
    }
    const input = caseSchema.parse(req.body);
    audit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: "case_record.write",
      entityType: "CaseRecord",
      entityId: req.params.caseId!,
      fieldsTouched: Object.keys(input),
      ipAddress: req.ip ?? undefined,
    });
    const result = await updateCaseRecord(
      req.params.id!,
      req.params.caseId!,
      input,
      req.user!.id,
    );
    res.json({ data: result });
  }),
);

prisonersRouter.post(
  "/:id/eligibility/recompute",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can trigger recomputation");
    }
    const assessment = await recomputeForPrisoner(req.params.id!, {
      force: true,
      actor: req.user!.id,
    });
    res.json({
      data: assessment
        ? {
            id: assessment.id,
            status: assessment.status,
            reason: assessment.reason,
            computedAt: assessment.computedAt.toISOString(),
          }
        : null,
    });
  }),
);

prisonersRouter.get(
  "/:id/applications",
  asyncHandler(async (req, res) => {
    await loadPrisonerForUser(req.user!, req.params.id!);
    const detail = await getPrisonerDetail(req.params.id!);
    res.json({ data: detail.applications });
  }),
);

const applicationTypeSchema = z.object({
  type: z.nativeEnum(ApplicationType).default(ApplicationType.Bail),
});

prisonersRouter.post(
  "/:id/applications",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can open applications");
    }
    const { type } = applicationTypeSchema.parse(req.body ?? {});
    res.status(201).json({ data: await createManualApplication(req.params.id!, type, req.user!.id) });
  }),
);

prisonersRouter.post(
  "/:id/enrollments",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can manage enrollments");
    }
    const body = z.object({ programId: z.string().min(1) }).parse(req.body);
    res.status(201).json({ data: await enrollInProgram(req.params.id!, body.programId) });
  }),
);

export const enrollmentsRouter = Router();
enrollmentsRouter.use(requireAuth);

enrollmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: req.params.id },
      select: { prisonerId: true },
    });
    if (!enrollment) throw ApiError.notFound("Enrollment not found");
    const { membership } = await loadPrisonerForUser(req.user!, enrollment.prisonerId);
    if (!EDITOR_ROLES.includes(membership.roleAtJail)) {
      throw ApiError.forbidden("Only staff can update enrollments");
    }
    const body = z
      .object({
        progressPct: z.coerce.number().int().min(0).max(100).optional(),
        markComplete: z.boolean().optional(),
        regenerate: z.boolean().optional(),
      })
      .parse(req.body);
    res.json({ data: await updateEnrollment(req.params.id!, body) });
  }),
);

prisonersRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const { membership } = await loadPrisonerForUser(req.user!, req.params.id!);
    if (membership.roleAtJail === Role.Viewer) {
      throw ApiError.forbidden("Read-only viewers cannot add notes");
    }
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    res.status(201).json({ data: await addNote(req.params.id!, req.user!.id, body.body) });
  }),
);

export const trainingProgramsRouter = Router();
trainingProgramsRouter.use(requireAuth);
trainingProgramsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const programs = await prisma.trainingProgram.findMany({ orderBy: { name: "asc" } });
    res.json({ data: programs.map((p) => ({ id: p.id, name: p.name, category: p.category })) });
  }),
);

export const applicationActionsRouter = Router();
applicationActionsRouter.use(requireAuth);

applicationActionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { reviewer: { select: { name: true } } },
    });
    if (!app) throw ApiError.notFound("Application not found");
    await loadPrisonerForUser(req.user!, app.prisonerId);
    res.json({ data: toApplicationDto(app) });
  }),
);

applicationActionsRouter.get(
  "/:id/document",
  asyncHandler(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { prisonerId: true },
    });
    if (!app) throw ApiError.notFound("Application not found");
    await loadPrisonerForUser(req.user!, app.prisonerId);
    const html = await renderApplicationStatusSheet(req.params.id!);
    res.type("html").send(html);
  }),
);

applicationActionsRouter.patch(
  "/:id/stage",
  asyncHandler(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { prisonerId: true },
    });
    if (!app) throw ApiError.notFound("Application not found");
    const { membership } = await loadPrisonerForUser(req.user!, app.prisonerId);
    if (!roleIsOneOf(membership.roleAtJail, ADVANCE_ROLES)) {
      throw ApiError.forbidden("Your role cannot advance application stages");
    }
    const body = z.object({ stage: z.nativeEnum(ApplicationStage) }).parse(req.body);
    audit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: "application.stage",
      entityType: "Application",
      entityId: req.params.id!,
      fieldsTouched: [`stage:${body.stage}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: await advanceStage(req.params.id!, body.stage, req.user!.id) });
  }),
);

applicationActionsRouter.post(
  "/:id/review",
  asyncHandler(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: { prisonerId: true },
    });
    if (!app) throw ApiError.notFound("Application not found");
    const { membership } = await loadPrisonerForUser(req.user!, app.prisonerId);
    if (!roleIsOneOf(membership.roleAtJail, REVIEW_ROLES)) {
      throw ApiError.forbidden("Only a DLSA lawyer or superintendent can review applications");
    }
    audit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: "application.review",
      entityType: "Application",
      entityId: req.params.id!,
      fieldsTouched: ["reviewed_by", "reviewed_at"],
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: await markReviewed(req.params.id!, req.user!.id) });
  }),
);

