import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient, Prisma } from "@prisma/client";
import { evaluateSection479 } from "../apps/api/src/domain/section479.js";
import { piiWriteFragment } from "../apps/api/src/lib/pii.js";

const prisma = new PrismaClient();

// Datasets generated from NCRB Prison Statistics India 2024 (Tables 1.2 / 1.7),
// scaled down 10x with ratios preserved. prison_occupancy equals the row count
// per prison, so live DB counts reproduce the exact overcrowding percentages.
const TRACKING_FILE = "psi2024_overcrowded_jails_scaled.xlsx";
const PASSPORT_FILE = "psi2024_skill_passport_scaled.xlsx";

interface TrackingRow {
  prisoner_id: string;
  case_cnr: string;
  prison_id: string;
  prison_name: string;
  prison_state: string;
  prison_district: string;
  prison_capacity: number;
  prison_occupancy: number;
  occupancy_rate_pct: number;
  gender: string;
  age: number;
  primary_offence_section: string;
  offence_category_name: string;
  max_sentence_months: number | null;
  death_or_life_flag: boolean;
  prior_conviction_flag: boolean;
  pending_case_count: number;
  custody_start_date: string;
  net_custody_days: number;
  statutory_threshold_days: number | null;
  dlsa_unit_id: string;
  pro_bono_lawyer_id: string | null;
  pro_bono_lawyer_name: string | null;
  pro_bono_assigned_date: string | null;
  legal_aid_status: string;
  bail_status: string;
  last_hearing_date: string;
  next_hearing_date: string;
  surety_type: string;
  medical_needs: string;
}

interface PassportRow {
  passport_id: string;
  prisoner_id: string;
  candidate_alias_or_name: string;
  education_baseline: string;
  primary_trade_vocational: string;
  nsqf_level: number;
  certifying_agency: string;
  course_completion_status: string;
  workshop_production_hours: number;
  specific_machinery_skills: string;
  conduct_grade: string;
  soft_skills_completed: string;
  pwa_accumulated_savings_inr: number;
  target_job_domain: string;
  expected_minimum_wage_inr: number;
  preferred_work_districts: string;
  consent_to_share_profile: boolean;
}

