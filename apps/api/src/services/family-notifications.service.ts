import type { Application, Prisoner } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { notificationProvider } from "../lib/notification-provider.js";
import { piiPublic } from "../lib/pii.js";
import { getPrimaryCase } from "./eligibility.service.js";

/**
 * Prompt 11 — family notifications across the paperwork lifecycle, plus
 * employment/training milestones (skill completions, job-pipeline updates).
 *
 * Event-specific templated messages (never one generic "status changed" text),
 * consent-gated, locale-aware (EN/HI), channel-aware (SMS/WhatsApp with
 * fallback), deduplicated on (entity_type, entity_id, event_key).
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
  "skill_course_completed",
  "job_application_shortlisted",
  "job_application_hired",
  "job_application_rejected",
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
  program_name?: string;
  job_title?: string;
  ngo_name?: string;
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
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Legal Aid System\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "⚖️ CASE TYPE: {{case_type}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: The legal aid petition for {{prisoner_name}} has been drafted and submitted to DLSA Advocate {{lawyer_name}} for mandatory review.\n\n" +
        "⚠️ ACTION REQUIRED: No action needed from family at this stage.\n" +
        "🔒 CONFIDENTIALITY NOTICE: Authorized legal update under BNSS §479.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु विधिक सहायता प्रणाली\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "⚖️ मामला प्रकार: {{case_type}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} का रिहाई आवेदन तैयार कर लिया गया है तथा विधिक सलाहकार {{lawyer_name}} की समीक्षा में है।\n\n" +
        "⚠️ चेतावनी / कार्रवाई: अभी आपसे किसी कार्रवाई की आवश्यकता नहीं है।\n" +
        "🔒 गोपनीयता सूचना: बीएनएसएस धारा 479 के तहत आधिकारिक विधिक अपडेट।",
  },
  application_filed: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Judicial Pipeline\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "🏛️ COURT: {{court_name}} (CNR: {{cnr_number}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: The {{case_type}} petition for {{prisoner_name}} has been officially filed in {{court_name}}.\n\n" +
        "⚠️ WARNING / NOTICE: You will receive an immediate notification as soon as the court allocates a hearing date.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु न्यायिक पाइपलाइन\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "🏛️ न्यायालय: {{court_name}} (CNR: {{cnr_number}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} का {{case_type}} याचिका {{court_name}} में दर्ज कर दी गई है।\n\n" +
        "⚠️ सूचना: अदालत द्वारा सुनवाई की तारीख तय होते ही आपको सूचित किया जाएगा।",
  },
  hearing_scheduled: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Court Hearing Tracker\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "🏛️ COURT: {{court_name}}\n" +
        "📅 HEARING DATE: {{hearing_date}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: A formal court hearing for {{prisoner_name}} is scheduled on {{hearing_date}} at {{court_name}}.\n\n" +
        "⚠️ ACTION: You may consult Advocate {{lawyer_name}} at {{lawyer_phone}} for attendance guidance.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु न्यायालय सुनवाई ट्रैकर\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "🏛️ न्यायालय: {{court_name}}\n" +
        "📅 सुनवाई तिथि: {{hearing_date}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} की सुनवाई {{hearing_date}} को {{court_name}} में निर्धारित हुई है।\n\n" +
        "⚠️ कार्रवाई: सहायता हेतु अधिवक्ता {{lawyer_name}} से {{lawyer_phone}} पर संपर्क कर सकते हैं।",
  },
  order_granted_no_bond: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Judicial Release Directorate\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: Exceptional Good News! The court has granted unconditional release/bail for {{prisoner_name}} with no bond required.\n\n" +
        "⚠️ NOTICE: Jail discharge processing has commenced. Family action is not required.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु न्यायिक रिहाई निदेशालय\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: शुभ समाचार! अदालत ने {{prisoner_name}} की बिना किसी जमानत राशि के रिहाई स्वीकृत कर दी है।\n\n" +
        "⚠️ सूचना: रिहाई की अंतिम प्रक्रिया शुरू हो चुकी है।",
  },
  order_granted_bond_required: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Release & Surety Cell\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "💰 REQUIRED SURETY BOND: {{bond_amount}}\n" +
        "📞 LAWYER CONTACT: {{lawyer_name}} ({{lawyer_phone}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: The court has granted bail/release for {{prisoner_name}}, subject to furnishing a surety bond of {{bond_amount}}.\n\n" +
        "⚠️ ACTION REQUIRED URGENTLY: Please immediately contact Legal Aid Advocate {{lawyer_name}} at {{lawyer_phone}} to arrange the bond paperwork.\n" +
        "🔒 CONFIDENTIALITY NOTICE: Do not share bond documents with unauthorized third parties.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु रिहाई व जमानत सेल\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "💰 आवश्यक धरौटी/बॉन्ड: {{bond_amount}}\n" +
        "📞 अधिवक्ता संपर्क: {{lawyer_name}} ({{lawyer_phone}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: अदालत ने {{prisoner_name}} की रिहाई मंजूर कर ली है, परंतु {{bond_amount}} की जमानत राशि/बॉन्ड प्रस्तुत करना आवश्यक है।\n\n" +
        "⚠️ तत्काल कार्रवाई आवश्यक: जमानत दस्तावेज़ पूरा करने हेतु तुरंत अधिवक्ता {{lawyer_name}} से {{lawyer_phone}} पर संपर्क करें।\n" +
        "🔒 गोपनीयता सूचना: अनाधिकृत व्यक्तियों के साथ दस्तावेज़ साझा न करें।",
  },
  order_denied: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Legal Advisory\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "📞 DLSA ADVOCATE: {{lawyer_name}} ({{lawyer_phone}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: The court did not grant the petition for {{prisoner_name}} at this stage.\n\n" +
        "⚠️ ACTION / NEXT STEPS: Contact DLSA Advocate {{lawyer_name}} at {{lawyer_phone}} to discuss appeal options.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु विधिक परामर्श\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "📞 विधिक अधिवक्ता: {{lawyer_name}} ({{lawyer_phone}})\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: अदालत ने इस समय {{prisoner_name}} का आवेदन स्वीकार नहीं किया है।\n\n" +
        "⚠️ कार्रवाई / आगे के चरण: अपील विकल्प हेतु अधिवक्ता {{lawyer_name}} से {{lawyer_phone}} पर बात करें।",
  },
  surety_arranged: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 SENDER: Rihai Setu Release Operations\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: Surety bond verification for {{prisoner_name}} is completed and verified by the court clerk.\n\n" +
        "⚠️ NOTICE: Final release discharge order is being processed by jail authorities.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🔒 प्रेषक: रिहाई सेतु रिहाई संचालन\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} का जमानत बॉन्ड सत्यापित हो चुका है।\n\n" +
        "⚠️ सूचना: अंतिम रिहाई आदेश प्रक्रिया जारी है।",
  },
  released: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🎉 CELEBRATION: {{prisoner_name}} RELEASED TODAY\n" +
        "🔒 SENDER: Rihai Setu Rehabilitation Directorate\n" +
        "👤 RECIPIENT: Family of {{prisoner_name}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: {{prisoner_name}} has officially been released from custody today! Warmest congratulations and best wishes from the entire RIHAI SETU team.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🎉 शुभ संदेश: {{prisoner_name}} आज रिहा हो चुके हैं\n" +
        "🔒 प्रेषक: रिहाई सेतु पुनर्वास निदेशालय\n" +
        "👤 प्राप्तकर्ता: {{prisoner_name}} का परिवार\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} आज अधिकारिक रूप से रिहा हो गए हैं! रिहाई सेतु टीम की ओर से हार्दिक बधाई व शुभकामनाएं।",
  },
  skill_course_completed: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "📜 SKILL PASSPORT CERTIFICATE MILESTONE\n" +
        "👤 PARTICIPANT: {{prisoner_name}}\n" +
        "🎓 PROGRAM: {{program_name}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: {{prisoner_name}} has successfully completed the vocational training program \"{{program_name}}\" and received an authentic QR-verified Skill Passport certificate.\n\n" +
        "⚠️ REHABILITATION IMPACT: This qualification qualifies them for post-release NGO employment placement.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "📜 कौशल पासपोर्ट प्रमाणपत्र उपलब्धि\n" +
        "👤 प्रतिभागी: {{prisoner_name}}\n" +
        "🎓 कार्यक्रम: {{program_name}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} ने व्यावसायिक प्रशिक्षण \"{{program_name}}\" सफलतापूर्वक पूरा कर आधिकारिक QR-सत्यापित प्रमाणपत्र प्राप्त कर लिया है।\n\n" +
        "⚠️ प्रभाव: यह योग्यता उन्हें रिहाई के बाद एनजीओ रोजगार हेतु पात्र बनाती है।",
  },
  job_application_shortlisted: {
    en: "📢 OFFICIAL RIHAI SETU DISPATCH\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "💼 EMPLOYMENT PLACEMENT UPDATE\n" +
        "👤 CANDIDATE: {{prisoner_name}}\n" +
        "🏢 EMPLOYER: {{ngo_name}}\n" +
        "📋 VACANCY: {{job_title}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "MESSAGE: {{prisoner_name}} has been SHORTLISTED by {{ngo_name}} for the position of \"{{job_title}}\".\n\n" +
        "⚠️ NOTICE: Jail rehabilitation officers are coordinating joining terms.",
    hi: "📢 आधिकारिक रिहाई सेतु प्रेषण\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "💼 रोज़गार शॉर्टलिस्ट अपडेट\n" +
        "👤 उम्मीदवार: {{prisoner_name}}\n" +
        "🏢 नियोक्ता: {{ngo_name}}\n" +
        "📋 पद: {{job_title}}\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "संदेश: {{prisoner_name}} को {{ngo_name}} द्वारा \"{{job_title}}\" पद हेतु शॉर्टलिस्ट किया गया है।\n\n" +
        "⚠️ सूचना: जेल पुनर्वास अधिकारी आगे की प्रक्रिया में लगे हैं।",
  },
  job_application_hired: {
    en: "Good news: {{ngo_name}} has selected {{prisoner_name}} for the role \"{{job_title}}\". Jail staff will coordinate the joining formalities. - RIHAI SETU",
    hi: "अच्छी खबर: {{ngo_name}} ने {{prisoner_name}} का चयन \"{{job_title}}\" पद हेतु किया है। शामिल होने की प्रक्रिया हेतु जेल स्टाफ समन्वय करेंगे। - रिहाई सेतु",
  },
  job_application_rejected: {
    en: "RIHAI SETU update: {{prisoner_name}}'s application for \"{{job_title}}\" at {{ngo_name}} did not progress this time. Their profile remains active and more employers will see it - the journey continues.",
    hi: "रिहाई सेतु सूचना: {{prisoner_name}} का आवेदन {{ngo_name}} में \"{{job_title}}\" पद हेतु इस बार आगे नहीं बढ़ा। उनकी प्रोफ़ाइल सक्रिय रहेगी और अधिक नियोक्ता इसे देखेंगे - प्रयास जारी रहेगा।",
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
// Trigger entry points
// ---------------------------------------------------------------------------

/**
 * Generic entry point for any prisoner-scoped family event (skill completions,
 * job-pipeline updates, …). Legal-application events go through sendFamilyEvent
 * below, which additionally enriches messages with case context.
 */
