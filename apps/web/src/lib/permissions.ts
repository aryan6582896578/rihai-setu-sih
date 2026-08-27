import type { Role } from "@rihai/shared-types";

/**
 * Frontend mirror of the backend's role gates so the UI never shows an action
 * the API would reject. Effective role = JailAccess role_at_jail (global role
 * only matters for super_admin cross-jail access, handled by the backend).
 */
export const EDITOR_ROLES: Role[] = ["super_admin", "jail_superintendent"];
export const ADVANCE_ROLES: Role[] = ["super_admin", "jail_superintendent", "dlsa_lawyer"];
export const REVIEW_ROLES: Role[] = ["super_admin", "jail_superintendent", "dlsa_lawyer"];
export const ESCALATION_ROLES: Role[] = ["super_admin", "jail_superintendent"];
export const MANAGER_ROLES: Role[] = ["super_admin", "jail_superintendent"];

export interface RoleFlags {
  canEdit: boolean; // prisoner/case/enrollment/surety/assign/job-apply writes
  canAdvance: boolean; // stage advance + court sync
  canReview: boolean; // mark application reviewed
  canEscalate: boolean; // stall escalation
  isManager: boolean; // superintendent portal, ingestion
}

export function roleFlags(role: Role | string | undefined | null): RoleFlags {
  return {
    canEdit: !!role && EDITOR_ROLES.includes(role as Role),
    canAdvance: !!role && ADVANCE_ROLES.includes(role as Role),
    canReview: !!role && REVIEW_ROLES.includes(role as Role),
    canEscalate: !!role && ESCALATION_ROLES.includes(role as Role),
    isManager: !!role && MANAGER_ROLES.includes(role as Role),
  };
}
