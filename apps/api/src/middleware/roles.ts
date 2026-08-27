import type { NextFunction, Response } from "express";
import { Role } from "@rihai/shared-types";
import { ApiError } from "./errors.js";
import type { AuthedRequest } from "./auth.js";

export const EDITOR_ROLES: Role[] = [Role.SuperAdmin, Role.JailSuperintendent];
export const ADVANCE_ROLES: Role[] = [
  Role.SuperAdmin,
  Role.JailSuperintendent,
  Role.DlsaLawyer,
];
export const REVIEW_ROLES: Role[] = [Role.SuperAdmin, Role.JailSuperintendent, Role.DlsaLawyer];
export const MANAGER_ROLES: Role[] = [Role.SuperAdmin, Role.JailSuperintendent];

export function effectiveRoles(req: AuthedRequest): Set<Role> {
  const set = new Set<Role>();
  if (req.user) {
    set.add(req.user.role);
    if (req.access) set.add(req.access.roleAtJail);
  }
  return set;
}

export function requireAnyOf(...allowed: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    const roles = effectiveRoles(req);
    if (![...roles].some((r) => allowed.includes(r))) {
      return next(ApiError.forbidden("Your role does not permit this action"));
    }
    next();
  };
}

export function roleIsOneOf(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