function loadSheet(file: string): Record<string, unknown>[] {
  const buf = readFileSync(new URL(`../dataset/${file}`, import.meta.url));
  const wb = XLSX.read(buf, { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function chunked<T>(items: T[], fn: (chunk: T[]) => Promise<unknown>, size = 400) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

async function main() {
  const passwordHash = await bcrypt.hash("Passw0rd!23", 10);

  const tracking = loadSheet(TRACKING_FILE) as unknown as TrackingRow[];
  const passports = loadSheet(PASSPORT_FILE) as unknown as PassportRow[];
  console.log(
    `Dataset loaded: ${tracking.length} undertrials, ${passports.length} skill passports`,
  );

  // ---------- clean slate (FK-safe order; includes NGO pipeline + audit + ingestion) ----------
  await prisma.notificationLog.deleteMany();
  await prisma.stallAlert.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPosting.deleteMany();
  await prisma.legalAidAssignment.deleteMany();
  await prisma.suretyStatus.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.note.deleteMany();
  await prisma.eligibilityAssessment.deleteMany();
  await prisma.application.deleteMany();
  await prisma.caseRecord.deleteMany();
  await prisma.dataRequest.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ingestionRow.deleteMany();
  await prisma.ingestionBatch.deleteMany();
  await prisma.prisoner.deleteMany();
  await prisma.jailAccess.deleteMany();
  await prisma.trainingProgram.deleteMany();
  await prisma.jail.deleteMany();
  await prisma.user.deleteMany();

  // ---------- jails from dataset prisons ----------
  const prisonMap = new Map<string, TrackingRow>();
  const occupancyTarget = new Map<string, number>();
  for (const r of tracking) {
    if (!prisonMap.has(r.prison_id)) prisonMap.set(r.prison_id, r);
    occupancyTarget.set(r.prison_id, Math.max(occupancyTarget.get(r.prison_id) ?? 0, Number(r.prison_occupancy ?? r.prison_capacity ?? 0)));
  }

  const jails: { id: string; code: string; name: string; capacity: number }[] = [];
  let jseq = 1;
  for (const [code, r] of prisonMap) {
    const jail = await prisma.jail.create({
      data: {
        code,
        name: r.prison_name,
        state: r.prison_state,
        district: r.prison_district,
        sanctionedCapacity: r.prison_capacity ?? 500,
        contactPhone: `+91-0${String(100 + jseq++).padStart(8, "0")}`,
      },
    });
    jails.push({ id: jail.id, code: jail.code, name: jail.name, capacity: jail.sanctionedCapacity });
  }
  console.log(`Jails: ${jails.map((j) => `${j.name} (${j.code})`).join(", ")}`);

  // ---------- users ----------
  const superAdmin = await prisma.user.create({
    data: { name: "Ananya Deshpande", email: "superadmin@rihai.gov.in", passwordHash, role: "super_admin", isActive: true },
  });

  const usersByJail = new Map<string, { id: string; role: string }[]>();

  for (let i = 0; i < jails.length; i++) {
    const jail = jails[i];
    const suffix = i + 1;
    const created: { id: string; role: string }[] = [];

    const sup = await prisma.user.create({
      data: {
        name: `Superintendent ${suffix} (${jail.code})`,
        email: `superintendent${suffix}@rihai.gov.in`,
        passwordHash,
        role: "jail_superintendent",
        isActive: true,
      },
    });
    created.push({ id: sup.id, role: "jail_superintendent" });

    for (const s of ["a", "b"]) {
      const st = await prisma.user.create({
        data: {
          name: `Jail Staff ${suffix}${s.toUpperCase()}`,
          email: `staff${suffix}${s}@rihai.gov.in`,
          passwordHash,
          role: "jail_staff",
          isActive: true,
        },
      });
      created.push({ id: st.id, role: "jail_staff" });
    }
    usersByJail.set(jail.id, created);

    await prisma.jailAccess.createMany({
      data: created.map((u) => ({ userId: u.id, jailId: jail.id, roleAtJail: u.role as never })),
    });

    // super admin gets an access row on every jail so no view is scoped away
    await prisma.jailAccess.create({
      data: { userId: superAdmin.id, jailId: jail.id, roleAtJail: "super_admin" },
    });
  }

  const dlsaLawyer = await prisma.user.create({
    data: { name: "Adv. Neha Srivastava", email: "dlsa@rihai.gov.in", passwordHash, role: "dlsa_lawyer", isActive: true },
  });
  for (const jail of jails.slice(0, 2)) {
    await prisma.jailAccess.create({ data: { userId: dlsaLawyer.id, jailId: jail.id, roleAtJail: "dlsa_lawyer" } });
  }

  const auditor = await prisma.user.create({
    data: { name: "Sanjay Rao (Auditor)", email: "viewer@rihai.gov.in", passwordHash, role: "viewer", isActive: true },
  });
  await prisma.jailAccess.create({ data: { userId: auditor.id, jailId: jails[1].id, roleAtJail: "viewer" } });

  // ---------- training programs from passport trades ----------
  const programByKey = new Map<string, string>();
  for (const p of passports) {
    const key = p.primary_trade_vocational?.trim().toLowerCase();
    if (key && !programByKey.has(key)) {
      const created = await prisma.trainingProgram.create({
        data: { name: p.primary_trade_vocational.trim(), category: p.target_job_domain || "General" },
      });
      programByKey.set(key, created.id);
    }
  }
  console.log(`Training programs: ${programByKey.size}`);

  // ---------- prisoners + cases + assessments (bulk, explicit ids) ----------
  const passportByPid = new Map(passports.map((p) => [p.prisoner_id, p]));
  const jailIdByCode = new Map(jails.map((j) => [j.code, j.id]));

  const prisonerValues: Prisma.PrisonerCreateManyInput[] = [];
  const caseValues: Prisma.CaseRecordCreateManyInput[] = [];
  const assessmentValues: Prisma.EligibilityAssessmentCreateManyInput[] = [];
  const applicationValues: Prisma.ApplicationCreateManyInput[] = [];
  const enrollmentValues: Prisma.EnrollmentCreateManyInput[] = [];
  const noteValues: Prisma.NoteCreateManyInput[] = [];

  for (const t of tracking) {
    const jailId = jailIdByCode.get(t.prison_id);
    if (!jailId) continue;

    const staffList = usersByJail.get(jailId)!;
    const passport = passportByPid.get(t.prisoner_id);
    const fullName =
      passport?.candidate_alias_or_name?.trim() ||
      `Undertrial ${t.prisoner_id.slice(-5)}`;
    const age = Number(t.age ?? 30);
    const prisonerId = randomUUID();

    const admission = parseDate(t.custody_start_date) ?? daysAgo(30);

    prisonerValues.push({
      id: prisonerId,
      jailId,
      prisonerRegNo: t.prisoner_id,
      gender: (t.gender ?? "male").toLowerCase(),
      admissionDate: admission,
      createdAt: admission,
      // Tier-1 PII encrypted (Prompt 8); plaintext columns stay NULL.
      ...piiWriteFragment({
        fullName,
        dateOfBirth: new Date(new Date().getFullYear() - age, 0, 15),
      }),
      ...(passport
        ? {
            educationBaseline: passport.education_baseline || null,
            machinerySkills: passport.specific_machinery_skills || null,
            targetDomain: passport.target_job_domain || null,
          }
        : {}),
      consentToShareProfile: !!passport?.consent_to_share_profile,
    });

    const maxYears = t.max_sentence_months == null ? 20 : Math.max(1, Math.round(Number(t.max_sentence_months) / 12));
    const custodyStart = admission;
    const fto = !t.prior_conviction_flag;
    const deathLife = !!t.death_or_life_flag;
    const pending = Number(t.pending_case_count ?? 0);

    caseValues.push({
      id: randomUUID(),
      prisonerId,
      cnrNumber: t.case_cnr || null,
      caseNumber: `CASE/${t.prisoner_id.slice(-8)}`,
      courtName: `District Court (${t.prison_district})`,
      offence: `${t.primary_offence_section}${t.offence_category_name ? ` - ${t.offence_category_name}` : ""}`,
      maxSentenceYears: maxYears,
      carriesDeathOrLife: deathLife,
      isFirstTimeOffender: fto,
      pendingCaseCount: pending,
      custodyStartDate: custodyStart,
      caseStatus: "undertrial",
      updatedAt: parseDate(t.last_hearing_date) ?? custodyStart,
    });

    const result = evaluateSection479({
      custodyStartDate: custodyStart,
      maxSentenceYears: maxYears,
      carriesDeathOrLife: deathLife,
      isFirstTimeOffender: fto,
      pendingCaseCount: pending,
    });
    assessmentValues.push({
      id: randomUUID(),
      prisonerId,
      status: result.status,
      reason: result.reason,
      computedAt: custodyStart,
    });

    // ---------- application from bail_status / hearing dates ----------
    const nextHearing = parseDate(t.next_hearing_date);
    const lastHearing = parseDate(t.last_hearing_date);
    const bailStatus = String(t.bail_status ?? "");

    let stage: string | null = null;
    let filedDate: Date | null = null;
    const hearingDate: Date | null = nextHearing;

    if (bailStatus.toLowerCase().includes("hearing")) {
      stage = "hearing_scheduled";
      filedDate = lastHearing ?? daysAgo(Math.max(21, Number(t.net_custody_days ?? 30)));
    } else if (bailStatus.toLowerCase().includes("file")) {
      stage = "filed";
      filedDate = lastHearing ?? daysAgo(25);
    } else if (result.status === "eligible" && Math.random() < 0.35) {
      stage = Math.random() < 0.5 ? "flagged" : "drafted";
    }

    if (stage) {
      const needsReview = stage !== "flagged";
      const history: Record<string, string> = {};
      history.flagged = (filedDate ?? custodyStart).toISOString();
      if (stage !== "flagged") history.drafted = (lastHearing ?? daysAgo(20)).toISOString();
      if (stage === "filed" || stage === "hearing_scheduled") {
        history.filed = (filedDate ?? daysAgo(18)).toISOString();
      }
      if (stage === "hearing_scheduled") history.hearing_scheduled = (nextHearing ?? daysAgo(10)).toISOString();

      applicationValues.push({
        id: randomUUID(),
        prisonerId,
        type: Math.random() < 0.6 ? "bail" : "personal_bond",
        stage: stage as never,
        generatedDocumentUrl: stage !== "flagged" ? `/uploads/demo/application-${prisonerId.slice(-6)}.html` : null,
        filedDate,
        hearingDate,
        orderOutcome: null,
        reviewedBy: needsReview ? staffList[0].id : null,
        reviewedAt: needsReview ? lastHearing ?? daysAgo(15) : null,
        updatedAt: lastHearing ?? daysAgo(12),
        stageHistory: history as never,
      });
    }

    // ---------- skill passport enrollments ----------
    if (passport) {
      const key = passport.primary_trade_vocational?.trim().toLowerCase();
      const programId = key ? programByKey.get(key) : undefined;
      if (programId) {
        const cs = String(passport.course_completion_status ?? "").toLowerCase();
        const status = cs.includes("certified") ? "completed" : cs.includes("progress") ? "in_progress" : "enrolled";
        const progress =
          status === "completed" ? 100 : status === "in_progress" ? Math.min(95, Math.round(Number(passport.workshop_production_hours ?? 0) / 6)) : 0;
        enrollmentValues.push({
          prisonerId,
          programId,
          status: status as never,
          progressPct: progress,
          certificateUrl: status === "completed" ? `/uploads/certificates/cert-${passport.passport_id}.html` : null,
          completedAt: status === "completed" ? parseDate(t.pro_bono_assigned_date) : null,
        });
      }

      const noteLines = [
        `Education baseline: ${passport.education_baseline}`,
        `Machinery skills: ${passport.specific_machinery_skills}`,
        `Conduct grade: ${passport.conduct_grade}; soft skills: ${passport.soft_skills_completed}`,
        `Target domain: ${passport.target_job_domain} (expected wage INR ${passport.expected_minimum_wage_inr})`,
      ].join("\n");
      noteValues.push({
        prisonerId,
        authorId: staffList[staffList.length - 1].id,
        body: `SKILL PASSPORT ${passport.passport_id}\n${noteLines}`,
      });
    }

    if (String(t.medical_needs ?? "None").toLowerCase() !== "none") {
      noteValues.push({
        prisonerId,
        authorId: staffList[0].id,
        body: `Medical flag: ${t.medical_needs}. Security risk: ${t.security_risk}.`,
      });
    }
  }

  await chunked(prisonerValues, (c) => prisma.prisoner.createMany({ data: c }));
  await chunked(caseValues, (c) => prisma.caseRecord.createMany({ data: c }));
  await chunked(assessmentValues, (c) => prisma.eligibilityAssessment.createMany({ data: c }));
  await chunked(applicationValues, (c) => prisma.application.createMany({ data: c }));
  await chunked(enrollmentValues, (c) => prisma.enrollment.createMany({ data: c }));
  await chunked(noteValues, (c) => prisma.note.createMany({ data: c }));

  // ---------- occupancy snapshots (45 days, ramps up to the dataset occupancy) ----------
  const snapshotValues: Prisma.OccupancySnapshotCreateManyInput[] = [];
  for (const jail of jails) {
    const target = occupancyTarget.get(jail.code) ?? 0;
    const ramp = Math.max(3, Math.ceil(target * 0.05));
    for (let d = 45; d >= 1; d--) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setUTCHours(0, 0, 0, 0);
      const occ = Math.max(1, target - Math.ceil((d / 45) * ramp));
      snapshotValues.push({
        jailId: jail.id,
        date,
        occupancy: occ,
        undertrialCount: Math.round(occ * 0.9),
        convictCount: occ - Math.round(occ * 0.9),
      });
    }
  }
  await chunked(snapshotValues, (c) => prisma.occupancySnapshot.createMany({ data: c }));

  // ---------- prisoner portal demo accounts ----------
  // First prisoner of EVERY jail gets the shared demo PIN (2468) so /portal/login
  // works immediately after seeding. API startup re-asserts the same state.
  const demoPinHash = await bcrypt.hash("2468", 10);
  let kinSeq = 1;
  let demoCount = 0;
  for (const jail of jails) {
    const first = await prisma.prisoner.findFirst({
      where: { jailId: jail.id },
      orderBy: { prisonerRegNo: "asc" },
      select: { id: true },
    });
    if (!first) continue;
    await prisma.prisoner.update({
      where: { id: first.id },
      data: {
        pinHash: demoPinHash,
        pinSetAt: new Date(),
        pinMustChange: false,
        failedPinAttempts: 0,
        lockedUntil: null,
        ...piiWriteFragment({
          nextOfKinName: "Family contact (demo)",
          nextOfKinPhone: `+919876504${String(300 + kinSeq++)}`,
        }),
      },
    });
    demoCount++;
  }

  const counts = {
    jails: await prisma.jail.count(),
    users: await prisma.user.count(),
    prisoners: await prisma.prisoner.count(),
    cases: await prisma.caseRecord.count(),
    applications: await prisma.application.count(),
    assessments: await prisma.eligibilityAssessment.count(),
    enrollments: await prisma.enrollment.count(),
    notes: await prisma.note.count(),
    snapshots: await prisma.occupancySnapshot.count(),
    portalDemoAccounts: demoCount,
    jobPostings: await prisma.jobPosting.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log("Seed complete (PSI-2024 scaled datasets):");
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
