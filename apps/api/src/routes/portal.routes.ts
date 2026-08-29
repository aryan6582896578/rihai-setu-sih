import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { PortalLoginResponse, PortalProfileDto, PortalDocumentDto } from "@rihai/shared-types";
import { audit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/errors.js";
import {
  requirePrisoner,
  verifyPrisonerAccessTokenPayload,
  type AuthedRequest,
} from "../middleware/auth.js";
import {
  confirmResetOtp,
  getPortalDocuments,
  getPortalProfile,
  listDemoPortalAccounts,
  loginKioskBiometric,
  loginWithPin,
  requestResetOtp,
  setPinFirstTimeKiosk,
  setPinFromSession,
} from "../services/portal.service.js";
import { getPrisonerProduction } from "../services/production.service.js";
import { recommendedJobsForPrisoner } from "../services/recommendations.service.js";
import { applyToJob } from "../services/jobs.service.js";

export const portalRouter = Router();

const pinLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts — try again shortly" } },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many reset requests — wait before trying again" },
  },
});

const regNoSchema = z.object({
  prisonerRegNo: z.string().trim().min(1).max(40),
});
const pinSchema = z.object({ pin: z.string().min(4).max(6).regex(/^\d{4,6}$/) });
const newPinSchema = z.object({ newPin: z.string().regex(/^\d{4,6}$/) });

/**
 * Demo login cards for /portal/login (dev/demo builds only — production
 * returns an empty list). Same convenience as the hardcoded staff demo
 * accounts on the staff login page.
 */
portalRouter.get(
  "/auth/demo-accounts",
  asyncHandler(async (_req, res) => {
    const accounts = await listDemoPortalAccounts();
    res.json({ data: accounts });
  }),
);

// ---- Auth Layer 1: reg no + PIN (in-custody kiosk AND post-release device) ----
portalRouter.post(
  "/auth/login-pin",
  pinLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = regNoSchema.merge(pinSchema).parse(req.body);
    const result: PortalLoginResponse = await loginWithPin(body.prisonerRegNo, body.pin, {
      ip: req.ip ?? undefined,
    });
    res.json(result);
  }),
);

// ---- Auth Layer 2: supervised-kiosk biometric (functional mock behind a seam) ----
portalRouter.post(
  "/auth/login-kiosk-biometric",
  pinLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = regNoSchema.parse(req.body);
    const result: PortalLoginResponse = await loginKioskBiometric(body.prisonerRegNo, {
      ip: req.ip ?? undefined,
    });
    res.json(result);
  }),
);

/**
 * PIN setup / change. Three contexts:
 *  - authenticated full session → requires currentPin;
 *  - "pin-setup" scope (temp-PIN login or first-time flow) → no currentPin needed;
 *  - unauthenticated (kiosk, staff-supervised) → only for a prisoner with NO PIN yet.
 */
portalRouter.post(
  "/auth/set-pin",
  pinLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const payload = verifyPrisonerAccessTokenPayload(req);

    if (payload) {
      // Re-verify against DB so the middleware's prisoner record is authoritative.
      const body = z
        .object({ currentPin: z.string().regex(/^\d{4,6}$/).optional(), newPin: z.string().regex(/^\d{4,6}$/) })
        .parse(req.body);
      const scope = payload.scope === "pin-setup" ? "pin-setup" : "portal";
      const accessToken = await setPinFromSession(
        payload.sub,
        { currentPin: body.currentPin, newPin: body.newPin },
        { pinSetupScope: scope === "pin-setup", ip: req.ip ?? undefined },
      );
      res.json({ data: { accessToken, pinChangeRequired: false } });
      return;
    }

    const body = regNoSchema.merge(newPinSchema).parse(req.body);
    const accessToken = await setPinFirstTimeKiosk(body.prisonerRegNo, body.newPin, {
      ip: req.ip ?? undefined,
    });
    res.json({ data: { accessToken, pinChangeRequired: false } });
  }),
);

// ---- Post-release reset path: OTP to next-of-kin phone via NotificationProvider ----
portalRouter.post(
  "/auth/reset-pin/request-otp",
  otpLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = regNoSchema.parse(req.body);
    const result = await requestResetOtp(body.prisonerRegNo, { ip: req.ip ?? undefined });
    res.json(result);
  }),
);

portalRouter.post(
  "/auth/reset-pin/confirm",
  otpLimiter,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = regNoSchema
      .extend({
        otp: z.string().regex(/^\d{6}$/),
        newPin: z.string().regex(/^\d{4,6}$/),
      })
      .parse(req.body);
    await confirmResetOtp(body.prisonerRegNo, body.otp, body.newPin, { ip: req.ip ?? undefined });
    res.json({ ok: true });
  }),
);

// ---- Read-only self-service endpoints (strictly own record) ----

portalRouter.get(
  "/profile",
  requirePrisoner,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profile: PortalProfileDto = await getPortalProfile(req.prisoner!.id);
    audit({
      actorType: "prisoner",
      actorId: req.prisoner!.id,
      actorName: req.prisoner!.fullName,
      action: "portal.profile_read",
      entityType: "Prisoner",
      entityId: req.prisoner!.id,
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: profile });
  }),
);

portalRouter.get(
  "/documents",
  requirePrisoner,
  asyncHandler(async (req: AuthedRequest, res) => {
    const docs: PortalDocumentDto[] = await getPortalDocuments(req.prisoner!.id);
    audit({
      actorType: "prisoner",
      actorId: req.prisoner!.id,
      actorName: req.prisoner!.fullName,
      action: "portal.documents_read",
      entityType: "Prisoner",
      entityId: req.prisoner!.id,
      fieldsTouched: [`count:${docs.length}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: docs });
  }),
);

portalRouter.get(
  "/production",
  requirePrisoner,
  asyncHandler(async (req: AuthedRequest, res) => {
    const summary = await getPrisonerProduction(req.prisoner!.id);
    audit({
      actorType: "prisoner",
      actorId: req.prisoner!.id,
      actorName: req.prisoner!.fullName,
      action: "portal.production_read",
      entityType: "Prisoner",
      entityId: req.prisoner!.id,
      fieldsTouched: [`count:${summary.totalItems}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: summary });
  }),
);

portalRouter.get(
  "/recommended-jobs",
  requirePrisoner,
  asyncHandler(async (req: AuthedRequest, res) => {
    const recs = await recommendedJobsForPrisoner(req.prisoner!.id, 10, { bypassConsentCheck: true });
    audit({
      actorType: "prisoner",
      actorId: req.prisoner!.id,
      actorName: req.prisoner!.fullName,
      action: "portal.recommended_jobs_read",
      entityType: "Prisoner",
      entityId: req.prisoner!.id,
      fieldsTouched: [`count:${recs.length}`],
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: recs });
  }),
);

portalRouter.post(
  "/jobs/:jobId/apply",
  requirePrisoner,
  asyncHandler(async (req: AuthedRequest, res) => {
    const app = await applyToJob(
      req.prisoner!.id,
      req.params.jobId!,
      req.prisoner!.fullName ?? "Candidate Prisoner",
      req.body?.note || "Applied via Prisoner Self-Service Portal Kiosk",
    );
    audit({
      actorType: "prisoner",
      actorId: req.prisoner!.id,
      actorName: req.prisoner!.fullName,
      action: "portal.job_apply",
      entityType: "JobApplication",
      entityId: app.id,
      ipAddress: req.ip ?? undefined,
    });
    res.json({ data: app });
  }),
);
