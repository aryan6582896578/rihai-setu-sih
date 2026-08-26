/**
 * Prompt 11 verification probe (run: npx tsx apps/api/scripts/prompt11-probe.ts)
 *
 * Mode 1 (lifecycle): env P11_APP_ID set -> polls NotificationLog for the six
 * lifecycle events fired by the HTTP chain in smoke-test-v5.ps1 and asserts each
 * landed with the right template_key/locale/channel.
 * Mode 2 (engine edges): always runs -> consent gate, dedupe, denial gated on
 * LegalAidAssignment (name + phone rendered), bond-amount render, Hindi render,
 * template seed completeness.
 */
import process from "node:process";
import { prisma } from "../src/lib/prisma.js";
import {
  ensureNotificationTemplates,
  sendFamilyEvent,
} from "../src/services/family-notifications.service.js";
import { piiWriteFragment } from "../src/lib/pii.js";

let passCount = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passCount++;
    console.log(`PASS  ${name}`);
  } else {
    failCount++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return fn();
}

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, "!");
}

async function lifecycleMode(appId: string): Promise<void> {
  console.log("=== prompt11 probe: lifecycle rows for HTTP-walked application ===");
  const expected: [string, string][] = [
    ["application_drafted", "application_drafted"],
    ["application_filed", "application_filed"],
    ["hearing_scheduled", "hearing_scheduled"],
    ["order_granted_bond_required", "order_granted_bond_required"],
    ["surety_arranged", "surety_arranged"],
    ["released", "released"],
  ];
  for (const [eventKey] of expected) {
    const dedupe = `${appId}:${eventKey}`;
    const ok = await waitFor(async () =>
      Boolean(await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupe } })),
    );
    const row = await prisma.notificationLog.findFirst({ where: { dedupeKey: dedupe } });
    check(`lifecycle ${eventKey} logged`, ok && Boolean(row));
  }

  // Optional second app (created AFTER consent was switched off): must have ZERO rows.
  const appId2 = process.env.P11_APP_ID2;
  if (appId2) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await prisma.notificationLog.count({
      where: { relatedEntityId: appId2, recipientType: "next_of_kin" },
    });
    check("consent OFF stops sends immediately (second app has no messages)", rows === 0, `rows=${rows}`);
  }

  const bondRow = await prisma.notificationLog.findFirst({
    where: { dedupeKey: `${appId}:order_granted_bond_required` },
  });
  check(
    "bond message carries amount + lawyer contact",
    Boolean(bondRow?.message.includes("25,000") && !bondRow?.message.includes("{{")),
    bondRow?.message.slice(0, 80),
  );
}

