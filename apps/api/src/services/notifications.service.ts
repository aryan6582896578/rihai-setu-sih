import { ApplicationStage, Role } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { notificationProvider } from "../lib/notification-provider.js";

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

  const stageText = newStage.replaceAll("_", " ");
  const kinMessage = `RIHAI SETU update: the legal case of ${app.prisoner.fullName} (Reg ${app.prisoner.prisonerRegNo}) has moved to stage "${stageText}". This is an automated status message; the court makes all decisions.`;

  await logAndSend({
    recipientType: "next_of_kin",
    contact: app.prisoner.nextOfKinPhone ?? null,
    channel: "sms",
    message: kinMessage,
    relatedEntityType: "Application",
    relatedEntityId: app.id,
  });

  if (app.legalAidAssignment) {
    await logAndSend({
      recipientType: "dlsa_lawyer",
      userId: app.legalAidAssignment.lawyerId,
      channel: "in_app",
      message: `Application for ${app.prisoner.fullName} (${primaryCaseNumber(app.prisonerId)}) advanced to "${stageText}".`,
      relatedEntityType: "Application",
      relatedEntityId: app.id,
    });
  }
}

function primaryCaseNumber(prisonerId: string): string {
  void prisonerId;
  return "case on file";
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
      message: `STALL ESCALATED — ${detail}. Please review and act.`,
      relatedEntityType: "Application",
      relatedEntityId: applicationId,
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
  if (!app || !app.prisoner.nextOfKinPhone) return;

  const dateStr = hearingDate.toLocaleDateString("en-IN", { dateStyle: "long" });
  await logAndSend({
    recipientType: "next_of_kin",
    contact: app.prisoner.nextOfKinPhone,
    channel: "sms",
    message: `RIHAI SETU update: a court hearing for ${app.prisoner.fullName}'s case is scheduled for ${dateStr}. The court's decision alone determines the outcome.`,
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


