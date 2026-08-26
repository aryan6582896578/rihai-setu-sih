import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Role } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { ApiError, asyncHandler } from "../middleware/errors.js";
import {
  assertJailMembership,
  requireAuth,
  requireRoles,
  type AuthedRequest,
} from "../middleware/auth.js";
import { roleIsOneOf, MANAGER_ROLES } from "../middleware/roles.js";
import {
  batchView,
  createBatchFromCsv,
  listBatches,
  resolveRow,
} from "../services/ingestion.service.js";

export const adminRouter = Router();
adminRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/**
 * Ingestion RBAC: super_admin globally; jail_superintendent scoped to their
 * jail via JailAccess. jail_staff/dlsa_lawyer/viewer never touch this module.
 */
async function assertIngestionAccess(req: AuthedRequest, jailId: string): Promise<void> {
  const membership = await assertJailMembership(req.user!, jailId);
  if (!roleIsOneOf(membership.roleAtJail, MANAGER_ROLES)) {
    throw ApiError.forbidden("Only superintendents manage data ingestion", "INGESTION_DENIED");
  }
}

adminRouter.post(
  "/ingestion/upload",
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  upload.single("file"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ jailId: z.string().min(1) }).parse(req.body);
    await assertIngestionAccess(req, body.jailId);
    if (!req.file) throw ApiError.badRequest("CSV file is required (field name: file)");
    const name = Buffer.from(req.file.originalname ?? "upload.csv", "latin1").toString("utf8");
    res.json({
      data: await createBatchFromCsv(body.jailId, req.user!.id, name, req.file.buffer.toString("utf8")),
    });
  }),
);

// ---- Prompt 11 — family notification templates (super_admin only) ----
// Edit message copy without a code deploy. Seeded EN/HI rows are created at
// startup; these endpoints read/update them.

const templatePatchSchema = z.object({
  id: z.string().min(1),
  messageTemplate: z.string().trim().min(5).max(2000),
});

