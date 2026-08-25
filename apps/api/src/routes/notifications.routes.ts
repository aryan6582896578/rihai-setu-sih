import { Router } from "express";
import { asyncHandler, ApiError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { getUserNotifications, markNotificationRead } from "../services/notifications.service.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows, unread } = await getUserNotifications(req.user!.id);
    res.json({
      data: rows.map((n) => ({
        id: n.id,
        recipientType: n.recipientType,
        channel: n.channel,
        message: n.message,
        relatedEntityType: n.relatedEntityType,
        relatedEntityId: n.relatedEntityId,
        sentAt: n.sentAt.toISOString(),
        status: n.status,
        isRead: n.isRead,
      })),
      unread,
    });
  }),
);

notificationsRouter.post(
  "/:id/mark-read",
  asyncHandler(async (req, res) => {
    const existing = await prisma.notificationLog.findUnique({
      where: { id: req.params.id },
      select: { recipientUserId: true },
    });
    if (!existing) throw ApiError.notFound("Notification not found");
    if (existing.recipientUserId !== req.user!.id) {
      throw ApiError.forbidden("Not your notification");
    }
    await markNotificationRead(req.params.id!, req.user!.id);
    res.json({ data: { ok: true } });
  }),
);


