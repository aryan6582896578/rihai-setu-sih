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
  message: { error: { code: "RATE_LIMITED", message: "Too many reset requests — try again shortly" } },
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

function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.JWT_REFRESH_TTL_DAYS}d` as StringValue,
  });
}

function toUserDto(user: { id: string; name: string; email: string; role: Role; isActive: boolean }): UserDto {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw ApiError.unauthorized("Invalid email or password");

    const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordOk) {
      logger.warn(`Failed login attempt`, { email: body.email, ip: req.ip });
      throw ApiError.unauthorized("Invalid email or password");
    }
    if (!user.isActive) throw ApiError.forbidden("This account has been deactivated", "ACCOUNT_INACTIVE");

    const accessToken = signAccessToken(toUserDto(user));
    const refreshToken = signRefreshToken(user.id);
    res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
    logger.info(`Login success`, { email: body.email, ip: req.ip });

    const payload: LoginResponse = { accessToken, user: toUserDto(user) };
    res.json(payload);
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[config.refreshCookieName] as string | undefined;
    if (!token) throw ApiError.unauthorized("Missing refresh token");

    let userId: string;
    try {
      const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as { sub: string };
      userId = payload.sub;
    } catch {
      res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
      throw ApiError.unauthorized("Refresh token is invalid or expired");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
      throw ApiError.unauthorized("Account is inactive or no longer exists");
    }

    res.cookie(config.refreshCookieName, signRefreshToken(user.id), refreshCookieOptions());
    res.json({ accessToken: signAccessToken(toUserDto(user)), user: toUserDto(user) satisfies UserDto });
  }),
);

authRouter.post("/logout", (req, res) => {
  res.clearCookie(config.refreshCookieName, { path: REFRESH_COOKIE_PATH });
  res.status(204).send();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ data: toUserDto(req.user!) });
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
