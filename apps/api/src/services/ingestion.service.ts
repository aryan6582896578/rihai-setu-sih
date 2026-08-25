import { Prisma } from "@prisma/client";
import { CaseStatus } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { csvToObjects } from "../lib/csv.js";
import { blindIndex, decryptField, piiPublic, piiWriteFragment } from "../lib/pii.js";
import { audit } from "../lib/audit.js";
import { ApiError } from "../middleware/errors.js";
import { recomputeForPrisoner } from "./eligibility.service.js";

const MAX_ROWS = 500;
const FUZZY_ADMISSION_WINDOW_DAYS = 30;

export interface IngestionRowView {
  id: string;
  rowNo: number;
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  validationStatus: string;
  validationErrors: string[];
  conflictType: string | null;
  conflictWith: { id: string; prisonerRegNo: string; fullName: string } | null;
  resolved: boolean;
  resolvedAction: string | null;
}

export interface BatchView {
  id: string;
  jailId: string;
  sourceSystem: string;
  status: string;
  rowCount: number;
  errorCount: number;
  mergedCount: number;
  rejectedCount: number;
  createdAt: string;
  rows?: IngestionRowView[];
}

// ---------- upload / validate / stage ----------

interface MappedPrisoner {
  full_name: string;
  prisoner_reg_no: string;
  date_of_birth: string;
  gender: string;
  admission_date: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  case_number: string;
  court_name?: string;
  cnr_number?: string;
  offence: string;
  max_sentence_years: number;
  carries_death_or_life: boolean;
  is_first_time_offender: boolean;
  pending_case_count: number;
  custody_start_date: string;
  external_ref_id?: string;
}

const REQUIRED = [
  "full_name",
  "prisoner_reg_no",
  "date_of_birth",
  "gender",
  "admission_date",
  "case_number",
  "offence",
];

