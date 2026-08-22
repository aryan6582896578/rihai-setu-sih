import { Router } from "express";
import type { NextFunction } from "express";
import { z } from "zod";
import { Role } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import {
  asyncHandler,
  ApiError,
} from "../middleware/errors.js";
import {
  requireAuth,
  requireJailAccess,
  requireRoles,
  type AuthedRequest,
} from "../middleware/auth.js";
import {
  addStaff,
  getJailStats,
  listJailsForUser,
  listStaff,
  updateStaffMember,
  type AddStaffInput,
  type UpdateStaffInput,
} from "../services/jails.service.js";
import { computeStalledApplications } from "../services/stall.service.js";

export const jailsRouter = Router();

jailsRouter.use(requireAuth);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function assertCanManageStaff(req: AuthedRequest, _res: unknown, next: NextFunction): void {
  if (!req.user) return next(ApiError.unauthorized());
  const managerRoles: Role[] = [Role.SuperAdmin, Role.JailSuperintendent];
  const isManager =
    managerRoles.includes(req.user.role) ||
    (req.access && managerRoles.includes(req.access.roleAtJail));
  if (!isManager) {
    return next(ApiError.forbidden("Only superintendents can manage employees for this jail"));
  }
  next();
}

jailsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const result = await listJailsForUser(req.user!, query.page, query.pageSize);
    res.json({ data: result.data, page: result.page, pageSize: result.pageSize, total: result.total });
  }),
);

jailsRouter.get(
  "/:id",
  requireJailAccess,
  asyncHandler(async (req, res) => {
    const jail = await prisma.jail.findUniqueOrThrow({ where: { id: req.params.id! } });
    res.json({ data: jail });
  }),
);

jailsRouter.get(
  "/:id/stats",
  requireJailAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: await getJailStats(req.jail!) });
  }),
);

const addStaffSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    email: z.string().trim().toLowerCase().email(),
    roleAtJail: z.nativeEnum(Role),
  }),
  z.object({
    mode: z.literal("new"),
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(2),
    roleAtJail: z.nativeEnum(Role),
  }),
]);

jailsRouter.get(
  "/:id/staff",
  requireJailAccess,
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  assertCanManageStaff,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: await listStaff(req.params.id!) });
  }),
);

jailsRouter.post(
  "/:id/staff",
  requireJailAccess,
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  assertCanManageStaff,
  asyncHandler(async (req: AuthedRequest, res) => {
    const input = addStaffSchema.parse(req.body) as AddStaffInput;
    res.status(201).json({ data: await addStaff(req.jail!, input) });
  }),
);

const updateStaffSchema = z
  .object({
    roleAtJail: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.roleAtJail !== undefined || v.isActive !== undefined, {
    message: "Provide roleAtJail and/or isActive",
  });

jailsRouter.patch(
  "/:id/staff/:userId",
  requireJailAccess,
  requireRoles(Role.SuperAdmin, Role.JailSuperintendent),
  assertCanManageStaff,
  asyncHandler(async (req: AuthedRequest, res) => {
    const input = updateStaffSchema.parse(req.body) as UpdateStaffInput;
    res.json({ data: await updateStaffMember(req.params.id!, req.params.userId!, input) });
  }),
);

jailsRouter.get(
  "/:id/stall-list",
  requireJailAccess,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: await computeStalledApplications(req.params.id!) });
  }),
);