export async function sendPrisonerFamilyEvent(opts: {
  prisonerId: string;
  entityType: string;
  entityId: string;
  eventKey: FamilyEventKey;
  extraVars?: FamilyTemplateVars;
}): Promise<FamilySendOutcome> {
  const prisoner = await prisma.prisoner.findUnique({ where: { id: opts.prisonerId } });
  if (!prisoner) return { ok: false, reason: "no_template" };
  return deliverFamilyEvent(prisoner, {
    entityType: opts.entityType,
    entityId: opts.entityId,
    eventKey: opts.eventKey,
    vars: { prisoner_name: piiPublic(prisoner).fullName ?? undefined, ...(opts.extraVars ?? {}) },
  });
}

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

  // Denials go out ONLY once a named human exists to call (Prompt 4 assignment).
  // Delaying briefly to backfill beats sending an unanswerable message.
  if (eventKey === "order_denied") {
    if (!app.legalAidAssignment || !app.legalAidAssignment.lawyer.name) {
      logger.info(`[family] ${applicationId}:${eventKey} held back - no LegalAidAssignment yet`);
      return { ok: false, reason: "awaiting_lawyer" };
    }
  }

  const vars = await buildApplicationVars(app, extraVars);
  return deliverFamilyEvent(app.prisoner, {
    entityType: "Application",
    entityId: applicationId,
    eventKey,
    vars,
  });
}

