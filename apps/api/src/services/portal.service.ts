import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ApplicationStage,
  EligibilityStatus,
  type PortalDocumentDto,
  type PortalLoginResponse,
  type PortalPrisonerDto,
  type PortalProfileDto,
} from "@rihai/shared-types";
import type { Prisoner } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import { config } from "../config.js";
import { decryptField, piiPublic, piiWriteFragment } from "../lib/pii.js";
import { notificationProvider } from "../lib/notification-provider.js";
import { kioskBiometricProvider } from "../lib/kiosk-biometric-provider.js";
import { ApiError } from "../middleware/errors.js";
import { signPrisonerAccessToken } from "../middleware/auth.js";
import { REASONS } from "../domain/section479.js";
import { stageIndex, toApplicationDto } from "./applications.service.js";
import { custodyLabel } from "./prisoners.service.js";

/**
 * Prompt 10 — prisoner-facing portal domain.
 * Two auth contexts, one persistent identity:
 *   - In-custody: supervised kiosk inside the jail (PIN setup + biometric mock)
 *   - Post-release: the person's own device with the same reg-no + PIN credential
 */

const MAX_FAILED_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 30;
const OTP_TTL_MINUTES = 10;
const MS_PER_DAY = 86_400_000;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function assertPinFormat(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw ApiError.badRequest("PIN must be 4 to 6 digits");
  }
}

function toPortalPrisonerDto(p: Prisoner): PortalPrisonerDto {
  return {
    prisonerId: p.id,
    fullName: piiPublic(p).fullName,
    prisonerRegNo: p.prisonerRegNo,
    jailName: "",
  };
}

async function loadByRegNo(regNo: string): Promise<Prisoner | null> {
  const normalized = regNo.trim();
  if (!normalized) return null;
  return prisma.prisoner.findUnique({ where: { prisonerRegNo: normalized } });
}

/** Generic invalid-credential error — never reveals whether a reg no exists. */
function invalidCredentials(remaining?: number): ApiError {
  const suffix =
    remaining !== undefined
      ? ` ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before the account locks.`
      : "";
  return new ApiError(
    401,
    "INVALID_CREDENTIALS",
    `Incorrect registration number or PIN.${suffix}`,
  );
}

// ---------------------------------------------------------------------------
// Auth Layer 1 — prisoner_reg_no + PIN (works in-custody and post-release)
// ---------------------------------------------------------------------------

export async function loginWithPin(
  regNo: string,
  pin: string,
  ctx: { ip?: string },
): Promise<PortalLoginResponse> {
  const prisoner = await loadByRegNo(regNo);
  if (!prisoner) {
    audit({
      actorType: "prisoner",
      action: "portal.login_failed",
      entityType: "Prisoner",
      ipAddress: ctx.ip ?? undefined,
    });
    throw invalidCredentials();
  }

  if (prisoner.lockedUntil && prisoner.lockedUntil > new Date()) {
    audit({
      actorType: "prisoner",
      action: "portal.login_blocked_locked",
      entityType: "Prisoner",
      entityId: prisoner.id,
      ipAddress: ctx.ip ?? undefined,
    });
    const mins = Math.max(1, Math.ceil((prisoner.lockedUntil.getTime() - Date.now()) / 60000));
    throw new ApiError(
      403,
      "ACCOUNT_LOCKED",
      `Too many incorrect PIN attempts. This account is locked for another ${mins} minute${mins === 1 ? "" : "s"}.`,
    );
  }

  if (!prisoner.pinHash || !prisoner.pinSetAt) {
    audit({
      actorType: "prisoner",
      action: "portal.login_failed",
      entityType: "Prisoner",
      entityId: prisoner.id,
      fieldsTouched: ["no_pin_set"],
      ipAddress: ctx.ip ?? undefined,
    });
    throw new ApiError(
      403,
      "PIN_NOT_SET",
      "No PIN has been set up for this registration number yet. First-time setup happens at the jail kiosk with a staff member present.",
    );
  }

  const pinOk = await bcrypt.compare(pin, prisoner.pinHash);
  if (!pinOk) {
    const failed = prisoner.failedPinAttempts + 1;
    const shouldLock = failed >= MAX_FAILED_PIN_ATTEMPTS;
    await prisma.prisoner.update({
      where: { id: prisoner.id },
      data: {
        failedPinAttempts: failed,
        ...(shouldLock ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : {}),
      },
    });
    audit({
      actorType: "prisoner",
      action: "portal.login_failed",
      entityType: "Prisoner",
      entityId: prisoner.id,
      fieldsTouched: [`failed_pin_attempts:${failed}`, ...(shouldLock ? ["locked_until"] : [])],
      ipAddress: ctx.ip ?? undefined,
    });
    if (shouldLock) {
      throw new ApiError(
        403,
        "ACCOUNT_LOCKED",
        `Too many incorrect PIN attempts. This account is locked for ${LOCK_MINUTES} minutes.`,
      );
    }
    throw invalidCredentials(MAX_FAILED_PIN_ATTEMPTS - failed);
  }

  // Success: clear failure state, mint token scoped to this prisoner only.
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { failedPinAttempts: 0, lockedUntil: null },
  });

  const pinChangeRequired = prisoner.pinMustChange;
  const accessToken = signPrisonerAccessToken(prisoner, pinChangeRequired ? "pin-setup" : "portal");
  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    actorName: piiPublic(prisoner).fullName,
    action: "portal.login",
    entityType: "Prisoner",
    entityId: prisoner.id,
    fieldsTouched: [pinChangeRequired ? "scope:pin-setup" : "scope:portal"],
    ipAddress: ctx.ip ?? undefined,
  });

  return {
    accessToken,
    pinChangeRequired,
    prisoner: { ...toPortalPrisonerDto(prisoner), jailName: await jailNameOf(prisoner.jailId) },
  };
}

