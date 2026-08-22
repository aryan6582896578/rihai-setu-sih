import "dotenv/config";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { evaluateSection479 } from "../apps/api/src/domain/section479.js";

const prisma = new PrismaClient();

interface TrackingRow {
  prisoner_id: string;
  case_cnr: string;
  prison_id: string;
  prison_name: string;
  prison_state: string;
  prison_district: string;
  prison_capacity: number;
  gender: string;
  age: number;
  primary_offence_section: string;
  offence_category_name: string;
  max_sentence_months: number;
  death_or_life_flag: boolean;
  prior_conviction_flag: boolean;
  pending_case_count: number;
  custody_start_date: string;
  net_custody_days: number;
  statutory_threshold_days: number;
  dlsa_unit_id: string;
  pro_bono_lawyer_id: string;
  pro_bono_lawyer_name: string;
  pro_bono_assigned_date: string;
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

async function main() {
  const passwordHash = await bcrypt.hash("Passw0rd!23", 10);

  const tracking = loadSheet("undertrial_prisoner_tracking_600_ncrb.xlsx") as unknown as TrackingRow[];
  const passports = loadSheet("prisoner_skill_passport_rehab_600_ncrb.xlsx") as unknown as PassportRow[];
  console.log(`Dataset loaded: ${tracking.length} undertrials, ${passports.length} skill passports`);

  // clean slate
  await prisma.notificationLog.deleteMany();
  await prisma.occupancySnapshot.deleteMany();
  await prisma.stallAlert.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.note.deleteMany();
  await prisma.eligibilityAssessment.deleteMany();
  await prisma.application.deleteMany();
  await prisma.caseRecord.deleteMany();
  await prisma.prisoner.deleteMany();
  await prisma.jailAccess.deleteMany();
  await prisma.trainingProgram.deleteMany();
  await prisma.jail.deleteMany();
  await prisma.user.deleteMany();

  // ---------- jails from dataset prisons ----------
  const prisonMap = new Map<string, TrackingRow>();
  for (const r of tracking) {
    if (!prisonMap.has(r.prison_id)) prisonMap.set(r.prison_id, r);
  }

  const jails: { id: string; code: string; name: string; capacity: number }[] = [];
  for (const [code, r] of prisonMap) {
    const jail = await prisma.jail.create({
      data: {
        code,
        name: r.prison_name,
        state: r.prison_state,
        district: r.prison_district,
        sanctionedCapacity: r.prison_capacity ?? 500,
        contactPhone: "+91-000-0000000",
      },
    });
    jails.push({ id: jail.id, code: jail.code, name: jail.name, capacity: jail.sanctionedCapacity });
  }
  console.log(`Jails: ${jails.length}`);

  // ---------- users ----------
  await prisma.user.create({
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

    for (const u of created) {
      await prisma.jailAccess.create({
        data: { userId: u.id, jailId: jail.id, roleAtJail: u.role as never },
      });
    }

    // super admin also gets an access row on the first jail for convenience
    if (i === 0) {
      const sa = await prisma.user.findUniqueOrThrow({ where: { email: "superadmin@rihai.gov.in" } });
      await prisma.jailAccess.create({ data: { userId: sa.id, jailId: jail.id, roleAtJail: "super_admin" } });
    }
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
    void p.certifying_agency;
  }
  const programList = await prisma.trainingProgram.findMany();
  console.log(`Training programs: ${programList.length}`);

  // ---------- prisoners + cases + assessments ----------
  const passportByPid = new Map(passports.map((p) => [p.prisoner_id, p]));
  const jailIdByCode = new Map(jails.map((j) => [j.code, j.id]));

  let createdPrisoners = 0;
  let createdCases = 0;

  for (const t of tracking) {
    const jailId = jailIdByCode.get(t.prison_id);
    if (!jailId) continue;

    const passport = passportByPid.get(t.prisoner_id);
    const fullName =
      passport?.candidate_alias_or_name?.trim() ||
      `Undertrial ${t.prisoner_id.slice(-4)}`;
    const age = Number(t.age ?? 30);

    const prisoner = await prisma.prisoner.create({
      data: {
        jailId,
        fullName,
        prisonerRegNo: t.prisoner_id,
        dateOfBirth: new Date(new Date().getFullYear() - age, 0, 15),
        gender: (t.gender ?? "male").toLowerCase(),
        admissionDate: parseDate(t.custody_start_date) ?? daysAgo(30),
        createdAt: parseDate(t.custody_start_date) ?? daysAgo(30),
      },
    });

    const maxYears = Math.max(1, Math.round(Number(t.max_sentence_months ?? 36) / 12));
    const custodyStart = parseDate(t.custody_start_date) ?? daysAgo(60);
    const fto = !t.prior_conviction_flag;
    const deathLife = !!t.death_or_life_flag;
    const pending = Number(t.pending_case_count ?? 0);

    await prisma.caseRecord.create({
      data: {
        prisonerId: prisoner.id,
        cnrNumber: t.case_cnr || null,
        caseNumber: `CASE/${String(t.prisoner_id).slice(-6)}`,
        courtName: `District Court (${t.prison_district})`,
        offence: `${t.primary_offence_section}${t.offence_category_name ? ` - ${t.offence_category_name}` : ""}`,
        maxSentenceYears: maxYears,
        carriesDeathOrLife: deathLife,
        isFirstTimeOffender: fto,
        pendingCaseCount: pending,
        custodyStartDate: custodyStart,
        caseStatus: "undertrial",
        updatedAt: parseDate(t.last_hearing_date) ?? custodyStart,
      },
    });

    const result = evaluateSection479({
      custodyStartDate: custodyStart,
      maxSentenceYears: maxYears,
      carriesDeathOrLife: deathLife,
      isFirstTimeOffender: fto,
      pendingCaseCount: pending,
    });
    await prisma.eligibilityAssessment.create({
      data: {
        prisonerId: prisoner.id,
        status: result.status,
        reason: result.reason,
        computedAt: custodyStart,
      },
    });

    // ---------- application from bail_status / hearing dates ----------
    const nextHearing = parseDate(t.next_hearing_date);
    const lastHearing = parseDate(t.last_hearing_date);
    const bailStatus = String(t.bail_status ?? "");

    let stage: string | null = null;
    let filedDate: Date | null = null;
    let hearingDate: Date | null = nextHearing;

    if (bailStatus.toLowerCase().includes("hearing")) {
      stage = "hearing_scheduled";
      filedDate = lastHearing ?? daysAgo(Math.max(21, Number(t.net_custody_days ?? 30)));
    } else if (bailStatus.toLowerCase().includes("file")) {
      stage = "filed";
      filedDate = lastHearing ?? daysAgo(25);
    } else if (result.status === "eligible" && rand() < 0.35) {
      stage = rand() < 0.5 ? "flagged" : "drafted";
    }

    if (stage) {
      const staffList = usersByJail.get(jailId)!;
      const reviewer = staffList[0];
      const needsReview = stage !== "flagged";
      const history: Record<string, string> = {};
      history.flagged = (filedDate ?? custodyStart).toISOString();
      if (stage !== "flagged") history.drafted = (lastHearing ?? daysAgo(20)).toISOString();
      if (stage === "filed" || stage === "hearing_scheduled") {
        history.filed = (filedDate ?? daysAgo(18)).toISOString();
      }
      if (stage === "hearing_scheduled") history.hearing_scheduled = (nextHearing ?? daysAgo(10)).toISOString();

      await prisma.application.create({
        data: {
          prisonerId: prisoner.id,
          type: Math.random() < 0.6 ? "bail" : "personal_bond",
          stage: stage as never,
          generatedDocumentUrl:
            stage !== "flagged" ? `/uploads/demo/application-${prisoner.id.slice(-6)}.html` : null,
          filedDate,
          hearingDate,
          orderOutcome: null,
          reviewedBy: needsReview ? reviewer.id : null,
          reviewedAt: needsReview ? lastHearing ?? daysAgo(15) : null,
          updatedAt: lastHearing ?? daysAgo(12),
          stageHistory: history as never,
        },
      });
    }

    // ---------- skill passport enrollments ----------
    if (passport) {
      const key = passport.primary_trade_vocational?.trim().toLowerCase();
      const programId = key ? programByKey.get(key) : undefined;
      if (programId) {
        const cs = String(passport.course_completion_status ?? "").toLowerCase();
        const status = cs.includes("complet") ? "completed" : cs.includes("progress") || cs.includes("ongoing") ? "in_progress" : "enrolled";
        const progress = status === "completed" ? 100 : status === "in_progress" ? Math.min(95, Math.round(Number(passport.workshop_production_hours ?? 0) / 8)) : 0;
        await prisma.enrollment.create({
          data: {
            prisonerId: prisoner.id,
            programId,
            status: status as never,
            progressPct: progress,
            certificateUrl: status === "completed" ? `/uploads/certificates/cert-${passport.passport_id}.html` : null,
            completedAt: status === "completed" ? parseDate(t.pro_bono_assigned_date) : null,
          },
        });
      }

      const noteLines = [
        `Education baseline: ${passport.education_baseline}`,
        `Machinery skills: ${passport.specific_machinery_skills}`,
        `Conduct grade: ${passport.conduct_grade}; soft skills: ${passport.soft_skills_completed}`,
        `Target domain: ${passport.target_job_domain} (expected wage INR ${passport.expected_minimum_wage_inr})`,
      ].join("\n");
      const staffList = usersByJail.get(jailId)!;
      await prisma.note.create({
        data: {
          prisonerId: prisoner.id,
          authorId: staffList[staffList.length - 1].id,
          body: `SKILL PASSPORT ${passport.passport_id}\n${noteLines}`,
        },
      });
    }

    if (String(t.medical_needs ?? "None").toLowerCase() !== "none") {
      const staffList = usersByJail.get(jailId)!;
      await prisma.note.create({
        data: {
          prisonerId: prisoner.id,
          authorId: staffList[0].id,
          body: `Medical flag: ${t.medical_needs}. Security risk: ${t.security_risk}.`,
        },
      });
    }

    createdPrisoners++;
    createdCases++;
  }

  function rand(): number {
    return Math.random();
  }

  // ---------- occupancy snapshots (45 days) ----------
  for (const jail of jails) {
    const current = await prisma.prisoner.count({ where: { jailId: jail.id } });
    for (let d = 45; d >= 1; d--) {
      const date = new Date(Date.now() - d * 86_400_000);
      date.setUTCHours(0, 0, 0, 0);
      const occ = Math.max(1, current - Math.ceil((d / 45) * 3));
      await prisma.occupancySnapshot.upsert({
        where: { jailId_date: { jailId: jail.id, date } },
        update: {},
        create: {
          jailId: jail.id,
          date,
          occupancy: Math.min(occ, jail.capacity),
          undertrialCount: Math.round(occ * 0.75),
          convictCount: Math.max(0, occ - Math.round(occ * 0.75)),
        },
      });
    }
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
  };

  console.log("Seed complete (dataset-driven):");
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


