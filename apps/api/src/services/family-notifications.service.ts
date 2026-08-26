import type { Application, Prisoner } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { notificationProvider } from "../lib/notification-provider.js";
import { piiPublic } from "../lib/pii.js";
import { getPrimaryCase } from "./eligibility.service.js";

/**
 * Prompt 11 — family notifications across the paperwork lifecycle.
 *
 * Event-specific templated messages (never one generic "status changed" text),
 * consent-gated, locale-aware (EN/HI), channel-aware (SMS/WhatsApp with
 * fallback), deduplicated on (application_id, event_key).
 */

export const FAMILY_EVENTS = [
  "application_drafted",
  "application_filed",
  "hearing_scheduled",
  "order_granted_no_bond",
  "order_granted_bond_required",
  "order_denied",
  "surety_arranged",
  "released",
] as const;
export type FamilyEventKey = (typeof FAMILY_EVENTS)[number];

export interface FamilyTemplateVars {
  prisoner_name?: string;
  case_type?: string;
  cnr_number?: string;
  court_name?: string;
  hearing_date?: string;
  bond_amount?: string;
  lawyer_name?: string;
  lawyer_phone?: string;
}

export type FamilySendOutcome =
  | { ok: true; channelUsed: string; locale: string; message: string; providerStatus: string }
  | {
      ok: false;
      reason:
        | "no_consent"
        | "no_contact"
        | "duplicate"
        | "awaiting_lawyer"
        | "no_template"
        | "send_failed";
    };

// ---------------------------------------------------------------------------
// Seeded copy — the substance of Prompt 11. Tone guidance per event:
//   denial = factual, never blame-laden, ALWAYS a named human to call;
//   bond-required = actionable (the #1 real-world delay point);
//   released = warm and short.
// ---------------------------------------------------------------------------

type TemplateSeed = Record<FamilyEventKey, Record<"en" | "hi", string>>;

const TEMPLATE_SEED: TemplateSeed = {
  application_drafted: {
    en: "RIHAI SETU update: {{prisoner_name}}'s release application has been prepared and is under review by the legal aid lawyer. No action is needed from you right now.",
    hi: "रिहाई सेतु सूचना: {{prisoner_name}} के रिहाई आवेदन तैयार कर लिए गए हैं और विधिक सलाहकार की समीक्षा में हैं। अभी आपसे कोई कार्रवाई की आवश्यकता नहीं है।",
  },
  application_filed: {
    en: "RIHAI SETU update: {{prisoner_name}}'s {{case_type}} application has been filed in court (CNR: {{cnr_number}}). You will be informed as soon as a hearing date is set.",
    hi: "रिहाई सेतु सूचना: {{prisoner_name}} का {{case_type}} आवेदन अदालत में दर्ज कर दिया गया है (CNR: {{cnr_number}})। सुनवाई की तारीख तय होते ही सूचित किया जाएगा।",
  },
  hearing_scheduled: {
    en: "RIHAI SETU update: a hearing in {{prisoner_name}}'s case is scheduled for {{hearing_date}} at {{court_name}}.",
    hi: "रिहाई सेतु सूचना: {{prisoner_name}} के मामले की सुनवाई {{hearing_date}} को, {{court_name}} में निर्धारित हुई है।",
  },
  order_granted_no_bond: {
    en: "Good news: the court has granted {{case_type}} for {{prisoner_name}}. Release processing has started - no action is needed from the family.",
    hi: "अच्छी खबर: अदालत ने {{prisoner_name}} का {{case_type}} स्वीकृत कर दिया है। रिहाई की प्रक्रिया शुरू हो गई है - परिवार की ओर से कोई कार्रवाई आवश्यक नहीं है।",
  },
  order_granted_bond_required: {
    en: "Update: the court has granted {{case_type}} for {{prisoner_name}}, but a surety/bond of {{bond_amount}} must be arranged before release. To arrange it, please contact their legal aid lawyer {{lawyer_name}} at {{lawyer_phone}}.",
    hi: "सूचना: अदालत ने {{prisoner_name}} का {{case_type}} स्वीकृत किया है, परंतु रिहाई से पहले {{bond_amount}} की धरौटी/बॉन्ड व्यवस्था आवश्यक है। कृपया उनके विधिक सलाहकार {{lawyer_name}} से {{lawyer_phone}} पर संपर्क करें।",
  },
  order_denied: {
    en: "Update: the court did not grant {{case_type}} for {{prisoner_name}} at this time. Their legal aid lawyer, {{lawyer_name}}, can explain the next steps - you can call {{lawyer_phone}}.",
    hi: "सूचना: अदालत ने इस समय {{prisoner_name}} का {{case_type}} स्वीकृत नहीं किया है। आगे की प्रक्रिया समझने के लिए कृपया उनके विधिक सलाहकार {{lawyer_name}} से {{lawyer_phone}} पर संपर्क करें।",
  },
  surety_arranged: {
    en: "RIHAI SETU update: the surety/bond for {{prisoner_name}} is complete. Release processing is now underway.",
    hi: "रिहाई सेतु सूचना: {{prisoner_name}} की धरौटी/बॉन्ड व्यवस्था पूरी हो गई है। रिहाई की प्रक्रिया अंतिम चरण में है।",
  },
  released: {
    en: "Good news: {{prisoner_name}} was released today. Warm wishes to the whole family - RIHAI SETU.",
    hi: "अच्छी खबर: {{prisoner_name}} आज रिहा हो गए हैं। पूरे परिवार को रिहाई सेतु की ओर से शुभकामनाएं।",
  },
};

