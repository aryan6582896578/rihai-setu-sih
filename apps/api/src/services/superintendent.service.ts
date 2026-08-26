import crypto from "node:crypto";
import {
  ApplicationStage,
  ApplicationType,
  Role,
  type ApplicationDto,
  type AutoDraftOutcome,
  type EligiblePrisonerRow,
} from "@rihai/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { storage } from "../lib/storage.js";
import { decryptField } from "../lib/pii.js";
import { audit } from "../lib/audit.js";
import { draftGroundsNarrative, type GroundsFacts } from "../lib/llm.js";
import { ApiError } from "../middleware/errors.js";
import { assertJailMembership, type JailMembership } from "../middleware/auth.js";
import { roleIsOneOf, MANAGER_ROLES, ADVANCE_ROLES } from "../middleware/roles.js";
import { normalizeStageHistory } from "./prisoners.service.js";
import { getPrimaryCase, recomputeForPrisoner } from "./eligibility.service.js";
import { toApplicationDto } from "./applications.service.js";

const MS_PER_DAY = 86_400_000;

export async function listEligiblePrisoners(jailId: string): Promise<EligiblePrisonerRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      full_name_enc: string | null;
      full_name: string | null;
      prisoner_reg_no: string;
      case_number: string | null;
      offence: string | null;
      custody_start_date: Date | null;
      elig_reason: string | null;
      max_sentence_years: number | null;
      carries_death_or_life: boolean | null;
      is_first_time_offender: boolean | null;
      pending_case_count: number | null;
    }[]
  >(Prisma.sql`
    SELECT p.id, p.full_name_enc, p.full_name, p.prisoner_reg_no,
           c.case_number, c.offence, c.custody_start_date,
           ea.reason AS elig_reason,
           c.max_sentence_years, c.carries_death_or_life,
           c.is_first_time_offender, c.pending_case_count
    FROM "Prisoner" p
    LEFT JOIN LATERAL (
      SELECT c.* FROM "CaseRecord" c WHERE c.prisoner_id = p.id
      ORDER BY (CASE WHEN c.case_status = 'undertrial' THEN 0 ELSE 1 END), c.updated_at DESC
      LIMIT 1
    ) c ON TRUE
    JOIN LATERAL (
      SELECT e.status, e.reason FROM "EligibilityAssessment" e
      WHERE e.prisoner_id = p.id ORDER BY e.computed_at DESC LIMIT 1
    ) ea ON TRUE
    WHERE p.jail_id = ${jailId}
      AND ea.status = 'eligible'
      AND NOT EXISTS (
        SELECT 1 FROM "Application" a
        WHERE a.prisoner_id = p.id AND a.stage <> 'flagged'
      )
    ORDER BY c.custody_start_date ASC NULLS LAST
  `);

  const now = new Date();
  return rows.map((r) => ({
    prisonerId: r.id,
    fullName: decryptField(r.full_name_enc) ?? r.full_name ?? "",
    prisonerRegNo: r.prisoner_reg_no,
    caseNumber: r.case_number ?? "-",
    offence: r.offence ?? "-",
    custodyDays: r.custody_start_date
      ? Math.floor((now.getTime() - r.custody_start_date.getTime()) / MS_PER_DAY)
      : 0,
    eligibilityReason: r.elig_reason ?? "",
    maxSentenceYears: r.max_sentence_years ?? 0,
    carriesDeathOrLife: r.carries_death_or_life ?? false,
    isFirstTimeOffender: r.is_first_time_offender ?? false,
    pendingCaseCount: r.pending_case_count ?? 0,
  }));
}

async function assignedDlsaLawyerName(jailId: string): Promise<string | null> {
  const access = await prisma.jailAccess.findFirst({
    where: { jailId, roleAtJail: Role.DlsaLawyer },
    include: { user: { select: { name: true } } },
  });
  return access?.user.name ?? null;
}

