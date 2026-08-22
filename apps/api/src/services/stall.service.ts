import { Prisma } from "@prisma/client";
import {
  ApplicationStage,
  Role,
  STALL_THRESHOLDS_DAYS,
  STALLED_ENTITY_TYPE_APPLICATION,
  type StallRow,
} from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";

interface StallRowRaw {
  id: string;
  stage: string;
  days_stalled: number;
  prisoner_id: string;
  full_name: string;
  case_number: string | null;
  court_name: string | null;
}

function thresholdCaseSql(): string {
  return Object.entries(STALL_THRESHOLDS_DAYS)
    .map(([stage, days]) => `WHEN '${stage}' THEN INTERVAL '${days} days'`)
    .join("\n            ");
}

export async function computeStalledApplications(jailId?: string): Promise<StallRow[]> {
  const jailFilter = jailId ? Prisma.sql` AND p.jail_id = ${jailId}` : Prisma.empty;

  const rows = await prisma.$queryRaw<StallRowRaw[]>(Prisma.sql`
    SELECT
      a.id,
      a.stage::text AS stage,
      FLOOR(EXTRACT(EPOCH FROM (now() - a.updated_at)) / 86400)::int AS days_stalled,
      p.id AS prisoner_id,
      p.full_name,
      latest_case.case_number,
      latest_case.court_name
    FROM "Application" a
    JOIN "Prisoner" p ON p.id = a.prisoner_id
    LEFT JOIN LATERAL (
      SELECT c.case_number, c.court_name
      FROM "CaseRecord" c
      WHERE c.prisoner_id = p.id
      ORDER BY c.updated_at DESC
      LIMIT 1
    ) latest_case ON TRUE
    WHERE a.stage <> 'released'
      AND (now() - a.updated_at) > (
        CASE a.stage::text
          ${Prisma.raw(thresholdCaseSql())}
        END
      )
      ${jailFilter}
    ORDER BY days_stalled DESC, a.updated_at ASC
  `);

  return syncStallAlerts(rows);
}

async function syncStallAlerts(rows: StallRowRaw[]): Promise<StallRow[]> {
  if (rows.length === 0) return [];

  const applicationIds = [...new Set(rows.map((r) => r.id))];
  const alerts = await prisma.stallAlert.findMany({
    where: { entityType: STALLED_ENTITY_TYPE_APPLICATION, entityId: { in: applicationIds } },
  });
  const escalatedByKey = new Map(
    alerts.map((a) => [`${a.entityId}:${a.stage}`, { escalated: a.escalated, escalatedAt: a.escalatedAt }]),
  );

  for (const row of rows) {
    await prisma.stallAlert.upsert({
      where: {
        entityType_entityId_stage: {
          entityType: STALLED_ENTITY_TYPE_APPLICATION,
          entityId: row.id,
          stage: row.stage,
        },
      },
      update: { daysStalled: row.days_stalled },
      create: {
        entityType: STALLED_ENTITY_TYPE_APPLICATION,
        entityId: row.id,
        stage: row.stage,
        daysStalled: row.days_stalled,
      },
    });
  }

  return rows.map((row) => {
    const escalation = escalatedByKey.get(`${row.id}:${row.stage}`);
    return {
      applicationId: row.id,
      prisonerId: row.prisoner_id,
      prisonerName: row.full_name,
      caseNumber: row.case_number ?? "—",
      courtName: row.court_name ?? "—",
      stage: row.stage as ApplicationStage,
      daysStalled: row.days_stalled,
      escalated: escalation?.escalated ?? false,
      escalatedAt: escalation?.escalatedAt?.toISOString() ?? null,
    };
  });
}

const ESCALATION_ALLOWED_ROLES: Role[] = [Role.SuperAdmin, Role.JailSuperintendent, Role.JailStaff];

export async function escalateApplication(userId: string, role: Role, applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!application) throw ApiError.notFound("Application not found");

  if (role !== Role.SuperAdmin) {
    const access = await prisma.jailAccess.findUnique({
      where: { userId_jailId: { userId, jailId: application.prisoner.jailId } },
    });
    if (!access) throw ApiError.forbidden("No jail access assigned for this jail", "JAIL_ACCESS_DENIED");
    if (!ESCALATION_ALLOWED_ROLES.includes(access.roleAtJail)) {
      throw ApiError.forbidden("Your role at this jail does not permit escalating stalls");
    }
  }

  const daysStalled = Math.max(
    0,
    Math.floor((Date.now() - application.updatedAt.getTime()) / 86_400_000),
  );
  const alert = await prisma.stallAlert.upsert({
    where: {
      entityType_entityId_stage: {
        entityType: STALLED_ENTITY_TYPE_APPLICATION,
        entityId: application.id,
        stage: application.stage,
      },
    },
    update: { escalated: true, escalatedAt: new Date(), daysStalled },
    create: {
      entityType: STALLED_ENTITY_TYPE_APPLICATION,
      entityId: application.id,
      stage: application.stage,
      daysStalled,
      escalated: true,
      escalatedAt: new Date(),
    },
  });

  logger.info(`Escalated stall alert`, {
    applicationId,
    stage: alert.stage,
    daysStalled: alert.daysStalled,
    byUser: userId,
  });

  return alert;
}
