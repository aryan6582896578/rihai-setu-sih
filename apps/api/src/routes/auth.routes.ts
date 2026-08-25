import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { StringValue } from "ms";
import { Role, type LoginResponse, type UserDto } from "@rihai/shared-types";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { encryptField, decryptField } from "../lib/pii.js";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../lib/totp.js";
import { ApiError, asyncHandler } from "../middleware/errors.js";
import { requireAuth, signAccessToken, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: config.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts — try again shortly" } },
});

const forgotLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many reset requests" } },
});

const REFRESH_COOKIE_PATH = "/api/v1/auth";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax" as const,
    path: REFRESH_COOKIE_PATH,
    maxAge: config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

interface RefreshClaims {
  sub: string;
  jti: string;
}

function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.JWT_REFRESH_TTL_DAYS}d` as StringValue,
  });
}

async function issueSession(
  user: { id: string },
  req: AuthedRequest,
  rotatedFrom?: string,
): Promise<string> {
  const jti = crypto.randomUUID();
  const token = signRefreshToken(user.id, jti);
  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      jti,
      tokenHash: sha256(token),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"]?.slice(0, 250) ?? null,
      expiresAt: new Date(Date.now() + config.JWT_REFRESH_TTL_DAYS * 86_400_000),
      ...(rotatedFrom ? { rotatedFrom } : {}),
    },
  });
  return token;
}

/** Roles that MUST use MFA once enrolled (Prompt 8). */
export function mfaRequiredForRole(role: Role): boolean {
  return role === Role.SuperAdmin || role === Role.JailSuperintendent;
}

function toUserDto(user: { id: string; name: string; email: string; role: Role; isActive: boolean }): UserDto {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

function signMfaChallenge(userId: string): string {
  return jwt.sign({ sub: userId, scope: "mfa" }, config.JWT_ACCESS_SECRET, {
    expiresIn: "5m" as StringValue,
  });
}

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw ApiError.unauthorized("Invalid email or password");

    const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordOk) {
      logger.warn(`Failed login attempt`, { email: body.email, ip: req.ip });
      throw ApiError.unauthorized("Invalid email or password");
    }
    if (!user.isActive) throw ApiError.forbidden("This account has been deactivated", "ACCOUNT_INACTIVE");

    // MFA gate: enforced only once a role that requires it has enrolled.
    if (user.mfaEnabled && mfaRequiredForRole(user.role)) {
      logger.info(`Login requires MFA`, { email: body.email, ip: req.ip });
      res.json({ mfaRequired: true, challengeToken: signMfaChallenge(user.id), email: user.email });
      return;
    }

    const accessToken = signAccessToken(toUserDto(user));
    const refreshToken = await issueSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    logger.info(`Login success`, { email: body.email, ip: req.ip });

    const payload: LoginResponse = { accessToken, user: toUserDto(user) };
    res.json(payload);
  }),
);

authRouter.post(
  "/mfa/verify",
  loginLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        challengeToken: z.string().min(10),
        code: z.string().min(5).max(10),
      })
      .parse(req.body);

    let userId: string;
    try {
      const payload = jwt.verify(body.challengeToken, config.JWT_ACCESS_SECRET) as {
        sub: string;
        scope?: string;
      };
      if (payload.scope !== "mfa") throw new Error("wrong scope");
      userId = payload.sub;
    } catch {
      throw ApiError.unauthorized("MFA challenge expired — log in again");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecretEnc) {
      throw ApiError.unauthorized("MFA is not active for this account");
    }

    const secret = decryptField(user.mfaSecretEnc);
    if (!secret || !verifyTotp(secret, body.code)) {
      logger.warn(`Failed MFA attempt`, { email: user.email, ip: req.ip });
      throw ApiError.unauthorized("Invalid authenticator code");
    }

    const accessToken = signAccessToken(toUserDto(user));
    const refreshToken = await issueSession(user, req);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    logger.info(`Login success (MFA)`, { email: user.email, ip: req.ip });
    res.json({ accessToken, user: toUserDto(user) satisfies UserDto });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.cookies?.[config.refreshCookieName] as string | undefined;
    if (!token) throw ApiError.unauthorized("Missing refresh token");

    let claims: RefreshClaims;
    try {
      claims = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshClaims;
    } catch {
      res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
      throw ApiError.unauthorized("Refresh token is invalid or expired");
    }

    // Rotation with server-side session state (Prompt 8): the presented token's
    // session must exist, be unrevoked and unexpired. Reuse of a revoked token
    // revokes nothing new but is rejected like any stale token.
    const session = await prisma.refreshSession.findUnique({ where: { jti: claims.jti } });
    if (
      !session ||
      session.revokedAt ||
      session.tokenHash !== sha256(token) ||
      session.expiresAt < new Date()
    ) {
      res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
      throw ApiError.unauthorized("Refresh session is no longer valid");
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || !user.isActive) {
      res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
      throw ApiError.unauthorized("Account is inactive or no longer exists");
    }

    // Rotate: kill old row, mint a fresh one.
    await prisma.refreshSession.update({
      where: { jti: claims.jti },
      data: { revokedAt: new Date() },
    });
    const refreshToken = await issueSession(user, req, claims.jti);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());

    res.json({ accessToken: signAccessToken(toUserDto(user)), user: toUserDto(user) satisfies UserDto });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req: AuthedRequest, res) => {
    const token = req.cookies?.[config.refreshCookieName] as string | undefined;
    if (token) {
      try {
        const claims = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshClaims;
        await prisma.refreshSession.updateMany({
          where: { jti: claims.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Expired/garbage cookie — clearing below is enough.
      }
    }
    res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({
      data: { ...toUserDto(req.user!), mfaEnabled: user?.mfaEnabled ?? false },
    });
  }),
);

// ---- MFA enrollment (Prompt 8) ----

authRouter.post(
  "/mfa/enroll",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mfaSecretEnc: encryptField(secret), mfaEnabled: false },
    });
    logger.info(`MFA enrollment started`, { userId: req.user!.id });
    res.json({
      data: {
        secret,
        otpauthUrl: otpauthUrl(req.user!.email, secret),
        instructions:
          "Add this key to your authenticator app, then confirm with POST /api/v1/auth/mfa/confirm {code}.",
      },
    });
  }),
);

authRouter.post(
  "/mfa/confirm",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ code: z.string().min(5).max(10) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const secret = decryptField(user.mfaSecretEnc);
    if (!secret) throw ApiError.badRequest("No MFA enrollment in progress — call /mfa/enroll first");
    if (!verifyTotp(secret, body.code)) throw ApiError.badRequest("Code did not match — try the next one", { code: "MFA_CODE_INVALID" });
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    logger.info(`MFA enabled`, { userId: user.id });
    res.json({ data: { mfaEnabled: true } });
  }),
);

authRouter.post(
  "/sessions/revoke-all",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await prisma.refreshSession.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
    logger.info(`All sessions revoked`, { userId: req.user!.id, count: result.count });
    res.json({ data: { revoked: result.count } });
  }),
);

authRouter.post(
  "/forgot-password",
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user) {
      // TODO: deliver via real email service once one is available — token logged server-side for now.
      const resetToken = crypto.randomBytes(24).toString("hex");
      logger.info(`Password reset requested`, { email: body.email, resetToken });
    }
    res.json({ data: { ok: true, message: "If that account exists, a reset has been initiated." } });
  }),
);
