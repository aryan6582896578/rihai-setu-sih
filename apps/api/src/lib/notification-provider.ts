import { logger } from "./logger.js";
import { config } from "../config.js";

export type NotificationChannel = "sms" | "whatsapp" | "in_app";

export interface NotificationSendResult {
  status: "sent" | "failed" | "logged";
  providerError?: string;
}

export interface NotificationProvider {
  send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult>;
}

/**
 * Fallback provider — no external calls, everything lands in NotificationLog via the
 * service layer. This is what runs until Twilio credentials are configured.
 */
export class LoggingNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };
    logger.info(`[notify:${channel}] -> ${to}: ${message.slice(0, 120)}`);
    return { status: "logged" };
  }
}

/**
 * Real Twilio Programmable Messaging (Prompt 11). Uses the REST API directly via
 * fetch — no SDK dependency. Activated automatically when all four TWILIO_* env
 * vars are present (see twilioConfigured()).
 *
 * WhatsApp numbers use the "whatsapp:" address prefix on both To and From;
 * SMS uses bare E.164 numbers.
 */
function formatE164(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return `+${cleaned}`;
}

export class TwilioNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };

    const from =
      channel === "whatsapp"
        ? config.TWILIO_WHATSAPP_FROM
        : config.TWILIO_SMS_FROM;
    if (!from) {
      return { status: "failed", providerError: `No TWILIO_${channel.toUpperCase()}_FROM configured` };
    }

    const rawPhone = to.replace(/^whatsapp:/, "");
    const formatted = formatE164(rawPhone);
    const toAddr = channel === "whatsapp" ? `whatsapp:${formatted}` : formatted;

    const body = new URLSearchParams({ To: toAddr, From: from, Body: message });
    const auth = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString("base64");

    try {
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        },
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        logger.error(`[twilio] send failed (${resp.status}): ${text.slice(0, 300)}`);
        return { status: "failed", providerError: `HTTP ${resp.status}` };
      }
      const json = (await resp.json()) as { sid?: string };
      logger.info(`[twilio:${channel}] queued ${json.sid ?? "?"} -> ${toAddr}`);
      return { status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[twilio] send error: ${msg}`);
      return { status: "failed", providerError: msg };
    }
  }
}

/** All four credentials present => real sends; otherwise the logging fallback. */
export function twilioConfigured(): boolean {
  return Boolean(
    config.TWILIO_ACCOUNT_SID &&
      config.TWILIO_AUTH_TOKEN &&
      (config.TWILIO_SMS_FROM || config.TWILIO_WHATSAPP_FROM),
  );
}

// TODO(SMS): wire Twilio delivery status callbacks (MessageStatus webhook) so a
// failed WhatsApp handoff can trigger the SMS fallback after the fact instead of
// only when the REST call itself errors.

export const notificationProvider: NotificationProvider = twilioConfigured()
  ? new TwilioNotificationProvider()
  : new LoggingNotificationProvider();
