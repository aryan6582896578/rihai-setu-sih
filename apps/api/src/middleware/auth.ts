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
  const jail = await prisma.jail.findUnique({ where: { id: jailId } });
  if (!jail) throw ApiError.notFound("Jail not found");
  if (user.role !== Role.SuperAdmin) {
    const access = await prisma.jailAccess.findUnique({
      where: { userId_jailId: { userId: user.id, jailId } },
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
