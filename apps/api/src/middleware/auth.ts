import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@rihai/shared-types";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "./errors.js";
import type { Jail, Prisoner } from "@prisma/client";

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface JailAccessInfo {
  roleAtJail: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      jail?: Jail;
      access?: JailAccessInfo;
    }
  }
}

export type AuthedRequest = Request;

interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(user: AuthedUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized();
    let payload: AccessPayload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw ApiError.unauthorized("Access token is invalid or expired");
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw ApiError.unauthorized("Account is inactive or no longer exists");
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("Your global role does not permit this action"));
    }
    next();
  };
}

export interface JailMembership {
  jail: Jail;
  roleAtJail: Role;
}

export async function assertJailMembership(
  user: { id: string; role: Role },
  jailId: string,
): Promise<JailMembership> {
  const jail = await prisma.jail.findFirst({
    where: { OR: [{ id: jailId }, { code: jailId }] },
  });
  if (!jail) throw ApiError.notFound("Jail not found");
  if (user.role !== Role.SuperAdmin) {
    const access = await prisma.jailAccess.findUnique({
      where: { userId_jailId: { userId: user.id, jailId: jail.id } },
    });
    if (!access) throw ApiError.forbidden("No jail access assigned for this jail", "JAIL_ACCESS_DENIED");
    return { jail, roleAtJail: access.roleAtJail };
  }
  return { jail, roleAtJail: Role.SuperAdmin };
}

export async function requireJailAccess(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const jailId = req.params.jailId ?? req.params.id;
    if (!jailId) throw ApiError.badRequest("jailId path parameter is required");
    const { jail, roleAtJail } = await assertJailMembership(req.user, jailId);
    req.jail = jail;
    req.access = { roleAtJail };
    next();
  } catch (err) {
    next(err);
  }
}

export async function loadPrisonerForUser(
  user: { id: string; role: Role },
  prisonerId: string,
): Promise<{
  prisoner: Prisoner & { jail: Jail };
  membership: JailMembership;
}> {
  const prisoner = await prisma.prisoner.findUnique({
    where: { id: prisonerId },
    include: { jail: true },
  });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");
  const membership = await assertJailMembership(user, prisoner.jailId);
  return { prisoner, membership };
}

// ---------------------------------------------------------------------------
// Prisoner portal auth (Prompt 10) — a separate actor domain. Prisoners are
// NOT Users and never hold JailAccess; their tokens carry actor_type "prisoner"
// so they are structurally distinguishable from staff tokens.
// ---------------------------------------------------------------------------

export const PRISONER_ACTOR_TYPE = "prisoner";

export interface AuthedPrisoner {
  id: string;
  prisonerRegNo: string;
  fullName: string | null;
  pinMustChange: boolean;
}

interface PrisonerAccessPayload {
  sub: string;
  actorType: typeof PRISONER_ACTOR_TYPE;
  regNo: string;
  /** "pin-setup" = temporary session that may only set a new PIN. */
  scope?: "portal" | "pin-setup";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      prisoner?: AuthedPrisoner;
    }
  }
}

export function signPrisonerAccessToken(
  prisoner: { id: string; prisonerRegNo: string },
  scope: "portal" | "pin-setup" = "portal",
): string {
  return jwt.sign(
    { sub: prisoner.id, actorType: PRISONER_ACTOR_TYPE, regNo: prisoner.prisonerRegNo, scope },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_TTL } as jwt.SignOptions,
  );
}

export function verifyPrisonerAccessToken(token: string): PrisonerAccessPayload {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as PrisonerAccessPayload;
  if (payload.actorType !== PRISONER_ACTOR_TYPE) {
    // A staff/org token must never open a portal route.
    throw ApiError.unauthorized("This endpoint requires a prisoner portal session");
  }
  return payload;
}

export function verifyPrisonerAccessTokenPayload(
  req: AuthedRequest,
): PrisonerAccessPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyPrisonerAccessToken(header.slice(7));
  } catch {
    return null;
  }
}

export async function requirePrisoner(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized();
    let payload: PrisonerAccessPayload;
    try {
      payload = verifyPrisonerAccessToken(header.slice(7));
    } catch (err) {
      throw err instanceof ApiError
        ? err
        : ApiError.unauthorized("Portal session is invalid or expired");
    }
    if (payload.scope === "pin-setup") {
      // Temporary post-temp-PIN session: may ONLY set a new PIN (the set-pin
      // route verifies its own token), never read portal content.
      throw ApiError.forbidden(
        "Set your own PIN first to continue",
        "PIN_CHANGE_REQUIRED",
      );
    }
    const prisoner = await prisma.prisoner.findUnique({ where: { id: payload.sub } });
    if (!prisoner || prisoner.prisonerRegNo !== payload.regNo) {
      throw ApiError.unauthorized("Portal session is no longer valid");
    }
    req.prisoner = {
      id: prisoner.id,
      prisonerRegNo: prisoner.prisonerRegNo,
      fullName: prisoner.fullName,
      pinMustChange: prisoner.pinMustChange,
    };
    next();
  } catch (err) {
    next(err);
  }
}