adminRouter.get(
  "/notification-templates",
  requireRoles(Role.SuperAdmin),
  asyncHandler(async (req: AuthedRequest, res) => {
    const eventKey = req.query.eventKey as string | undefined;
    const locale = req.query.locale as string | undefined;
    const rows = await prisma.notificationTemplate.findMany({
      where: {
        ...(eventKey ? { eventKey } : {}),
        ...(locale ? { locale } : {}),
      },
      orderBy: [{ eventKey: "asc" }, { locale: "asc" }, { channel: "asc" }],
    });
    res.json({
      data: rows.map((t) => ({
        id: t.id,
        eventKey: t.eventKey,
        channel: t.channel,
        locale: t.locale,
        messageTemplate: t.messageTemplate,
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  }),
);

adminRouter.patch(
  "/notification-templates",
  requireRoles(Role.SuperAdmin),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = templatePatchSchema.parse(req.body);
    const updated = await prisma.notificationTemplate.update({
      where: { id: body.id },
      data: { messageTemplate: body.messageTemplate },
    });
    audit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: "notification_template.write",
      entityType: "NotificationTemplate",
      entityId: updated.id,
      fieldsTouched: [`${updated.eventKey}/${updated.channel}/${updated.locale}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json({
      data: {
        id: updated.id,
        eventKey: updated.eventKey,
        channel: updated.channel,
        locale: updated.locale,
        messageTemplate: updated.messageTemplate,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }),
);

adminRouter.get(
  "/ingestion",
  asyncHandler(async (req: AuthedRequest, res) => {
    const jailId = req.query.jailId as string | undefined;
    const scope =
      req.user!.role === Role.SuperAdmin
        ? null // all jails
        : jailId
          ? jailId
          : (
              await prisma.jailAccess.findMany({
                where: {
                  userId: req.user!.id,
                  roleAtJail: Role.JailSuperintendent,
                },
                select: { jailId: true },
              })
            ).map((a) => a.jailId)[0] ?? "__none__";
    if (scope && typeof scope === "string") await assertIngestionAccess(req, scope);
    res.json({ data: await listBatches(scope === null ? null : (scope as string)) });
  }),
);

adminRouter.get(
  "/ingestion/:batchId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const view = await batchView(req.params.batchId!, true);
    await assertIngestionAccess(req, view.jailId);
    res.json({ data: view });
  }),
);

adminRouter.post(
  "/ingestion/:batchId/rows/:rowId/resolve",
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        action: z.enum(["merge", "reject", "attach_case"]),
        edited: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    const batch = await batchView(req.params.batchId!);
    await assertIngestionAccess(req, batch.jailId);
    res.json({
      data: await resolveRow(req.params.batchId!, req.params.rowId!, req.user!.id, {
        action: body.action,
        edited: body.edited as never,
      }),
    });
  }),
);

// ---- Audit log (filterable) ----

adminRouter.get(
  "/audit-log",
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = z
      .object({
        actorId: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        action: z.string().optional(),
        since: z.coerce.date().optional(),
        until: z.coerce.date().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const where = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.since || q.until
        ? {
            createdAt: {
              ...(q.since ? { gte: q.since } : {}),
              ...(q.until ? { lte: q.until } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        actorType: r.actorType,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        fieldsTouched: r.fieldsTouched ?? [],
        ipAddress: r.ipAddress,
        at: r.createdAt.toISOString(),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    });
  }),
);

// ---- Data-principal correction/deletion requests ----

adminRouter.post(
  "/prisoners/:prisonerId/data-request",
  asyncHandler(async (req: AuthedRequest, res) => {
    const prisoner = await prisma.prisoner.findUnique({
      where: { id: req.params.prisonerId! },
    });
    if (!prisoner) throw ApiError.notFound("Prisoner not found");
    await assertIngestionAccess(req, prisoner.jailId);

    const body = z
      .object({
        type: z.enum(["correction", "deletion"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);

    const request = await prisma.dataRequest.create({
      data: {
        prisonerId: prisoner.id,
        requestedBy: req.user!.id,
        type: body.type,
        reason: body.reason,
      },
    });
    audit({
      actorId: req.user!.id,
      action: "datarequest.create",
      entityType: "Prisoner",
      entityId: prisoner.id,
      fieldsTouched: [`type:${body.type}`],
      ipAddress: req.ip,
    });
    res.status(201).json({ data: { id: request.id, status: request.status, type: request.type } });
  }),
);

adminRouter.get(
  "/data-requests",
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.dataRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { prisoner: { select: { prisonerRegNo: true } } },
    });
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        prisonerRegNo: r.prisoner.prisonerRegNo,
        type: r.type,
        reason: r.reason,
        status: r.status,
        actedAt: r.actedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

adminRouter.patch(
  "/data-requests/:id",
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body);
    const dr = await prisma.dataRequest.findUnique({
      where: { id: req.params.id! },
      include: { prisoner: true },
    });
    if (!dr) throw ApiError.notFound("Data request not found");
    if (dr.status !== "pending") throw ApiError.conflict("Request already acted upon");

    if (body.decision === "approve") {
      if (dr.type === "deletion") {
        // Anonymize Tier-1 while keeping de-identified case stats for reporting.
        await prisma.prisoner.update({
          where: { id: dr.prisonerId },
          data: {
            fullNameEnc: dr.prisoner.fullNameEnc ? `ANON-${dr.id}` : null,
            dateOfBirthEnc: null,
            nextOfKinNameEnc: null,
            nextOfKinPhoneEnc: null,
            photoUrlEnc: null,
            fullName: null,
            dateOfBirth: null,
            nextOfKinName: null,
            nextOfKinPhone: null,
            photoUrl: null,
            gender: "redacted",
            nameIdx: null,
          },
        });
      }
      await prisma.dataRequest.update({
        where: { id: dr.id },
        data: { status: "approved", actedBy: req.user!.id, actedAt: new Date() },
      });
    } else {
      await prisma.dataRequest.update({
        where: { id: dr.id },
        data: { status: "rejected", actedBy: req.user!.id, actedAt: new Date() },
      });
    }

    audit({
      actorId: req.user!.id,
      action: `datarequest.${body.decision}`,
      entityType: "Prisoner",
      entityId: dr.prisonerId,
      fieldsTouched: [`request:${dr.type}`],
      ipAddress: req.ip,
    });

    res.json({ data: { id: dr.id, status: body.decision === "approve" ? "approved" : "rejected" } });
  }),
);