// ---------------------------------------------------------------------------
// Auth Layer 2 — kiosk biometric (functional mock behind a real-integration seam)
// ---------------------------------------------------------------------------

export async function loginKioskBiometric(
  regNo: string,
  ctx: { ip?: string },
): Promise<PortalLoginResponse> {
  const prisoner = await loadByRegNo(regNo);

  const result = await kioskBiometricProvider.verifyFingerprint({ prisonerRegNo: regNo.trim() });
  if (!result.matched || !prisoner) {
    audit({
      actorType: "prisoner",
      action: "portal.login_biometric_failed",
      entityType: "Prisoner",
      entityId: prisoner?.id ?? null,
      ipAddress: ctx.ip ?? undefined,
    });
    throw ApiError.unauthorized("Fingerprint did not match our records");
  }

  if (prisoner.lockedUntil && prisoner.lockedUntil > new Date()) {
    throw new ApiError(403, "ACCOUNT_LOCKED", "This account is locked. Ask staff for help.");
  }

  const accessToken = signPrisonerAccessToken(prisoner, "portal");
  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    actorName: piiPublic(prisoner).fullName,
    action: "portal.login_biometric",
    entityType: "Prisoner",
    entityId: prisoner.id,
    fieldsTouched: [`method:${result.method}`],
    ipAddress: ctx.ip ?? undefined,
  });

  return {
    accessToken,
    pinChangeRequired: false,
    prisoner: { ...toPortalPrisonerDto(prisoner), jailName: await jailNameOf(prisoner.jailId) },
  };
}

// ---------------------------------------------------------------------------
// PIN lifecycle — first-time kiosk setup, self change, staff temp PIN, OTP reset
// ---------------------------------------------------------------------------

/** First-time setup at the supervised kiosk: allowed only when NO PIN exists yet. */
export async function setPinFirstTimeKiosk(regNo: string, newPin: string, ctx: { ip?: string }) {
  assertPinFormat(newPin);
  const prisoner = await loadByRegNo(regNo);
  if (!prisoner || prisoner.pinHash) {
    // Same error whether the reg no is unknown or already has a PIN — no probing.
    throw ApiError.forbidden(
      "First-time PIN setup must be done at the jail kiosk with staff present.",
      "PIN_SETUP_UNAVAILABLE",
    );
  }
  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { pinHash, pinSetAt: new Date(), pinMustChange: false, failedPinAttempts: 0, lockedUntil: null },
  });
  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    action: "portal.pin_set_first_time",
    entityType: "Prisoner",
    entityId: prisoner.id,
    ipAddress: ctx.ip ?? undefined,
  });
  return signPrisonerAccessToken(prisoner, "portal");
}