/** Idempotent, skip-existing so super_admin template edits survive restarts. */
export async function ensureNotificationTemplates(): Promise<number> {
  let created = 0;
  for (const eventKey of FAMILY_EVENTS) {
    for (const locale of ["en", "hi"] as const) {
      for (const channel of ["sms", "whatsapp"] as const) {
        const existing = await prisma.notificationTemplate.findUnique({
          where: { eventKey_channel_locale: { eventKey, channel, locale } },
        });
        if (existing) continue;
        await prisma.notificationTemplate.create({
          data: { eventKey, channel, locale, messageTemplate: TEMPLATE_SEED[eventKey][locale] },
        });
        created++;
      }
    }
  }
  return created;
}

export function renderTemplate(tpl: string, vars: FamilyTemplateVars): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value !== undefined && value !== "" ? value : "\u2014";
  });
}

// ---------------------------------------------------------------------------
// Trigger entry point
// ---------------------------------------------------------------------------

export async function sendFamilyEvent(
  applicationId: string,
  eventKey: FamilyEventKey,
  extraVars: FamilyTemplateVars = {},
): Promise<FamilySendOutcome> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      prisoner: true,
      legalAidAssignment: { include: { lawyer: { select: { name: true, phone: true } } } },
      suretyStatus: true,
    },
  });
  if (!app) return { ok: false, reason: "no_template" };

  const prisoner = app.prisoner;
  const pii = piiPublic(prisoner);

  // CONSENT GATE — mandatory before anything else. Toggling consent off stops
  // every send for this prisoner immediately, at any stage.
  if (!prisoner.nextOfKinConsentGiven) return { ok: false, reason: "no_consent" };
  const phone = pii.nextOfKinPhone;
  if (!phone) return { ok: false, reason: "no_contact" };

  // A retried webhook / manual re-sync must never re-send the same message.
  const dedupeKey = `${applicationId}:${eventKey}`;
  const alreadySent = await prisma.notificationLog.findFirst({
    where: { dedupeKey, status: { not: "failed" } },
    select: { id: true },
  });
  if (alreadySent) return { ok: false, reason: "duplicate" };

  // Denials go out ONLY once a named human exists to call (Prompt 4 assignment).
  // Delaying briefly to backfill beats sending an unanswerable message.
  if (eventKey === "order_denied") {
    if (!app.legalAidAssignment || !app.legalAidAssignment.lawyer.name) {
      logger.info(`[family] ${dedupeKey} held back - no LegalAidAssignment yet`);
      return { ok: false, reason: "awaiting_lawyer" };
    }
  }

  const vars = await buildVars(app, extraVars);
  const locales = orderedLocales(prisoner.nextOfKinPreferredLocale);
  const channels = orderedChannels(prisoner.nextOfKinPreferredChannel);

  let lastFailure: string | undefined;
  for (const channel of channels) {
    const template = await pickTemplate(eventKey, channel, locales);
    if (!template) continue;
    const message = renderTemplate(template.messageTemplate, vars);

    const result = await notificationProvider.send(phone, channel as "sms" | "whatsapp", message);
    const delivered = result.status === "sent" || result.status === "logged";
    await prisma.notificationLog.create({
      data: {
        recipientType: "next_of_kin",
        recipientContact: phone,
        channel,
        message,
        relatedEntityType: "Application",
        relatedEntityId: applicationId,
        status: result.status,
        templateKey: template.eventKey,
        locale: template.locale,
        channelUsed: channel,
        // Only delivered attempts claim the dedupe key - failures stay retryable.
        dedupeKey: delivered ? dedupeKey : null,
      },
    });
    if (delivered) {
      return {
        ok: true,
        channelUsed: channel,
        locale: template.locale,
        message,
        providerStatus: result.status,
      };
    }
    lastFailure = result.providerError;
    // Preferred channel failed at the API level -> fall back to the other one.
  }

  logger.error(`[family] ${dedupeKey} could not be delivered (${lastFailure ?? "no template"})`);
  return { ok: false, reason: "send_failed" };
}

