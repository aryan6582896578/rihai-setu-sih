import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/**
 * Append-only audit trail for Tier-1/Tier-2 access (Prompt 8).
 * Fire-and-forget: audit failures must never break the underlying operation,
 * but they ARE logged loudly for ops review.
 */
export interface AuditEntry {
  actorId?: string | null;
  actorName?: string | null;
  actorType?: string;
  action: string; // e.g. "prisoner.read" | "prisoner.write" | "llm.invoke"
  entityType: string; // "Prisoner" | "CaseRecord" | "Application" | ...
  entityId?: string | null;
  fieldsTouched?: string[];
  ipAddress?: string | null;
}

export function audit(entry: AuditEntry): void {
  void prisma.auditLog
    .create({
      data: {
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        actorType: entry.actorType ?? "user",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        fieldsTouched: entry.fieldsTouched ? (entry.fieldsTouched as unknown as object) : undefined,
        ipAddress: entry.ipAddress ?? null,
      },
    })
    .catch((err) => logger.error("[audit] write failed", err));
}