/** Change PIN from an authenticated session (full session needs currentPin). */
export async function setPinFromSession(
  prisonerId: string,
  input: { currentPin?: string; newPin: string },
  ctx: { pinSetupScope: boolean; ip?: string },
): Promise<string> {
  assertPinFormat(input.newPin);
  const prisoner = await prisma.prisoner.findUniqueOrThrow({ where: { id: prisonerId } });
  if (!prisoner.pinHash) {
    throw ApiError.conflict("No PIN exists yet — first-time setup happens at the kiosk", "PIN_NOT_SET");
  }
  if (!ctx.pinSetupScope) {
    // Full sessions must prove the current PIN before changing it.
    if (!input.currentPin || !(await bcrypt.compare(input.currentPin, prisoner.pinHash))) {
      throw ApiError.unauthorized("Current PIN is incorrect");
    }
  }
  const pinHash = await bcrypt.hash(input.newPin, 10);
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { pinHash, pinSetAt: new Date(), pinMustChange: false, failedPinAttempts: 0, lockedUntil: null },
  });
  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    action: "portal.pin_changed",
    entityType: "Prisoner",
    entityId: prisoner.id,
    fieldsTouched: ["pin_hash", "pin_set_at", "pin_must_change"],
    ipAddress: ctx.ip ?? undefined,
  });
  return signPrisonerAccessToken(prisoner, "portal");
}

/**
 * Staff-assisted reset: issues a one-time temporary PIN shown once to the
 * prisoner; they must change it on next login (pin_must_change).
 */
export async function issueTemporaryPin(
  prisonerId: string,
  staff: { id: string; name: string },
): Promise<{ temporaryPin: string }> {
  const prisoner = await prisma.prisoner.findUnique({ where: { id: prisonerId } });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");

  const temporaryPin = String(crypto.randomInt(100000, 1000000));
  const pinHash = await bcrypt.hash(temporaryPin, 10);
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: {
      pinHash,
      pinSetAt: new Date(),
      pinMustChange: true,
      failedPinAttempts: 0,
      lockedUntil: null,
    },
  });
  audit({
    actorType: "user",
    actorId: staff.id,
    actorName: staff.name,
    action: "portal.temp_pin_issued",
    entityType: "Prisoner",
    entityId: prisoner.id,
    fieldsTouched: ["pin_hash", "pin_must_change"],
  });
  logger.info(`Temp portal PIN issued`, { prisonerId: prisoner.id, byUser: staff.id });
  return { temporaryPin };
}

/** Post-release self-service: OTP to the next-of-kin phone on record. */
export async function requestResetOtp(regNo: string, ctx: { ip?: string }) {
  const prisoner = await loadByRegNo(regNo);
  // Uniform response regardless of existence — prevents reg-no enumeration.
  if (!prisoner) {
    return { ok: true as const, sentTo: null as string | null, devOtp: undefined as string | undefined };
  }

  const phone = decryptField(prisoner.nextOfKinPhoneEnc) ?? prisoner.nextOfKinPhone;
  if (!phone) {
    return { ok: true as const, sentTo: null, devOtp: undefined };
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: {
      resetOtpHash: sha256(otp),
      resetOtpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });

  const message = `RIHAI SETU: the PIN reset code for prison registration ${prisoner.prisonerRegNo} is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes. If you did not request this, ignore this message.`;
  try {
    await notificationProvider.send(phone, "sms", message);
    await prisma.notificationLog.create({
      data: {
        recipientType: "next_of_kin",
        recipientContact: phone,
        channel: "sms",
        message,
        relatedEntityType: "Prisoner",
        relatedEntityId: prisoner.id,
        status: "logged",
      },
    });
  } catch (err) {
    logger.error("[portal] OTP send failed", err);
  }

  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    action: "portal.pin_reset_otp_requested",
    entityType: "Prisoner",
    entityId: prisoner.id,
    ipAddress: ctx.ip ?? undefined,
  });

  // TODO(SMS): drop devOtp once a real provider is configured — it exists so the
  // demo can complete the flow without live SMS delivery.
  const devOtp = process.env.NODE_ENV === "production" ? undefined : otp;
  return { ok: true as const, sentTo: maskPhone(phone), devOtp };
}

