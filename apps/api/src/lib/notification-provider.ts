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

/**
 * Fast2SMS Provider — Best Free Trial & Low-Cost SMS provider for Indian Mobile Numbers (+91).
 * Uses Fast2SMS Bulk V2 API.
 */
export class Fast2SMSNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };

    const rawPhone = to.replace(/[^\d]/g, "");
    const numbers = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone;

    if (!config.FAST2SMS_API_KEY) {
      return { status: "failed", providerError: "FAST2SMS_API_KEY is not configured" };
    }

    try {
      const resp = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: config.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "q",
          message: message,
          language: "english",
          flash: 0,
          numbers: numbers,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        logger.error(`[fast2sms] send failed (${resp.status}): ${text.slice(0, 200)}`);
        return { status: "failed", providerError: `Fast2SMS HTTP ${resp.status}` };
      }

      logger.info(`[fast2sms] SMS sent to ${numbers}`);
      return { status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[fast2sms] send error: ${msg}`);
      return { status: "failed", providerError: msg };
    }
  }
}

/**
 * Textlocal Provider — Popular SMS Gateway with free trial credits.
 */
export class TextlocalNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };

    const rawPhone = to.replace(/[^\d]/g, "");
    const number = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone;

    if (!config.TEXTLOCAL_API_KEY) {
      return { status: "failed", providerError: "TEXTLOCAL_API_KEY is not configured" };
    }

    try {
      const params = new URLSearchParams({
        apikey: config.TEXTLOCAL_API_KEY,
        numbers: `91${number}`,
        message: message,
        sender: "TXTLCL",
      });

      const resp = await fetch("https://api.textlocal.in/send/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        logger.error(`[textlocal] send failed (${resp.status}): ${text.slice(0, 200)}`);
        return { status: "failed", providerError: `Textlocal HTTP ${resp.status}` };
      }

      logger.info(`[textlocal] SMS sent to ${number}`);
      return { status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[textlocal] send error: ${msg}`);
      return { status: "failed", providerError: msg };
    }
  }
}

/**
 * Telegram Bot Provider — 100% FREE Unlimited Custom Instant Push Messaging.
 * No DLT, no trial limit, zero cost forever.
 */
export class TelegramNotificationProvider implements NotificationProvider {
  async send(to: string, channel: NotificationChannel, message: string): Promise<NotificationSendResult> {
    if (channel === "in_app") return { status: "logged" };

    const token = config.TELEGRAM_BOT_TOKEN;
    const chatId = config.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return { status: "failed", providerError: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing" };
    }

    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `🔔 *RIHAI SETU Notification*\n\n📱 *Recipient*: ${to}\n\n${message}`,
          parse_mode: "Markdown",
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        logger.error(`[telegram] send failed (${resp.status}): ${text.slice(0, 200)}`);
        return { status: "failed", providerError: `Telegram HTTP ${resp.status}` };
      }

      logger.info(`[telegram] Instant message delivered to chat ${chatId}`);
      return { status: "sent" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[telegram] send error: ${msg}`);
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

function selectProvider(): NotificationProvider {
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    logger.info("[notifications] Using 100% Free Telegram Bot provider");
    return new TelegramNotificationProvider();
  }
  if (config.FAST2SMS_API_KEY) {
    logger.info("[notifications] Using Fast2SMS provider for custom SMS");
    return new Fast2SMSNotificationProvider();
  }
  if (config.TEXTLOCAL_API_KEY) {
    logger.info("[notifications] Using Textlocal provider for custom SMS");
    return new TextlocalNotificationProvider();
  }
  if (twilioConfigured()) {
    logger.info("[notifications] Using Twilio provider");
    return new TwilioNotificationProvider();
  }
  logger.info("[notifications] Using Logging fallback provider");
  return new LoggingNotificationProvider();
}

export const notificationProvider: NotificationProvider = selectProvider();