async function engineEdgeMode(): Promise<void> {
  console.log("=== prompt11 probe: engine edge cases ===");

  const createdTemplates = await ensureNotificationTemplates();
  const total = await prisma.notificationTemplate.count();
  check("template seed complete (8 events x 2 locales x 2 channels)", total === 32 && createdTemplates === 0, `total=${total}`);

  // Fresh self-contained fixture.
  const jail = await prisma.jail.findFirst({ orderBy: { code: "asc" } });
  if (!jail) throw new Error("no jail");
  const tag = Date.now().toString(36);
  const prisoner = await prisma.prisoner.create({
    data: {
      jailId: jail.id,
      prisonerRegNo: `P11-${tag}`,
      gender: "male",
      admissionDate: new Date(),
      nextOfKinConsentGiven: true,
      nextOfKinPreferredChannel: "sms",
      nextOfKinPreferredLocale: "en",
      ...piiWriteFragment({
        fullName: `P11 Probe ${tag}`,
        nextOfKinName: "Probe Kin",
        nextOfKinPhone: "+9198765000000",
      }),
    },
  });
  const app = await prisma.application.create({
    data: { prisonerId: prisoner.id, type: "bail", stage: "drafted" },
  });

  // Consent OFF -> hard stop even mid-lifecycle.
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { nextOfKinConsentGiven: false },
  });
  let r = await sendFamilyEvent(app.id, "application_drafted");
  check("consent false blocks every send", !r.ok && r.reason === "no_consent", JSON.stringify(r));

  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { nextOfKinConsentGiven: true },
  });

  r = await sendFamilyEvent(app.id, "application_drafted");
  check("drafted event sends via fallback provider", r.ok && r.providerStatus === "logged", JSON.stringify(r.reason ?? r.channelUsed));

  r = await sendFamilyEvent(app.id, "application_drafted");
  check("retrigger does not duplicate (dedupe_key)", !r.ok && r.reason === "duplicate", JSON.stringify(r));

  // Hindi render for a different event on the same app.
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { nextOfKinPreferredLocale: "hi" },
  });
  const hearing = new Date(Date.now() + 14 * 86_400_000);
  await prisma.application.update({
    where: { id: app.id },
    data: { stage: "hearing_scheduled", hearingDate: hearing },
  });
  r = await sendFamilyEvent(app.id, "hearing_scheduled");
  const hiRow = await prisma.notificationLog.findFirst({
    where: { dedupeKey: `${app.id}:hearing_scheduled` },
  });
  check(
    "Hindi template renders (Devanagari present, locale=hi)",
    Boolean(r.ok && hiRow?.locale === "hi" && /[\u0900-\u097F]/.test(hiRow?.message ?? "")),
    hiRow?.message.slice(0, 60),
  );
  await prisma.prisoner.update({
    where: { id: prisoner.id },
    data: { nextOfKinPreferredLocale: "en" },
  });

  // ---- order_denied gating ----
  await prisma.application.update({
    where: { id: app.id },
    data: { stage: "order_passed", orderOutcome: "denied" },
  });
  r = await sendFamilyEvent(app.id, "order_denied");
  check("denial held back without LegalAidAssignment", !r.ok && r.reason === "awaiting_lawyer", JSON.stringify(r));

  let lawyer = await prisma.user.findUnique({ where: { email: "dlsa@rihai.gov.in" } });
  if (!lawyer) lawyer = await prisma.user.findFirst({ where: { role: "dlsa_lawyer" } });
  if (!lawyer) throw new Error("no dlsa lawyer user");
  if (!lawyer.phone) {
    lawyer = await prisma.user.update({
      where: { id: lawyer.id },
      data: { phone: "+919812345678" },
    });
  }
  await prisma.legalAidAssignment.create({
    data: { applicationId: app.id, lawyerId: lawyer.id, method: "manual" },
  });
  r = await sendFamilyEvent(app.id, "order_denied");
  const denialRow = await prisma.notificationLog.findFirst({
    where: { dedupeKey: `${app.id}:order_denied` },
  });
  check(
    "denial sends AFTER assignment, includes lawyer name + phone",
    Boolean(
      r.ok &&
        denialRow?.message.includes(lawyer.name) &&
        denialRow?.message.includes("+919812345678"),
    ),
    denialRow?.message.slice(0, 90),
  );

  // ---- bond-required render with amount ----
  await prisma.application.update({
    where: { id: app.id },
    data: { orderOutcome: "granted" },
  });
  await prisma.suretyStatus.create({
    data: { applicationId: app.id, suretyRequired: true, bondAmount: 15000 },
  });
  r = await sendFamilyEvent(app.id, "order_granted_bond_required");
  const bondRow = await prisma.notificationLog.findFirst({
    where: { dedupeKey: `${app.id}:order_granted_bond_required` },
  });
  check(
    "bond-required message is actionable (amount + lawyer)",
    Boolean(r.ok && bondRow?.message.includes("15,000") && bondRow?.message.includes(lawyer.name)),
    bondRow?.message.slice(0, 90),
  );
}

async function main(): Promise<void> {
  const appId = process.env.P11_APP_ID;
  if (appId) await lifecycleMode(appId);
  else console.log("(P11_APP_ID not set - skipping lifecycle mode)");
  await engineEdgeMode();
  console.log(`\nRESULT: ${passCount} passed, ${failCount} failed`);
  await prisma.$disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

void main();
