import { ApplicationStage, Role } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { notificationProvider } from "../lib/notification-provider.js";
import { piiPublic } from "../lib/pii.js";
import { sendFamilyEvent, type FamilyEventKey } from "./family-notifications.service.js";

type RecipientType = "next_of_kin" | "jail_staff" | "dlsa_lawyer";

async function logAndSend(opts: {
  recipientType: RecipientType;
  contact?: string | null;
  userId?: string | null;
  channel: "sms" | "whatsapp" | "in_app";
  message: string;
  relatedEntityType: string;
  relatedEntityId: string;
}): Promise<void> {
  try {
    let status = "logged";
    if (opts.channel !== "in_app" && opts.contact) {
      const result = await notificationProvider.send(opts.contact, opts.channel, opts.message);
      status = result.status;
    }
    await prisma.notificationLog.create({
      data: {
        recipientType: opts.recipientType,
        recipientContact: opts.contact ?? null,
        recipientUserId: opts.userId ?? null,
        channel: opts.channel,
        message: opts.message,
        relatedEntityType: opts.relatedEntityType,
        relatedEntityId: opts.relatedEntityId,
        status,
        isRead: false,
      },
    });
  } catch (err) {
    logger.error("[notify] failed to record notification", err);
  }
}

export async function notifyStageChange(
  applicationId: string,
  newStage: ApplicationStage,
): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      prisoner: true,
      legalAidAssignment: { include: { lawyer: { select: { id: true, name: true } } } },
    },
  });
  if (!app) return;

  // Prompt 11: family messages are templated per event, not generic. Only these
  // stages carry a family-facing event; hearing/order/surety hooks fire from the
  // court-sync and surety flows where their specifics (date, outcome, amount)
  // are known.
  const stageEvent: Partial<Record<ApplicationStage, FamilyEventKey>> = {
    [ApplicationStage.Drafted]: "application_drafted",
    [ApplicationStage.Filed]: "application_filed",
    [ApplicationStage.Released]: "released",
  };
  const event = stageEvent[newStage];
  if (event) {
    try {
      await sendFamilyEvent(applicationId, event);
    } catch (err) {
      logger.error("[notify] family stage event failed", err);
    }
  }

  if (app.legalAidAssignment) {
    const pii = piiPublic(app.prisoner);
    const stageText = newStage.replaceAll("_", " ");
    await logAndSend({
      recipientType: "dlsa_lawyer",
      userId: app.legalAidAssignment.lawyerId,
      channel: "in_app",
      message: `Application for ${pii.fullName} advanced to "${stageText}".`,
      relatedEntityType: "Application",
      relatedEntityId: app.id,
    });
  }
}

export async function notifyStallEscalated(
  jailId: string,
  applicationId: string,
  detail: string,
): Promise<void> {
  const accesses = await prisma.jailAccess.findMany({
    where: { jailId, roleAtJail: { in: [Role.JailStaff, Role.JailSuperintendent] } },
    include: { user: { select: { id: true, name: true, isActive: true } } },
  });

  for (const access of accesses) {
    if (!access.user.isActive) continue;
    await logAndSend({
      recipientType: access.roleAtJail === Role.JailSuperintendent ? "jail_staff" : "jail_staff",
      userId: access.userId,
      channel: "in_app",
      message: `STALL ESCALATED - ${detail}. Please review and act.`,
      relatedEntityType: "Application",
      relatedEntityId: applicationId,
    });
  }
}

/**
 * NGO moved a candidate through the hiring pipeline (shortlisted/hired/rejected).
 * Jail staff of the prisoner's facility get an in-app row; on hire the
 * next-of-kin SMS log also records the good news (provider seam as usual).
 */
export async function notifyJobApplicationStatus(opts: {
  jailId: string;
  applicationId: string;
  prisonerName: string;
  jobTitle: string;
  ngoName: string;
  status: "shortlisted" | "hired" | "rejected";
}): Promise<void> {
  const verb =
    opts.status === "shortlisted"
      ? "SHORTLISTED"
      : opts.status === "hired"
        ? "SELECTED FOR HIRING"
        : "not progressed";
  const message = `NGO update: "${opts.prisonerName}" was ${verb} by ${opts.ngoName} for the role "${opts.jobTitle}".`;

  const accesses = await prisma.jailAccess.findMany({
    where: { jailId: opts.jailId, roleAtJail: { in: [Role.JailStaff, Role.JailSuperintendent] } },
    include: { user: { select: { id: true, isActive: true } } },
  });
  for (const access of accesses) {
    if (!access.user.isActive) continue;
    await logAndSend({
      recipientType: "jail_staff",
      userId: access.userId,
      channel: "in_app",
      message,
      relatedEntityType: "JobPosting",
      relatedEntityId: opts.applicationId,
    });
  }

  if (opts.status === "hired") {
    await logAndSend({
      recipientType: "next_of_kin",
      contact: null, // phone decrypted at call site when provider goes live
      channel: "sms",
      message: `RIHAI SETU: ${opts.ngoName} has selected ${opts.prisonerName} for "${opts.jobTitle}". Jail staff will coordinate next steps.`,
      relatedEntityType: "JobPosting",
      relatedEntityId: opts.applicationId,
    });
  }
}

export async function notifyHearingScheduled(
  applicationId: string,
  hearingDate: Date,
): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!app) return;
  const pii = piiPublic(app.prisoner);
  if (!pii.nextOfKinPhone) return;

  const dateStr = hearingDate.toLocaleDateString("en-IN", { dateStyle: "long" });
  await logAndSend({
    recipientType: "next_of_kin",
    contact: pii.nextOfKinPhone,
    channel: "sms",
    message: `RIHAI SETU update: a court hearing for ${pii.fullName}'s case is scheduled for ${dateStr}. The court's decision alone determines the outcome.`,
    relatedEntityType: "Application",
    relatedEntityId: app.id,
  });
}

export async function getUserNotifications(userId: string) {
  const [rows, unread] = await Promise.all([
    prisma.notificationLog.findMany({
      where: { recipientUserId: userId },
      orderBy: { sentAt: "desc" },
      take: 50,
    }),
    prisma.notificationLog.count({ where: { recipientUserId: userId, isRead: false } }),
  ]);
  return { rows, unread };
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notificationLog.updateMany({
    where: { id: notificationId, recipientUserId: userId },
    data: { isRead: true },
  });
}