function parseDateLoose(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toBool(v: string): boolean {
  return ["true", "yes", "y", "1"].includes((v ?? "").trim().toLowerCase());
}

function mapRow(raw: Record<string, string>): MappedPrisoner {
  const num = (v: string | undefined, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : dflt;
  };
  return {
    full_name: raw.full_name ?? "",
    prisoner_reg_no: raw.prisoner_reg_no ?? "",
    date_of_birth: raw.date_of_birth ?? "",
    gender: (raw.gender ?? "").toLowerCase() || "male",
    admission_date: raw.admission_date ?? "",
    ...(raw.next_of_kin_name ? { next_of_kin_name: raw.next_of_kin_name } : {}),
    ...(raw.next_of_kin_phone ? { next_of_kin_phone: raw.next_of_kin_phone } : {}),
    case_number: raw.case_number ?? "",
    ...(raw.court_name ? { court_name: raw.court_name } : {}),
    ...(raw.cnr_number ? { cnr_number: raw.cnr_number } : {}),
    offence: raw.offence ?? "",
    max_sentence_years: num(raw.max_sentence_years, 3),
    carries_death_or_life: toBool(raw.carries_death_or_life ?? ""),
    is_first_time_offender: raw.is_first_time_offender
      ? toBool(raw.is_first_time_offender)
      : true,
    pending_case_count: num(raw.pending_case_count, 0),
    custody_start_date: raw.custody_start_date || raw.admission_date || "",
    ...(raw.external_ref_id ? { external_ref_id: raw.external_ref_id } : {}),
  };
}

function validateMapped(m: MappedPrisoner): string[] {
  const errors: string[] = [];
  for (const f of REQUIRED) {
    if (!String((m as unknown as Record<string, unknown>)[f] ?? "").trim()) {
      errors.push(`missing required field: ${f}`);
    }
  }
  if (m.full_name && m.full_name.length < 2) errors.push("full_name too short");
  if (!parseDateLoose(m.date_of_birth)) errors.push("date_of_birth not a valid date");
  if (!parseDateLoose(m.admission_date)) errors.push("admission_date not a valid date");
  if (!parseDateLoose(m.custody_start_date)) errors.push("custody_start_date not a valid date");
  if (!["male", "female", "other"].includes(m.gender)) errors.push("gender must be male/female/other");
  return errors;
}

async function detectConflicts(
  jailId: string,
  mappedRows: MappedPrisoner[],
): Promise<Map<number, { conflictType: string; conflictWithId: string | null }>> {
  const result = new Map<number, { conflictType: string; conflictWithId: string | null }>();

  // Intra-batch exact duplicates first.
  const seen = new Map<string, number>();
  mappedRows.forEach((m, i) => {
    const key = `${m.prisoner_reg_no.toLowerCase()}`;
    if (seen.has(key)) {
      result.set(i, { conflictType: "exact_dup_in_batch", conflictWithId: null });
    } else {
      seen.set(key, i);
    }
  });

  for (let i = 0; i < mappedRows.length; i++) {
    if (result.has(i)) continue; // already an intra-batch dup
    const m = mappedRows[i]!;

    // Exact key first (deterministic even when several rows share a name).
    const byReg = await prisma.prisoner.findUnique({
      where: { prisonerRegNo: m.prisoner_reg_no },
      select: { id: true, jailId: true },
    });
    if (byReg) {
      if (byReg.jailId === jailId) {
        result.set(i, { conflictType: "exact_dup", conflictWithId: byReg.id });
      }
      continue;
    }

    const existing = await prisma.prisoner.findFirst({
      where: { jailId, nameIdx: blindIndex(m.full_name) ?? "__none__" },
      select: {
        id: true,
        dateOfBirthEnc: true,
        admissionDate: true,
      },
    });
    if (!existing) continue;

    // Fuzzy: same normalized name + same DOB + admission within window -> flag
    // for human review, never auto-merge.
    const dobMatch =
      !!existing.dateOfBirthEnc &&
      decryptField(existing.dateOfBirthEnc)?.slice(0, 10) === normalizeDate(m.date_of_birth);
    const admissionWindow = Math.abs(
      (parseDateLoose(m.admission_date)?.getTime() ?? 0) - existing.admissionDate.getTime(),
    ) <= FUZZY_ADMISSION_WINDOW_DAYS * 86_400_000;
    if (dobMatch && admissionWindow) {
      result.set(i, { conflictType: "fuzzy_dup", conflictWithId: existing.id });
    }
  }
  return result;
}

function normalizeDate(v: string): string | null {
  const d = parseDateLoose(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function createBatchFromCsv(
  jailId: string,
  initiatedBy: string,
  fileName: string,
  csvText: string,
): Promise<BatchView> {
  const { headers, rows } = csvToObjects(csvText);
  if (rows.length === 0) throw ApiError.badRequest("CSV contained no data rows");
  if (rows.length > MAX_ROWS) {
    throw ApiError.badRequest(`CSV exceeds the ${MAX_ROWS}-row demo cap (${rows.length} rows)`);
  }
  const missingCols = REQUIRED.filter((c) => !headers.includes(c));
  if (missingCols.length > 0) {
    throw ApiError.badRequest(`CSV is missing required column(s): ${missingCols.join(", ")}`);
  }

  const batch = await prisma.ingestionBatch.create({
    data: {
      jailId,
      sourceSystem: "csv_upload",
      initiatedBy,
      fileName,
      status: "validating",
      rowCount: rows.length,
    },
  });

  try {
    const mappedRows = rows.map(mapRow);
    const conflicts = await detectConflicts(jailId, mappedRows);

    let errorCount = 0;
    await prisma.$transaction(
      mappedRows.map((m, i) => {
        const errors = validateMapped(m);
        if (errors.length > 0) errorCount++;
        const conflict = conflicts.get(i);
        const warning = errors.length === 0 && !!conflict;
        return prisma.ingestionRow.create({
          data: {
            batchId: batch.id,
            rowNo: i + 1,
            rawData: rows[i] as Prisma.InputJsonValue,
            mappedData: m as unknown as Prisma.InputJsonValue,
            validationStatus: errors.length > 0 ? "error" : warning ? "warning" : "valid",
            validationErrors: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : undefined,
            conflictType: conflict?.conflictType ?? null,
            conflictWithId: conflict?.conflictWithId ?? null,
          },
        });
      }),
    );

    const updated = await prisma.ingestionBatch.update({
      where: { id: batch.id },
      data: { status: "staged", errorCount },
    });
    logger.info(`Ingestion batch staged`, {
      batchId: batch.id,
      rows: rows.length,
      errors: errorCount,
    });
    return batchView(updated.id, true);
  } catch (err) {
    await prisma.ingestionBatch.update({
      where: { id: batch.id },
      data: { status: "failed" },
    });
    throw err;
  }
}

// ---------- views ----------

async function rowViews(batchId: string): Promise<IngestionRowView[]> {
  const rows = await prisma.ingestionRow.findMany({
    where: { batchId },
    orderBy: { rowNo: "asc" },
  });
  const conflictIds = [...new Set(rows.map((r) => r.conflictWithId).filter((x): x is string => !!x))];
  const conflictPrisoners = await prisma.prisoner.findMany({
    where: { id: { in: conflictIds } },
    select: { id: true, prisonerRegNo: true, fullNameEnc: true, fullName: true },
  });
  const byId = new Map(
    conflictPrisoners.map((p) => [p.id, { id: p.id, prisonerRegNo: p.prisonerRegNo, fullName: piiPublic(p).fullName }]),
  );

  return rows.map((r) => ({
    id: r.id,
    rowNo: r.rowNo,
    rawData: r.rawData as Record<string, unknown>,
    mappedData: r.mappedData as Record<string, unknown>,
    validationStatus: r.validationStatus,
    validationErrors: (r.validationErrors as unknown as string[]) ?? [],
    conflictType: r.conflictType,
    conflictWith: r.conflictWithId ? byId.get(r.conflictWithId) ?? null : null,
    resolved: r.resolved,
    resolvedAction: r.resolvedAction,
  }));
}

export async function batchView(batchId: string, withRows = false): Promise<BatchView> {
  const b = await prisma.ingestionBatch.findUnique({ where: { id: batchId } });
  if (!b) throw ApiError.notFound("Ingestion batch not found");
  return {
    id: b.id,
    jailId: b.jailId,
    sourceSystem: b.sourceSystem,
    status: b.status,
    rowCount: b.rowCount,
    errorCount: b.errorCount,
    mergedCount: b.mergedCount,
    rejectedCount: b.rejectedCount,
    createdAt: b.createdAt.toISOString(),
    ...(withRows ? { rows: await rowViews(b.id) } : {}),
  };
}

export async function listBatches(jailId: string | null): Promise<BatchView[]> {
  const batches = await prisma.ingestionBatch.findMany({
    where: jailId ? { jailId } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return batches.map((b) => ({
    id: b.id,
    jailId: b.jailId,
    sourceSystem: b.sourceSystem,
    status: b.status,
    rowCount: b.rowCount,
    errorCount: b.errorCount,
    mergedCount: b.mergedCount,
    rejectedCount: b.rejectedCount,
    createdAt: b.createdAt.toISOString(),
  }));
}

// ---------- resolve / merge ----------

export async function resolveRow(
  batchId: string,
  rowId: string,
  actorId: string,
  input: {
    action: "merge" | "reject" | "attach_case";
    edited?: Partial<MappedPrisoner>;
  },
): Promise<BatchView> {
  const batch = await prisma.ingestionBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw ApiError.notFound("Ingestion batch not found");
  if (batch.status === "merged") throw ApiError.conflict("Batch is already closed");
  const row = await prisma.ingestionRow.findUnique({ where: { id: rowId } });
  if (!row || row.batchId !== batchId) throw ApiError.notFound("Ingestion row not found in this batch");
  if (row.resolved) throw ApiError.conflict("Row already resolved");

  if (input.action === "reject") {
    await prisma.ingestionRow.update({
      where: { id: rowId },
      data: { resolved: true, resolvedAction: "rejected", resolvedBy: actorId, resolvedAt: new Date() },
    });
    await refreshBatchProgress(batchId);
    audit({
      actorId,
      action: "ingestion.row.reject",
      entityType: "IngestionRow",
      entityId: rowId,
      fieldsTouched: ["resolution"],
    });
    return batchView(batchId, false);
  }

  if (row.validationStatus === "error") {
    throw ApiError.conflict("Rows with validation errors cannot be merged — fix at source and re-upload");
  }

  const mapped = (input.edited
    ? { ...(row.mappedData as unknown as MappedPrisoner), ...input.edited }
    : (row.mappedData as unknown as MappedPrisoner));

  if (input.action === "attach_case") {
    // Conflict resolution that NEVER overwrites the verified canonical record:
    // attach the incoming case to the EXISTING prisoner instead.
    if (!row.conflictWithId) throw ApiError.conflict("This row has no conflicting record to attach to");
    const existing = await prisma.prisoner.findUnique({ where: { id: row.conflictWithId } });
    if (!existing) throw ApiError.conflict("Conflicting prisoner no longer exists");
    await createCaseFor(existing.id, mapped, batch.sourceSystem, mapped.external_ref_id ?? row.id);
    await recomputeForPrisoner(existing.id, { force: true, actor: actorId });
    audit({
      actorId,
      action: "ingestion.row.attach_case",
      entityType: "Prisoner",
      entityId: existing.id,
      fieldsTouched: ["case_record.create"],
    });
  } else {
    // Fresh merge into canonical tables with provenance stamped.
    const dup = await prisma.prisoner.findUnique({ where: { prisonerRegNo: mapped.prisoner_reg_no } });
    if (dup) {
      throw ApiError.conflict(
        `prisoner_reg_no ${mapped.prisoner_reg_no} now exists — use attach_case or reject instead`,
      );
    }
    const created = await prisma.prisoner.create({
      data: {
        jailId: batch.jailId,
        prisonerRegNo: mapped.prisoner_reg_no,
        gender: mapped.gender,
        admissionDate: parseDateLoose(mapped.admission_date) ?? new Date(),
        sourceSystem: batch.sourceSystem,
        externalRefId: mapped.external_ref_id ?? row.id,
        ...piiWriteFragment({
          fullName: mapped.full_name,
          dateOfBirth: parseDateLoose(mapped.date_of_birth) ?? undefined,
          nextOfKinName: mapped.next_of_kin_name ?? null,
          nextOfKinPhone: mapped.next_of_kin_phone ?? null,
        }),
      },
    });
    await createCaseFor(created.id, mapped, batch.sourceSystem, mapped.external_ref_id ?? row.id);
    await recomputeForPrisoner(created.id, { force: true, actor: actorId });
    audit({
      actorId,
      action: "ingestion.row.merge",
      entityType: "Prisoner",
      entityId: created.id,
      fieldsTouched: ["full_name", "date_of_birth", "case_record.create"],
    });
  }

  await prisma.ingestionRow.update({
    where: { id: rowId },
    data: {
      resolved: true,
      resolvedAction: input.action === "attach_case" ? "attached_case" : "merged",
      resolvedBy: actorId,
      resolvedAt: new Date(),
      mappedData: mapped as unknown as Prisma.InputJsonValue,
    },
  });
  await refreshBatchProgress(batchId);
  return batchView(batchId, false);
}

async function createCaseFor(
  prisonerId: string,
  m: MappedPrisoner,
  sourceSystem: string,
  externalRefId: string,
): Promise<void> {
  const dupCase = await prisma.caseRecord.findFirst({
    where: { prisonerId, caseNumber: m.case_number },
  });
  if (dupCase) return;
  await prisma.caseRecord.create({
    data: {
      prisonerId,
      cnrNumber: m.cnr_number || null,
      caseNumber: m.case_number,
      courtName: m.court_name || "District Court",
      offence: m.offence,
      maxSentenceYears: m.max_sentence_years,
      carriesDeathOrLife: m.carries_death_or_life,
      isFirstTimeOffender: m.is_first_time_offender,
      pendingCaseCount: m.pending_case_count,
      custodyStartDate: parseDateLoose(m.custody_start_date) ?? new Date(),
      caseStatus: CaseStatus.Undertrial,
      sourceSystem,
      externalRefId,
    },
  });
}

async function refreshBatchProgress(batchId: string): Promise<void> {
  const [total, resolved, merged, rejected] = await Promise.all([
    prisma.ingestionRow.count({ where: { batchId } }),
    prisma.ingestionRow.count({ where: { batchId, resolved: true } }),
    prisma.ingestionRow.count({ where: { batchId, resolvedAction: { in: ["merged", "attached_case"] } } }),
    prisma.ingestionRow.count({ where: { batchId, resolvedAction: "rejected" } }),
  ]);
  const status =
    resolved < total ? "reconciling" : merged > 0 ? "merged" : total > 0 ? "failed" : "failed";
  await prisma.ingestionBatch.update({
    where: { id: batchId },
    data: { status, mergedCount: merged, rejectedCount: rejected },
  });
}