function orderedLocales(preferred: string | null): ("en" | "hi")[] {
  return preferred === "hi" ? ["hi", "en"] : ["en", "hi"];
}

function orderedChannels(preferred: string | null): ("sms" | "whatsapp")[] {
  return preferred === "whatsapp" ? ["whatsapp", "sms"] : ["sms", "whatsapp"];
}

async function pickTemplate(
  eventKey: FamilyEventKey,
  channel: "sms" | "whatsapp",
  locales: ("en" | "hi")[],
): Promise<{ eventKey: string; locale: string; messageTemplate: string } | null> {
  for (const locale of locales) {
    const exact = await prisma.notificationTemplate.findUnique({
      where: { eventKey_channel_locale: { eventKey, channel, locale } },
    });
    if (exact) return exact;
  }
  // Any locale for this event+channel, so a super_admin deleting one row can't
  // silently kill notifications.
  return prisma.notificationTemplate.findFirst({ where: { eventKey, channel } });
}

async function buildVars(
  app: Application & {
    prisoner: Prisoner;
    legalAidAssignment: { lawyer: { name: string; phone: string | null } } | null;
    suretyStatus: { bondAmount: number | null } | null;
  },
  extraVars: FamilyTemplateVars,
): Promise<FamilyTemplateVars> {
  const pii = piiPublic(app.prisoner);
  const isHi = app.prisoner.nextOfKinPreferredLocale === "hi";

  let cnr: string | undefined;
  let courtName: string | undefined;
  try {
    const primary = await getPrimaryCase(app.prisonerId);
    cnr = primary?.cnrNumber ?? undefined;
    courtName = primary?.courtName ?? undefined;
  } catch {
    // Case lookup is best-effort for message content only.
  }

  const hearingDateStr = app.hearingDate
    ? app.hearingDate.toLocaleDateString(isHi ? "hi-IN" : "en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : undefined;

  const bondAmountStr =
    app.suretyStatus?.bondAmount != null
      ? isHi
        ? `\u20B9${app.suretyStatus.bondAmount.toLocaleString("en-IN")}`
        : `Rs ${app.suretyStatus.bondAmount.toLocaleString("en-IN")}`
      : undefined;

  return {
    prisoner_name: pii.fullName,
    case_type:
      app.type === "personal_bond"
        ? isHi
          ? "\u0928\u093F\u091C\u0940 \u092C\u0949\u0928\u094D\u0921"
          : "personal bond"
        : isHi
          ? "\u091C\u092E\u093E\u0928\u0924"
          : "bail",
    cnr_number: cnr,
    court_name: courtName,
    hearing_date: hearingDateStr,
    bond_amount: bondAmountStr,
    lawyer_name: app.legalAidAssignment?.lawyer.name,
    lawyer_phone: app.legalAidAssignment?.lawyer.phone ?? undefined,
    ...extraVars,
  };
}
