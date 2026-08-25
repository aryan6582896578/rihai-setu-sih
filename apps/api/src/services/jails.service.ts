import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  CaseStatus,
  Role,
  type ActivityItem,
  type CreateStaffResult,
  type JailListItem,
  type JailStats,
  type Paginated,
  type StaffMember,
} from "@rihai/shared-types";
import type { Jail } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { piiPublic } from "../lib/pii.js";
import { assertPasswordPolicy } from "../lib/passwords.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";

interface RequestingUser {
  id: string;
  role: Role;
}

const ACTIVITY_FEED_LIMIT = 12;

function occupancyPct(current: number, sanctioned: number): number {
  if (sanctioned <= 0) return 0;
  return Math.round((current / sanctioned) * 1000) / 10;
}

async function countByJail(where: Record<string, unknown>): Promise<Map<string, number>> {
  const groups = await prisma.prisoner.groupBy({
    by: ["jailId"],
    _count: { _all: true },
    where,
  });
  return new Map(groups.map((g) => [g.jailId, g._count._all]));
}

export async function listJailsForUser(
  user: RequestingUser,
  page: number,
  pageSize: number,
): Promise<Paginated<JailListItem>> {
  const where =
    user.role === Role.SuperAdmin ? {} : { jailAccess: { some: { userId: user.id } } };

  const [jails, total] = await prisma.$transaction([
    prisma.jail.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jail.count({ where }),
  ]);

  const jailIds = jails.map((j) => j.id);
  const currentCounts = await countByJail(jailIds.length ? { jailId: { in: jailIds } } : {});
  const undertrialCounts = await countByJail(
    jailIds.length
      ? { jailId: { in: jailIds }, cases: { some: { caseStatus: CaseStatus.Undertrial } } }
      : {},
  );

  const data: JailListItem[] = jails.map((jail) => {
    const current = currentCounts.get(jail.id) ?? 0;
    return {
      id: jail.id,
      name: jail.name,
      state: jail.state,
      district: jail.district,
      code: jail.code,
      sanctionedCapacity: jail.sanctionedCapacity,
      currentCount: current,
      occupancyPct: occupancyPct(current, jail.sanctionedCapacity),
      undertrialCount: undertrialCounts.get(jail.id) ?? 0,
    };
  });

  return { data, page, pageSize, total };
}

export async function getJailStats(jail: Jail): Promise<JailStats> {
  const [
    totalPrisoners,
    undertrialCount,
    convictCount,
    staffCount,
    recentApplications,
    recentAdmissions,
  ] = await Promise.all([
    prisma.prisoner.count({ where: { jailId: jail.id } }),
    prisma.prisoner.count({
      where: { jailId: jail.id, cases: { some: { caseStatus: CaseStatus.Undertrial } } },
    }),
    prisma.prisoner.count({
      where: {
        jailId: jail.id,
        AND: [
          { cases: { some: { caseStatus: CaseStatus.Convict } } },
          { cases: { none: { caseStatus: CaseStatus.Undertrial } } },
        ],
      },
    }),
    prisma.jailAccess.count({ where: { jailId: jail.id, user: { isActive: true } } }),
    prisma.application.findMany({
      where: { prisoner: { jailId: jail.id } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        prisoner: {
          select: { id: true, fullName: true, fullNameEnc: true },
        },
      },
    }),
    prisma.prisoner.findMany({
      where: { jailId: jail.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, fullName: true, fullNameEnc: true, gender: true, createdAt: true },
    }),
  ]);

  const activity: ActivityItem[] = [
    ...recentApplications.map<ApplicationItem>((a) => ({
      kind: "application_stage_change",
      at: a.updatedAt.toISOString(),
      prisonerId: a.prisoner.id,
      prisonerName: piiPublic(a.prisoner).fullName,
      detail: `Application moved to “${stageLabel(a.stage)}”`,
    })),
    ...recentAdmissions.map((p) => ({
      kind: "new_admission" as const,
      at: p.createdAt.toISOString(),
      prisonerId: p.id,
      prisonerName: piiPublic(p).fullName,
      detail: "New admission recorded",
    })),
  ]
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, ACTIVITY_FEED_LIMIT);

  const currentOccupancy = totalPrisoners;
  return {
    jail: {
      id: jail.id,
      name: jail.name,
      district: jail.district,
      state: jail.state,
      code: jail.code,
      address: jail.address,
      contactPhone: jail.contactPhone,
    },
    currentOccupancy,
    sanctionedCapacity: jail.sanctionedCapacity,
    capacityPct: occupancyPct(currentOccupancy, jail.sanctionedCapacity),
    totalPrisoners,
    undertrialCount,
    convictCount,
    staffCount,
    recentActivity: activity,
  };
}