export async function confirmResetOtp(
  regNo: string,
  otp: string,
  newPin: string,
  ctx: { ip?: string },
): Promise<void> {
  assertPinFormat(newPin);
  const prisoner = await loadByRegNo(regNo);
  const valid =
    prisoner &&
    prisoner.resetOtpHash &&
    prisoner.resetOtpExpiresAt &&
    prisoner.resetOtpExpiresAt > new Date() &&
    crypto.timingSafeEqual(Buffer.from(prisoner.resetOtpHash), Buffer.from(sha256(otp)));
  if (!valid) {
    throw ApiError.badRequest("That code is invalid or has expired. Request a new one.");
  }

  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: {
      pinHash,
      pinSetAt: new Date(),
      pinMustChange: false,
      failedPinAttempts: 0,
      lockedUntil: null,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
    },
  });
  audit({
    actorType: "prisoner",
    actorId: prisoner.id,
    action: "portal.pin_reset_completed",
    entityType: "Prisoner",
    entityId: prisoner.id,
    ipAddress: ctx.ip ?? undefined,
  });
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : `••••••${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Read-only profile + documents (strictly scoped to the caller's own record)
// ---------------------------------------------------------------------------

function plainLanguageEligibility(status: string | null, reason: string | null) {
  if (!status || !reason) {
    return {
      status: "none" as const,
      headline: "Eligibility not assessed yet",
      plainReason:
        "Your case has not been checked against Section 479 yet. Ask the jail staff when the next check happens.",
      computedAt: null as string | null,
    };
  }
  switch (reason) {
    case REASONS.deathOrLife:
      return {
        status,
        headline: "Not covered by Section 479",
        plainReason:
          "Because of the seriousness of the charges in your case, Section 479 does not apply. Only a judge can decide about release in your case.",
        computedAt: null as string | null,
      };
    case REASONS.multiplePending:
      return {
        status,
        headline: "Not covered by Section 479 right now",
        plainReason:
          "Section 479 does not apply while more than one case is pending against you. If that changes, your eligibility will be checked again automatically.",
        computedAt: null as string | null,
      };
    case REASONS.halfSentence:
      return {
        status: EligibilityStatus.Eligible,
        headline: "You may qualify for release consideration",
        plainReason:
          "You have completed half of the maximum punishment for your case. Under Section 479 the jail can prepare your release papers for the court to consider.",
        computedAt: null as string | null,
      };
    case REASONS.thirdFirstTimer:
      return {
        status: EligibilityStatus.Eligible,
        headline: "You may qualify for release consideration",
        plainReason:
          "As a first-time offender you have completed one-third of the maximum punishment for your case. Under Section 479 the jail can prepare your release papers for the court to consider.",
        computedAt: null as string | null,
      };
    case REASONS.belowThreshold:
      return {
        status: EligibilityStatus.NotEligible,
        headline: "Not yet eligible",
        plainReason:
          "Your time in custody has not reached the legal limit needed for Section 479 yet. The system checks this every night and updates you here automatically.",
        computedAt: null as string | null,
      };
    default:
      return {
        status,
        headline: status === "eligible" ? "You may qualify for release consideration" : "Checked — see details",
        plainReason: reason,
        computedAt: null as string | null,
      };
  }
}

async function jailNameOf(jailId: string): Promise<string> {
  const jail = await prisma.jail.findUnique({ where: { id: jailId }, select: { name: true } });
  return jail?.name ?? "";
}

export async function getPortalProfile(prisonerId: string): Promise<PortalProfileDto> {
  const prisoner = await prisma.prisoner.findUnique({
    where: { id: prisonerId },
    include: { jail: true },
  });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");

  const [assessment, cases, applications] = await Promise.all([
    prisma.eligibilityAssessment.findFirst({
      where: { prisonerId },
      orderBy: { computedAt: "desc" },
    }),
    prisma.caseRecord.findMany({
      where: { prisonerId },
      orderBy: [{ caseStatus: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.application.findMany({
      where: { prisonerId },
      include: { reviewer: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const pii = piiPublic(prisoner);
  const custodyStart = cases[0]?.custodyStartDate ?? prisoner.admissionDate;
  const custodyDays = Math.floor((Date.now() - custodyStart.getTime()) / MS_PER_DAY);

  const eligibility = assessment
    ? {
        ...plainLanguageEligibility(assessment.status, assessment.reason),
        status: assessment.status,
        computedAt: assessment.computedAt.toISOString(),
      }
    : plainLanguageEligibility(null, null);

  return {
    prisonerId: prisoner.id,
    fullName: pii.fullName,
    prisonerRegNo: prisoner.prisonerRegNo,
    photoUrl: pii.photoUrl,
    gender: prisoner.gender,
    jailName: prisoner.jail.name,
    jailDistrict: prisoner.jail.district,
    admissionDate: prisoner.admissionDate.toISOString(),
    custodyDurationLabel: custodyLabel(Math.max(0, custodyDays)),
    eligibility,
    applications: applications.map(toApplicationDto),
  };
}

/**
 * Documents visible to the prisoner:
 *  - Skill Passport certificates from completed enrollments;
 *  - application documents ONLY once stage >= filed AND reviewed_by is set —
 *    a prisoner never sees an AI-drafted draft before a lawyer reviewed it.
 */
export async function getPortalDocuments(prisonerId: string): Promise<PortalDocumentDto[]> {
  const [enrollments, applications] = await Promise.all([
    prisma.enrollment.findMany({
      where: { prisonerId, status: "completed", certificateUrl: { not: null } },
      include: { program: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.application.findMany({
      where: {
        prisonerId,
        reviewedBy: { not: null },
        generatedDocumentUrl: { not: null },
        stage: { in: [
          ApplicationStage.Filed,
          ApplicationStage.HearingScheduled,
          ApplicationStage.OrderPassed,
          ApplicationStage.Released,
        ] },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const docs: PortalDocumentDto[] = [];
  for (const e of enrollments) {
    docs.push({
      id: e.id,
      kind: "skill_certificate",
      title: `Skill Certificate — ${e.program.name}`,
      detail: `${e.program.category} · completed`,
      issuedAt: e.completedAt?.toISOString() ?? null,
      url: e.certificateUrl!,
    });
  }
  for (const a of applications) {
    if (stageIndex(a.stage) < stageIndex(ApplicationStage.Filed)) continue;
    docs.push({
      id: a.id,
      kind: "application_document",
      title: `${a.type === "personal_bond" ? "Personal bond" : "Bail"} application copy`,
      detail: `Stage: ${a.stage.replaceAll("_", " ")}`,
      issuedAt: a.filedDate?.toISOString() ?? a.updatedAt.toISOString(),
      url: a.generatedDocumentUrl!,
    });
  }
  return docs.sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""));
}

// ---------------------------------------------------------------------------
// Demo accounts (DEV/DEMO ONLY) — stable known PINs so the login page can offer
// one-click prisoner demo logins exactly like the staff login page does.
// TODO(demo): remove this block and the /auth/demo-accounts endpoint for any
// real deployment; production returns an empty list from both.
// ---------------------------------------------------------------------------

export const DEMO_PORTAL_PIN = "2468";

/** Deterministic trio: first prisoner (by reg no) of the first three jails by code. */
async function selectDemoPrisoners(): Promise<(Prisoner & { jail: { name: string } })[]> {
  const jails = await prisma.jail.findMany({ orderBy: { code: "asc" }, take: 3 });
  const picks: (Prisoner & { jail: { name: string } })[] = [];
  for (const jail of jails) {
    // Preference tiers: real dataset rows with a Skill Passport, then any
    // dataset row, then anything (keeps smoke-test probe records out of the
    // demo cards when proper seeded data exists).
    const tiers: Prisma.PrisonerWhereInput[] = [
      { prisonerRegNo: { contains: "UTP-" }, sourceSystem: null, enrollments: { some: {} } },
      { prisonerRegNo: { contains: "UTP-" }, sourceSystem: null },
      {},
    ];
    let picked: (Prisoner & { jail: { name: string } }) | null = null;
    for (const where of tiers) {
      picked = await prisma.prisoner.findFirst({
        where: { jailId: jail.id, ...where },
        orderBy: { prisonerRegNo: "asc" },
        include: { jail: { select: { name: true } } },
      });
      if (picked) break;
    }
    if (picked) picks.push(picked);
  }
  return picks;
}

/**
 * Runs at API startup outside production: resets the demo prisoners to the
 * shared demo PIN and records a synthetic next-of-kin contact (OTP-reset
 * target). Re-running is safe — it always re-asserts the same state so demo
 * cards keep working after smoke tests have mutated PINs.
 */
export async function ensureDemoPortalAccounts(): Promise<void> {
  if (config.isProduction) return;
  const picks = await selectDemoPrisoners();
  if (picks.length === 0) return;
  const pinHash = await bcrypt.hash(DEMO_PORTAL_PIN, 10);
  let seq = 1;
  for (const p of picks) {
    await prisma.prisoner.update({
      where: { id: p.id },
      data: {
        pinHash,
        pinSetAt: new Date(),
        pinMustChange: false,
        failedPinAttempts: 0,
        lockedUntil: null,
        resetOtpHash: null,
        resetOtpExpiresAt: null,
        ...piiWriteFragment({
          nextOfKinName: "Family contact (demo)",
          nextOfKinPhone: `+91987650430${seq++}`,
        }),
      },
    });
  }
  logger.info(`[demo] ${picks.length} portal demo account(s) reset to the shared demo PIN`);
}

export interface PortalDemoAccountDto {
  prisonerRegNo: string;
  fullName: string;
  jailName: string;
}

export async function listDemoPortalAccounts(): Promise<PortalDemoAccountDto[]> {
  if (config.isProduction) return [];
  const picks = await selectDemoPrisoners();
  return picks.map((p) => ({
    prisonerRegNo: p.prisonerRegNo,
    fullName: piiPublic(p).fullName,
    jailName: p.jail.name,
  }));
}
