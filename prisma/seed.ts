import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { evaluateSection479 } from "../apps/api/src/domain/section479.js";

const prisma = new PrismaClient();

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(479);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const intBetween = (min, max) => min + Math.floor(rand() * (max - min + 1));
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);

async function main() {
  const passwordHash = await bcrypt.hash("Passw0rd!23", 10);

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

  const jailsData = [
    { name: "Central Correctional Facility", state: "Uttar Pradesh", district: "Rampur", code: "UP-CF-RMP", sanctionedCapacity: 14, address: "NH-24 Bypass Road, Rampur", contactPhone: "+91-595-2341001" },
    { name: "District Holding Home", state: "Maharashtra", district: "Solapur", code: "MH-DH-SLP", sanctionedCapacity: 9, address: "Station Road, Solapur", contactPhone: "+91-217-2622002" },
    { name: "Special Sub-Jail", state: "Karnataka", district: "Kolar", code: "KA-SJ-KLR", sanctionedCapacity: 12, address: "M.G. Road, Kolar", contactPhone: "+91-8152-220003" },
    { name: "Open Correctional Camp", state: "Chhattisgarh", district: "Bilaspur", code: "CG-OC-BSP", sanctionedCapacity: 7, address: "Sirgitti Industrial Area, Bilaspur", contactPhone: "+91-788-2240004" },
    { name: "Women's Correctional Home", state: "Assam", district: "Nagaon", code: "AS-WC-NGN", sanctionedCapacity: 8, address: "Haibargaon, Nagaon", contactPhone: "+91-3672-250005" },
  ];

  const jails = [];
  for (const j of jailsData) {
    jails.push(await prisma.jail.create({ data: j }));
  }

  const superAdmin = await prisma.user.create({
    data: { name: "Ananya Deshpande", email: "superadmin@rihai.gov.in", passwordHash, role: "super_admin", isActive: true },
  });

  const usersByJail = new Map();

  for (const [i, jail] of jails.entries()) {
    const suffix = i + 1;
    const superintendent = await prisma.user.create({
      data: {
        name: `${pick(["Rajesh","Sunita","Vikram","Meena","Arjun"])} ${pick(["Kulkarni","Yadav","Sharma","Bora","Reddy"])}`,
        email: `superintendent${suffix}@rihai.gov.in`,
        passwordHash,
        role: "jail_superintendent",
        isActive: true,
      },
    });
    const staff1 = await prisma.user.create({
      data: {
        name: `${pick(["Priya","Amit","Farhan","Lakshmi","Devendra"])} ${pick(["Nair","Gupta","Khan","Devi","Patel"])}`,
        email: `staff${suffix}@rihai.gov.in`,
        passwordHash,
        role: "jail_staff",
        isActive: true,
      },
    });
    const staff2 = await prisma.user.create({
      data: {
        name: `${pick(["Kiran","Mohit","Zoya","Ramesh"])} ${pick(["Joshi","Verma","Ali","Das"])}`,
        email: `staff${suffix}b@rihai.gov.in`,
        passwordHash,
        role: "jail_staff",
        isActive: i !== 3,
      },
    });
    for (const [u, r] of [[superintendent, "jail_superintendent"], [staff1, "jail_staff"], [staff2, "jail_staff"]]) {
      await prisma.jailAccess.create({ data: { userId: u.id, jailId: jail.id, roleAtJail: r } });
    }
    usersByJail.set(jail.id, [superintendent, staff1, staff2]);
  }

  const dlsaLawyer = await prisma.user.create({
    data: { name: "Adv. Neha Srivastava", email: "dlsa@rihai.gov.in", passwordHash, role: "dlsa_lawyer", isActive: true },
  });
  await prisma.jailAccess.create({ data: { userId: dlsaLawyer.id, jailId: jails[0].id, roleAtJail: "dlsa_lawyer" } });
  await prisma.jailAccess.create({ data: { userId: dlsaLawyer.id, jailId: jails[2].id, roleAtJail: "dlsa_lawyer" } });

  const auditor = await prisma.user.create({
    data: { name: "Sanjay Rao (Auditor)", email: "viewer@rihai.gov.in", passwordHash, role: "viewer", isActive: true },
  });
  await prisma.jailAccess.create({ data: { userId: auditor.id, jailId: jails[1].id, roleAtJail: "viewer" } });

  await prisma.jailAccess.create({
    data: { userId: superAdmin.id, jailId: jails[0].id, roleAtJail: "super_admin" },
  });

  const offences = [
    { offence: "Theft (IPC 379)", maxSentenceYears: 3, carriesDeathOrLife: false },
    { offence: "Cheating (IPC 420)", maxSentenceYears: 7, carriesDeathOrLife: false },
    { offence: "Causing hurt (IPC 323)", maxSentenceYears: 1, carriesDeathOrLife: false },
    { offence: "Criminal breach of trust (IPC 406)", maxSentenceYears: 7, carriesDeathOrLife: false },
    { offence: "Attempt to murder (IPC 307)", maxSentenceYears: 10, carriesDeathOrLife: false },
    { offence: "Murder (IPC 302)", maxSentenceYears: 20, carriesDeathOrLife: true },
    { offence: "NDPS possession (small quantity)", maxSentenceYears: 1, carriesDeathOrLife: false },
    { offence: "Dowry harassment (IPC 498A)", maxSentenceYears: 3, carriesDeathOrLife: false },
  ];

  const firstNames = ["Ramesh","Suresh","Imran","Deepak","Manoj","Pooja","Rekha","Santosh","Ganesh","Vinod","Ashok","Kavita","Rahul","Sanjay","Meena","Bhola","Chandan","Dinesh","Eshwar","Fatima"];
  const lastNames = ["Kumar","Singh","Sharma","Patel","Yadav","Das","Mahto","Prasad","Lodhi","Sahu","Behera","Naik","Mirza","Chauhan"];

  const stagePlan = [
    { stage: "flagged", count: 5 },
    { stage: "drafted", count: 5 },
    { stage: "filed", count: 5 },
    { stage: "hearing_scheduled", count: 5 },
    { stage: "order_passed", count: 3 },
    { stage: "released", count: 3 },
  ];
  const thresholds = { flagged: 3, drafted: 5, filed: 10, hearing_scheduled: 14, order_passed: 3 };

  let prisonerSeq = 1;
  let cnrSeq = 1001;

  for (const [ji, jail] of jails.entries()) {
    const prisonerCount = ji === 0 ? 10 : ji === 1 ? 8 : ji === 2 ? 9 : ji === 3 ? 7 : 8;
    for (let k = 0; k < prisonerCount; k++) {
      const gender = jail.code === "AS-WC-NGN" ? "female" : rand() < 0.82 ? "male" : "female";
      const fullName = `${gender === "female" ? pick(["Pooja","Rekha","Kavita","Meena","Fatima","Sunita","Geeta"]) : pick(firstNames)} ${pick(lastNames)}`;

      const custodyStart = daysAgo(intBetween(5, 175));
      const admissionDate = custodyStart;

      const prisoner = await prisma.prisoner.create({
        data: {
          jailId: jail.id,
          fullName,
          prisonerRegNo: `${jail.code}-P${String(prisonerSeq++).padStart(4, "0")}`,
          dateOfBirth: new Date(1985 + intBetween(0, 25), intBetween(0, 11), intBetween(1, 28)),
          gender,
          admissionDate,
          createdAt: admissionDate,
        },
      });

      const off = pick(offences);
      const isConvictOnly = rand() < 0.18;
      const isFTO = rand() < 0.65;
      const pendingCount = rand() < 0.75 ? 0 : intBetween(1, 3);
      await prisma.caseRecord.create({
        data: {
          prisonerId: prisoner.id,
          cnrNumber: `${jail.state.slice(0,2).toUpperCase()}PB010${cnrSeq++}2025`,
          caseNumber: `ST/CASE/${new Date().getFullYear()}/${cnrSeq}`,
          courtName: pick(["District & Sessions Court","Chief Judicial Magistrate Court","ACJM Court No. 2","Special NDPS Court"]),
          offence: off.offence,
          maxSentenceYears: off.maxSentenceYears,
          carriesDeathOrLife: off.carriesDeathOrLife,
          isFirstTimeOffender: isFTO,
          pendingCaseCount: pendingCount,
          custodyStartDate: custodyStart,
          caseStatus: isConvictOnly ? "convict" : "undertrial",
          updatedAt: custodyStart,
        },
      });

      if (rand() < 0.25) {
        const off2 = pick(offences);
        await prisma.caseRecord.create({
          data: {
            prisonerId: prisoner.id,
            cnrNumber: `${jail.state.slice(0,2).toUpperCase()}PB010${cnrSeq++}2025`,
            caseNumber: `ST/CASE/${new Date().getFullYear()}/${cnrSeq}`,
            courtName: pick(["District & Sessions Court","Judicial Magistrate First Class Court"]),
            offence: off2.offence,
            maxSentenceYears: off2.maxSentenceYears,
            carriesDeathOrLife: off2.carriesDeathOrLife,
            isFirstTimeOffender: false,
            pendingCaseCount: intBetween(0, 2),
            custodyStartDate: custodyStart,
            caseStatus: isConvictOnly ? "convict" : "undertrial",
            updatedAt: custodyStart,
          },
        });
      }

      if (!isConvictOnly) {
        const result = evaluateSection479({
          custodyStartDate: custodyStart,
          maxSentenceYears: off.maxSentenceYears,
          carriesDeathOrLife: off.carriesDeathOrLife,
          isFirstTimeOffender: isFTO,
          pendingCaseCount: pendingCount,
        });
        await prisma.eligibilityAssessment.create({
          data: {
            prisonerId: prisoner.id,
            status: result.status,
            reason: result.reason,
            computedAt: custodyStart,
          },
        });
      }

      if (!isConvictOnly && rand() < 0.72) {
        const plan = pick(stagePlan.filter((s) => s.count > 0));
        plan.count--;
        const thresholdDays = thresholds[plan.stage] ?? 999;
        let ageDays;
        if (plan.stage === "released") {
          ageDays = intBetween(20, 90);
        } else {
          const stallBias = rand() < 0.55;
          ageDays = stallBias ? thresholdDays + intBetween(1, 25) : Math.max(1, thresholdDays - intBetween(1, thresholdDays));
        }
        const updatedAt = daysAgo(ageDays);
        const filedDate = ["filed","hearing_scheduled","order_passed","released"].includes(plan.stage) ? daysAgo(Math.max(1, ageDays - intBetween(2, 6))) : null;
        const hearingDate = ["hearing_scheduled"].includes(plan.stage) ? daysFromNow(intBetween(3, 21)) : null;
        const staffList = usersByJail.get(jail.id);
        const reviewer = pick(staffList);

        await prisma.application.create({
          data: {
            prisonerId: prisoner.id,
            type: rand() < 0.6 ? "bail" : "personal_bond",
            stage: plan.stage,
            generatedDocumentUrl: ["drafted","filed","hearing_scheduled","order_passed","released"].includes(plan.stage)
              ? `/uploads/demo-draft-${prisonerSeq}.pdf` : null,
            filedDate,
            hearingDate,
            orderOutcome: plan.stage === "order_passed" || plan.stage === "released" ? pick(["Allowed","Allowed with conditions"]) : null,
            reviewedBy: plan.stage === "flagged" ? null : reviewer.id,
            reviewedAt: plan.stage === "flagged" ? null : updatedAt,
            updatedAt,
            stageHistory: { [plan.stage]: updatedAt.toISOString() },
          },
        });
      }
    }
  }

  const boundaryStart = new Date(
    Date.now() - Math.floor((3 * 365) / 3 - 0.25) * 86_400_000 - 12 * 3_600_000,
  );
  const boundaryPrisoner = await prisma.prisoner.create({
    data: {
      jailId: jails[0].id,
      fullName: "Mohan Boundary Crosser",
      prisonerRegNo: `${jails[0].code}-PBC01`,
      dateOfBirth: new Date(1996, 3, 12),
      gender: "male",
      admissionDate: boundaryStart,
    },
  });
  await prisma.caseRecord.create({
    data: {
      prisonerId: boundaryPrisoner.id,
      cnrNumber: `UPPB010${cnrSeq++}2025`,
      caseNumber: `ST/CASE/${new Date().getFullYear()}/BCROSS`,
      courtName: "District & Sessions Court",
      offence: "Cheating (IPC 420)",
      maxSentenceYears: 3,
      carriesDeathOrLife: false,
      isFirstTimeOffender: true,
      pendingCaseCount: 0,
      custodyStartDate: boundaryStart,
      caseStatus: "undertrial",
    },
  });
  await prisma.eligibilityAssessment.create({
    data: {
      prisonerId: boundaryPrisoner.id,
      status: "not_eligible",
      reason: evaluateSection479({
        custodyStartDate: boundaryStart,
        maxSentenceYears: 3,
        carriesDeathOrLife: false,
        isFirstTimeOffender: true,
        pendingCaseCount: 0,
      }).reason,
    },
  });

  const programsData = [
    { name: "Electrical Wiring Basics", category: "Trade Skill" },
    { name: "Tailoring & Garment Making", category: "Trade Skill" },
    { name: "Carpentry & Furniture", category: "Trade Skill" },
    { name: "Computer Basics & Data Entry", category: "Digital" },
    { name: "Organic Farming Techniques", category: "Agriculture" },
    { name: "Bakery & Confectionery", category: "Food Processing" },
    { name: "Mobile Phone Repair", category: "Trade Skill" },
    { name: "Handloom Weaving", category: "Textile" },
    { name: "Plumbing & Sanitation Fitting", category: "Trade Skill" },
    { name: "DSEU Certification Prep", category: "Education" },
  ];
  const programs = [];
  for (const p of programsData) {
    programs.push(await prisma.trainingProgram.create({ data: p }));
  }

  const allPrisoners = await prisma.prisoner.findMany();
  for (const prisoner of allPrisoners) {
    if (rand() < 0.55) {
      const program = pick(programs);
      const roll = rand();
      const status = roll < 0.35 ? "completed" : roll < 0.75 ? "in_progress" : "enrolled";
      await prisma.enrollment.create({
        data: {
          prisonerId: prisoner.id,
          programId: program.id,
          status,
          progressPct: status === "completed" ? 100 : status === "in_progress" ? intBetween(25, 95) : 0,
          certificateUrl: status === "completed" ? `/uploads/cert-${prisoner.id.slice(-6)}.pdf` : null,
          completedAt: status === "completed" ? daysAgo(intBetween(5, 60)) : null,
        },
      });
    }
  }

  const notesText = [
    "Behaviour cooperative during morning headcount.",
    "Family visit recorded last week; morale improved.",
    "Showed interest in enrolling for tailoring program next batch.",
    "Medical screening completed; fit for work duty.",
    "Legal aid counsel met regarding upcoming bail hearing.",
  ];
  for (let n = 0; n < 12; n++) {
    const prisoner = pick(allPrisoners);
    const authorPool = usersByJail.get(prisoner.jailId);
    await prisma.note.create({
      data: {
        prisonerId: prisoner.id,
        authorId: pick(authorPool).id,
        body: pick(notesText),
        createdAt: daysAgo(intBetween(1, 45)),
      },
    });
  }

  const counts = {
    jails: await prisma.jail.count(),
    users: await prisma.user.count(),
    prisoners: await prisma.prisoner.count(),
    cases: await prisma.caseRecord.count(),
    applications: await prisma.application.count(),
    enrollments: await prisma.enrollment.count(),
    notes: await prisma.note.count(),
  };

  console.log("Seed complete:");
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