type ApplicationItem = Extract<ActivityItem, { kind: "application_stage_change" }>;

function stageLabel(stage: string): string {
  return stage.replaceAll("_", " ");
}

export async function listStaff(jailId: string): Promise<StaffMember[]> {
  const rows = await prisma.jailAccess.findMany({
    where: { jailId },
    include: { user: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    accessId: row.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    isActive: row.user.isActive,
    roleAtJail: row.roleAtJail,
    globalRole: row.user.role,
  }));
}

export interface AddStaffInput {
  mode: "existing" | "new";
  email: string;
  name?: string;
  roleAtJail: Role;
}

function generateTemporaryPassword(): string {
  return `Setu-${crypto.randomBytes(6).toString("hex")}`;
}

export async function addStaff(jail: Jail, input: AddStaffInput): Promise<CreateStaffResult> {
  const email = input.email.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { email } });
  let temporaryPassword: string | undefined;

  if (input.mode === "existing") {
    if (!user) throw ApiError.notFound(`No user found with email ${email}`);
    if (!user.isActive) throw ApiError.conflict("That account is deactivated and cannot be assigned");
  } else {
    if (user) throw ApiError.conflict("A user with that email already exists — attach them instead");
    if (!input.name?.trim()) throw ApiError.badRequest("name is required when creating a new user");
    temporaryPassword = generateTemporaryPassword();
    assertPasswordPolicy(temporaryPassword); // generated, but keep the policy honest
    user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        role: input.roleAtJail,
        isActive: true,
      },
    });
    logger.info(`Created user ${email} via staff assignment`, { jailCode: jail.code });
  }

  const existingAccess = await prisma.jailAccess.findUnique({
    where: { userId_jailId: { userId: user.id, jailId: jail.id } },
  });

  const access = existingAccess
    ? await prisma.jailAccess.update({
        where: { id: existingAccess.id },
        data: { roleAtJail: input.roleAtJail },
      })
    : await prisma.jailAccess.create({
        data: { userId: user.id, jailId: jail.id, roleAtJail: input.roleAtJail },
      });

  logger.info(
    `${existingAccess ? "Updated" : "Granted"} jail access (${input.roleAtJail}) for ${email} at ${jail.code}`,
  );

  return {
    staff: {
      accessId: access.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roleAtJail: access.roleAtJail,
      globalRole: user.role,
    },
    temporaryPassword,
  };
}

export interface UpdateStaffInput {
  roleAtJail?: Role;
  isActive?: boolean;
}

export async function updateStaffMember(
  jailId: string,
  targetUserId: string,
  input: UpdateStaffInput,
): Promise<{ removed: boolean; staff?: StaffMember }> {
  const access = await prisma.jailAccess.findUnique({
    where: { userId_jailId: { userId: targetUserId, jailId } },
  });
  if (!access) throw ApiError.notFound("That user has no access row for this jail");

  if (input.isActive === false) {
    await prisma.jailAccess.delete({ where: { id: access.id } });
    logger.warn(`Removed jail access`, { jailId, userId: targetUserId });
    return { removed: true };
  }

  const nextRole = input.roleAtJail ?? access.roleAtJail;
  const updated =
    nextRole === access.roleAtJail && !input.roleAtJail
      ? access
      : await prisma.jailAccess.update({ where: { id: access.id }, data: { roleAtJail: nextRole } });

  if (input.isActive === true) {
    await prisma.user.update({ where: { id: targetUserId }, data: { isActive: true } });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId } });
  return {
    removed: false,
    staff: {
      accessId: updated.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roleAtJail: updated.roleAtJail,
      globalRole: user.role,
    },
  };
}