function buildDocumentHtml(opts: {
  facts: GroundsFacts;
  narrative: string;
  jailName: string;
  district: string;
  state: string;
  dlsaLawyer: string | null;
}): string {
  const f = opts.facts;
  const months = Math.floor(f.custodyDays / 30.4375);
  const days = Math.floor(f.custodyDays - months * 30.4375);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Application under Section 479 BNSS — ${f.prisonerName}</title>
<style>
 body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6;color:#111}
 .banner{background:#fff7ed;border:2px solid #ea580c;color:#9a3412;font-weight:bold;padding:12px 16px;margin-bottom:28px;font-family:Arial,sans-serif}
 h1{font-size:20px;text-align:center;text-decoration:underline}
 .meta{margin:18px 0}
 .narrative{white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:16px;margin:24px 0}
 .sign{margin-top:60px;display:flex;justify-content:space-between}
 .small{color:#475569;font-size:13px}
</style></head>
<body>
 <div class="banner">Lawyer review pending</div>
 <h1>APPLICATION UNDER SECTION 479 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023</h1>
 <div class="meta">
  <p><strong>Applicant:</strong> ${f.prisonerName} (Reg. No. ${f.prisonerRegNo}), presently confined at ${opts.jailName}, ${opts.district}, ${opts.state}.</p>
  <p><strong>Case No.:</strong> ${f.caseNumber} &nbsp;&nbsp; <strong>Court:</strong> ${f.courtName}</p>
  <p><strong>Offence:</strong> ${f.offence} &nbsp;&nbsp; <strong>Maximum sentence:</strong> ${f.maxSentenceYears} year(s)</p>
  <p><strong>Custody undergone:</strong> ${months} month(s) ${days} day(s)</p>
  <p><strong>Nature of application:</strong> ${f.applicationType === "personal_bond" ? "Release on personal bond" : "Regular bail"}${opts.dlsaLawyer ? ` &nbsp;&nbsp; <strong>Legal Aid Counsel:</strong> ${opts.dlsaLawyer}` : ""}</p>
 </div>
 <h1>GROUNDS FOR RELEASE</h1>
 <div class="narrative">${opts.narrative.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>
 <p class="small">Eligibility basis (deterministic rule engine): ${f.eligibilityReason}</p>
 <div class="sign">
   <div>______________________<br/>Applicant / Counsel</div>
   <div>______________________<br/>Jail Superintendent</div>
 </div>
</body></html>`;
}

export async function autoDraftApplication(
  actor: { id: string; role: Role },
  prisonerId: string,
  type: ApplicationType = ApplicationType.Bail,
): Promise<AutoDraftOutcome> {
  try {
    const prisoner = await prisma.prisoner.findUnique({ where: { id: prisonerId } });
    if (!prisoner) throw ApiError.notFound("Prisoner not found");
    const membership: JailMembership = await assertJailMembership(actor, prisoner.jailId);
    if (!roleIsOneOf(membership.roleAtJail, MANAGER_ROLES)) {
      throw ApiError.forbidden("Only superintendents can auto-draft applications");
    }

    const assessment = await recomputeForPrisoner(prisonerId, { force: false, actor: actor.id });
    if (!assessment || assessment.status !== "eligible") {
      throw ApiError.conflict("Only prisoners whose latest eligibility is 'eligible' can be auto-drafted");
    }

    const advanced = await prisma.application.findFirst({
      where: { prisonerId, stage: { not: ApplicationStage.Flagged } },
    });
    if (advanced) {
      throw ApiError.conflict("This prisoner's application has already advanced past the flagged stage");
    }

    const primaryCase = await getPrimaryCase(prisonerId);
    if (!primaryCase) throw ApiError.conflict("Prisoner has no case record");

    const custodyDays = Math.floor(
      (Date.now() - primaryCase.custodyStartDate.getTime()) / MS_PER_DAY,
    );
    // LLM minimization (Prompt 8): only the case facts needed for the narrative
    // are sent — never next-of-kin contact, address, or unrelated history.
    const facts: GroundsFacts = {
      prisonerName: decryptField(prisoner.fullNameEnc) ?? prisoner.fullName ?? "",
      prisonerRegNo: prisoner.prisonerRegNo,
      jailName: membership.jail.name,
      caseNumber: primaryCase.caseNumber,
      courtName: primaryCase.courtName,
      offence: primaryCase.offence,
      maxSentenceYears: primaryCase.maxSentenceYears,
      custodyDays,
      eligibilityReason: assessment.reason,
      applicationType: type === ApplicationType.PersonalBond ? "personal_bond" : "bail",
    };

    const narrative = await draftGroundsNarrative(facts);

    // Audit the LLM call's input/output pairing like any other Tier-1/2 access.
    // Only SHA-256 digests are stored so the log never becomes a secondary PII store.
    audit({
      actorId: actor.id,
      action: "llm.invoke",
      entityType: "Prisoner",
      entityId: prisonerId,
      fieldsTouched: [
        `llm.input_sha256:${crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`,
        `llm.output_sha256:${crypto.createHash("sha256").update(narrative.text).digest("hex").slice(0, 16)}`,
        `llm.source:${narrative.source}`,
      ],
      ipAddress: null,
    });

    let flaggedApp = await prisma.application.findFirst({
      where: { prisonerId, stage: ApplicationStage.Flagged },
    });

    const html = buildDocumentHtml({
      facts,
      narrative: narrative.text,
      jailName: membership.jail.name,
      district: membership.jail.district,
      state: membership.jail.state,
      dlsaLawyer: await assignedDlsaLawyerName(prisoner.jailId),
    });

    const nowIso = new Date().toISOString();
    const actorName =
      (await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name ??
      "Superintendent";

    let application;
    if (flaggedApp) {
      const stored = await storage.save(`documents/application-${flaggedApp.id}.html`, html);
      const existingHistory = normalizeStageHistory(flaggedApp.stageHistory);
      application = await prisma.application.update({
        where: { id: flaggedApp.id },
        data: {
          stage: ApplicationStage.Drafted,
          generatedDocumentUrl: stored.url,
          stageHistory: {
            ...existingHistory,
            [ApplicationStage.Drafted]: {
              at: nowIso,
              byName: actorName,
              note: `Auto-drafted (${narrative.source})`,
            },
          } as unknown as Prisma.InputJsonValue,
        },
        include: { reviewer: { select: { name: true } } },
      });
    } else {
      const storedKey = `documents/application-${prisonerId}-${Date.now()}.html`;
      const stored = await storage.save(storedKey, html);
      application = await prisma.application.create({
        data: {
          prisonerId,
          type,
          stage: ApplicationStage.Drafted,
          generatedDocumentUrl: stored.url,
          stageHistory: {
            [ApplicationStage.Flagged]: { at: nowIso, byName: actorName, note: "Auto-created from eligible list" },
            [ApplicationStage.Drafted]: { at: nowIso, byName: actorName, note: `Auto-drafted (${narrative.source})` },
          } as unknown as Prisma.InputJsonValue,
        },
        include: { reviewer: { select: { name: true } } },
      });
    }

    logger.info(`Auto-drafted application`, {
      prisonerId,
      applicationId: application.id,
      llmSource: narrative.source,
      byUser: actor.id,
    });

    return {
      prisonerId,
      ok: true,
      applicationId: application.id,
      documentUrl: application.generatedDocumentUrl ?? undefined,
      llmSource: narrative.source,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { prisonerId, ok: false, error: err.message };
    }
    logger.error(`Auto-draft failed for prisoner ${prisonerId}`, err);
    return { prisonerId, ok: false, error: "Auto-draft failed unexpectedly" };
  }
}

export async function bulkAutoDraft(
  actor: { id: string; role: Role },
  jailId: string,
  prisonerIds: string[],
  type: ApplicationType,
): Promise<AutoDraftOutcome[]> {
  await assertJailMembership(actor, jailId);
  const outcomes: AutoDraftOutcome[] = [];
  for (const pid of prisonerIds) {
    outcomes.push(await autoDraftApplication(actor, pid, type));
  }
  return outcomes;
}

const SHEET_STAGE_LABELS: Record<string, string> = {
  flagged: "Flagged",
  drafted: "Drafted",
  filed: "Filed in court",
  hearing_scheduled: "Hearing scheduled",
  order_passed: "Order passed",
  released: "Released",
};

export async function renderApplicationStatusSheet(applicationId: string): Promise<string> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      prisoner: { include: { jail: true } },
      reviewer: { select: { name: true } },
    },
  });
  void assertJailMembership;
  const primaryCase = await getPrimaryCase(app.prisonerId);
  const assessment = await prisma.eligibilityAssessment.findFirst({
    where: { prisonerId: app.prisonerId },
    orderBy: { computedAt: "desc" },
  });

  const history = normalizeStageHistory(app.stageHistory);
  const prisonerName = decryptField(app.prisoner.fullNameEnc) ?? app.prisoner.fullName ?? "";
  const currentIdx = stageIndexLocal(app.stage);
  const rows = Object.entries(SHEET_STAGE_LABELS)
    .map(([stage, label], i) => {
      const h = history[stage as ApplicationStage];
      const state =
        i < currentIdx || (h && i === currentIdx) ? "DONE" : i === currentIdx ? "CURRENT" : "PENDING";
      const bg = state === "PENDING" ? "#f1f5f9" : "#ecfdf5";
      return `<tr style="background:${bg}">
        <td><strong>${label}</strong></td>
        <td>${state}</td>
        <td>${h ? new Date(h.at).toLocaleString("en-IN") : "-"}</td>
        <td>${h?.byName ?? "-"}</td>
        <td>${h?.note ?? "-"}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Application status sheet - ${prisonerName}</title>
<style>
 body{font-family:'Segoe UI',Arial,sans-serif;max-width:860px;margin:32px auto;padding:0 24px;color:#0f172a}
 .banner{background:#fff7ed;border:2px solid #ea580c;color:#9a3412;font-weight:bold;padding:10px 14px;margin-bottom:20px}
 h1{font-size:19px} table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
 th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left;vertical-align:top}
 th{background:#f8fafc;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#475569}
 .meta p{margin:4px 0} a{color:#1d4ed8}
</style></head><body>
 <div class="banner">Lawyer review pending</div>
 <h1>APPLICATION STATUS SHEET &mdash; TASK PREVIEW</h1>
 <div class="meta">
  <p><strong>Applicant:</strong> ${prisonerName} (${app.prisoner.prisonerRegNo})</p>
  <p><strong>Jail:</strong> ${app.prisoner.jail.name}, ${app.prisoner.jail.district}</p>
  ${primaryCase ? `<p><strong>Case:</strong> ${primaryCase.caseNumber} &mdash; ${primaryCase.offence} &mdash; ${primaryCase.courtName}</p>` : ""}
  <p><strong>Application type:</strong> ${app.type === "personal_bond" ? "Personal bond" : "Regular bail"}</p>
  <p><strong>Current stage:</strong> ${SHEET_STAGE_LABELS[app.stage] ?? app.stage}</p>
  <p><strong>Eligibility basis:</strong> ${assessment ? `${assessment.status} &mdash; ${assessment.reason}` : "not assessed"}</p>
  <p><strong>Review:</strong> ${app.reviewer ? `Reviewed by ${app.reviewer.name} on ${new Date(app.reviewedAt!).toLocaleDateString("en-IN")}` : "Not yet reviewed"}</p>
 </div>
 <h1 style="font-size:15px">STAGE HISTORY</h1>
 <table>
  <tr><th>Stage</th><th>State</th><th>Date &amp; time</th><th>Acted by</th><th>Note</th></tr>
  ${rows}
 </table>
 ${app.generatedDocumentUrl ? `<p><a href="${app.generatedDocumentUrl}" target="_blank">Open the formal draft document &rarr;</a></p>` : "<p><em>No formal draft document has been generated yet.</em></p>"}
</body></html>`;
}

function stageIndexLocal(stage: string): number {
  const ORDER = ["flagged", "drafted", "filed", "hearing_scheduled", "order_passed", "released"];
  return ORDER.indexOf(stage);
}

/**
 * Create the formal bail / personal-bond DRAFT document for an existing
 * application (flagged or drafted). Deliberately open to every advancing
 * role — jail staff, superintendents and DLSA lawyers — because drafting is
 * clerical work. FILING is the gated step and additionally requires lawyer
 * review (see advanceStage in applications.service).
 */
export async function generateFormalDraftForApplication(
  actor: { id: string; role: Role },
  applicationId: string,
): Promise<ApplicationDto> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { prisoner: true },
  });
  if (!app) throw ApiError.notFound("Application not found");

  const membership: JailMembership = await assertJailMembership(actor, app.prisoner.jailId);
  if (!roleIsOneOf(membership.roleAtJail, ADVANCE_ROLES)) {
    throw ApiError.forbidden("Your role cannot generate application drafts");
  }
  if (stageIndexLocal(app.stage) > stageIndexLocal(ApplicationStage.Drafted)) {
    throw ApiError.conflict(
      `Drafts can only be generated before filing (current: ${SHEET_STAGE_LABELS[app.stage] ?? app.stage})`,
    );
  }
  // Idempotent: regenerating would overwrite an approved artefact.
  if (app.generatedDocumentUrl) {
    return toApplicationDto({ ...app, reviewer: null });
  }

  const primaryCase = await getPrimaryCase(app.prisonerId);
  if (!primaryCase) throw ApiError.conflict("Prisoner has no case record");

  const assessment = await prisma.eligibilityAssessment.findFirst({
    where: { prisonerId: app.prisonerId },
    orderBy: { computedAt: "desc" },
  });

  const custodyDays = Math.floor(
    (Date.now() - primaryCase.custodyStartDate.getTime()) / MS_PER_DAY,
  );
  const facts: GroundsFacts = {
    prisonerName: decryptField(app.prisoner.fullNameEnc) ?? app.prisoner.fullName ?? "",
    prisonerRegNo: app.prisoner.prisonerRegNo,
    jailName: membership.jail.name,
    caseNumber: primaryCase.caseNumber,
    courtName: primaryCase.courtName,
    offence: primaryCase.offence,
    maxSentenceYears: primaryCase.maxSentenceYears,
    custodyDays,
    eligibilityReason: assessment?.reason ?? "Pending assessment",
    applicationType: app.type === "personal_bond" ? "personal_bond" : "bail",
  };

  const narrative = await draftGroundsNarrative(facts);
  const html = buildDocumentHtml({
    facts,
    narrative: narrative.text,
    jailName: membership.jail.name,
    district: membership.jail.district,
    state: membership.jail.state,
    dlsaLawyer: await assignedDlsaLawyerName(app.prisoner.jailId),
  });

  const stored = await storage.save(`documents/application-${app.id}.html`, html);

  const byName =
    (await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name ??
    "Staff";
  const history = normalizeStageHistory(app.stageHistory);
  const promoteToDrafted = app.stage === ApplicationStage.Flagged;
  if (promoteToDrafted) history[ApplicationStage.Drafted] = {
    at: new Date().toISOString(),
    byName,
    note: `Formal draft generated (${narrative.source})`,
  };

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: {
      generatedDocumentUrl: stored.url,
      ...(promoteToDrafted ? { stage: ApplicationStage.Drafted } : {}),
      stageHistory: history as unknown as Prisma.InputJsonValue,
    },
    include: { reviewer: { select: { name: true } } },
  });

  logger.info(`Formal draft generated`, {
    applicationId: app.id,
    llmSource: narrative.source,
    byUser: actor.id,
  });
  return toApplicationDto(updated);
}
