import { logger } from "./logger.js";

export type NotificationChannel = "sms" | "whatsapp" | "in_app";

export interface NotificationSendResult {
  status: "sent" | "failed" | "logged";
}

export interface NotificationProvider {
  send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult>;
}

/**
 * Fallback provider — no external calls, everything lands in NotificationLog via the
 * service layer. This is what runs unless a real SMS/WhatsApp account is configured.
 *
 * TODO(SMS): implement `TwilioNotificationProvider` against the Twilio REST API
 * (same interface) and select it here when TWILIO_* env vars are present.
 */
export class LoggingNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };
    logger.info(`[notify:${channel}] -> ${to}: ${message.slice(0, 120)}`);
    return { status: "logged" };
  }
}

// TODO(SMS): export class TwilioNotificationProvider implements NotificationProvider { ... }

export const notificationProvider: NotificationProvider = new LoggingNotificationProvider();