async function deliverFamilyEvent(
  prisoner: Prisoner,
  opts: { entityType: string; entityId: string; eventKey: FamilyEventKey; vars: FamilyTemplateVars },
): Promise<FamilySendOutcome> {
  const pii = piiPublic(prisoner);

  // CONSENT GATE — mandatory before anything else. Toggling consent off stops
  // every send for this prisoner immediately, at any stage.
  if (!prisoner.nextOfKinConsentGiven) return { ok: false, reason: "no_consent" };
  const phone = pii.nextOfKinPhone;
  if (!phone) return { ok: false, reason: "no_contact" };

  // A retried webhook / manual re-sync must never re-send the same message.
  // Legacy rows keyed applications as `${entityId}:${eventKey}` — keep that shape
  // for Application so history keeps deduping across deploys.
  const dedupeKey =
    opts.entityType === "Application"
      ? `${opts.entityId}:${opts.eventKey}`
      : `${opts.entityType}:${opts.entityId}:${opts.eventKey}`;
  const alreadySent = await prisma.notificationLog.findFirst({
    where: { dedupeKey, status: { not: "failed" } },
    select: { id: true },
  });
  if (alreadySent) return { ok: false, reason: "duplicate" };

  const locales = orderedLocales(prisoner.nextOfKinPreferredLocale);
  const channels = orderedChannels(prisoner.nextOfKinPreferredChannel);

  let lastFailure: string | undefined;
  for (const channel of channels) {
    const template = await pickTemplate(opts.eventKey, channel, locales);
    if (!template) continue;
    const message = renderTemplate(template.messageTemplate, opts.vars);

    const result = await notificationProvider.send(phone, channel as "sms" | "whatsapp", message);
    const delivered = result.status === "sent" || result.status === "logged";
    await prisma.notificationLog.create({
      data: {
        recipientType: "next_of_kin",
        recipientContact: phone,
        channel,
        message,
        relatedEntityType: opts.entityType,
        relatedEntityId: opts.entityId,
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

async function buildApplicationVars(
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
