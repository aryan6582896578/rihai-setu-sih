import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

/**
 * Idempotent seeder for the NGO employment pipeline:
 * - 2 ngo_partner demo users (password Passw0rd!23)
 * - 12 active JobPostings (6 per NGO) located around the PSI-2024 scaled jails
 *   (West Delhi, Bhopal, Pune, Jammu, Shillong, Nashik). Skill tags all come from
 *   the canonical dictionary in backend-ai/recommender-service/app/data/skill_dictionary.json,
 *   so the Python ranker accepts every job without validation errors.
 */

const PASSWORD = "Passw0rd!23";

type JobSeed = {
  title: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredCertificates?: string[];
  minExperienceMonths: number;
  jobCategory: string;
  district: string;
  openings?: number;
  wageInfo?: string;
};

const JOBS: JobSeed[] = [
  {
    title: "Tailoring Unit Supervisor",
    description:
      "Supervise daily tailoring production, guide operators and keep stitching quality on target.",
    requiredSkills: ["tailoring", "machine_sewing", "fabric_cutting"],
    preferredSkills: ["quality_check"],
    jobCategory: "textile",
    district: "West Delhi",
    minExperienceMonths: 6,
    openings: 4,
    wageInfo: "\u20B918,000\u201322,000/month",
  },
  {
    title: "Warehouse Support Associate",
    description:
      "Pick, pack and stage goods in a busy warehouse following inventory and safety procedures.",
    requiredSkills: ["inventory_handling", "packaging"],
    preferredSkills: ["barcode_scanning", "safety_practices"],
    jobCategory: "logistics",
    district: "Noida",
    minExperienceMonths: 0,
    openings: 6,
    wageInfo: "\u20B915,000\u201318,000/month",
  },
  {
    title: "Electrical Maintenance Helper",
    description:
      "Assist electricians with wiring, fixture maintenance and basic electrical testing.",
    requiredSkills: ["basic_wiring", "electrical_maintenance"],
    preferredSkills: ["circuit_breaker_installation", "electrical_testing"],
    jobCategory: "electrical",
    district: "Bhopal",
    minExperienceMonths: 6,
    openings: 2,
    wageInfo: "\u20B918,000\u201321,000/month",
  },
  {
    title: "Organic Farming Assistant",
    description: "Help with sowing, plant care and harvest sorting on an organic farm.",
    requiredSkills: ["organic_farming", "plant_care"],
    preferredSkills: ["produce_sorting", "horticulture"],
    jobCategory: "agriculture",
    district: "Indore",
    minExperienceMonths: 0,
    openings: 5,
    wageInfo: "\u20B914,000\u201317,000/month",
  },
  {
    title: "Garment Finishing Operator",
    description:
      "Run garment finishing machines covering threading, trimming and final quality checks.",
    requiredSkills: ["garment_finishing", "fabric_handling", "machine_threading"],
    preferredSkills: ["embroidery", "quality_check"],
    jobCategory: "textile",
    district: "Pune",
    minExperienceMonths: 3,
    openings: 4,
    wageInfo: "\u20B916,000\u201319,000/month",
  },
  {
    title: "Bakery Assistant",
    description:
      "Assist bakers with mixing, proofing and baking while keeping the work area clean and safe.",
    requiredSkills: ["baking", "food_preparation"],
    preferredSkills: ["kitchen_hygiene", "packaging"],
    requiredCertificates: ["Food Safety"],
    jobCategory: "bakery",
    district: "Nashik",
    minExperienceMonths: 3,
    openings: 3,
    wageInfo: "\u20B916,000\u201319,000/month",
  },
  {
    title: "Commercial Kitchen Helper",
    description:
      "Support kitchen preparation, hygiene routines and back-of-house upkeep in a commercial kitchen.",
    requiredSkills: ["food_preparation", "kitchen_hygiene"],
    preferredSkills: ["housekeeping"],
    jobCategory: "food_service",
    district: "Mumbai",
    minExperienceMonths: 0,
    openings: 4,
    wageInfo: "\u20B915,000\u201317,000/month",
  },
  {
    title: "Welding Fabricator",
    description:
      "Fabricate and weld metal components to specification using standard workshop tools.",
    requiredSkills: ["welding", "precision_measurement"],
    preferredSkills: ["tool_handling", "safety_practices"],
    jobCategory: "fabrication",
    district: "Jammu",
    minExperienceMonths: 6,
    openings: 3,
    wageInfo: "\u20B919,000\u201324,000/month",
  },
  {
    title: "Handloom Weaver",
    description:
      "Weave fabric on handlooms, set up looms and handle yarn for consistent quality output.",
    requiredSkills: ["handloom_weaving", "loom_setup", "yarn_handling"],
    preferredSkills: ["textile_dyeing", "design_basics"],
    jobCategory: "textile",
    district: "Shillong",
    minExperienceMonths: 3,
    openings: 3,
    wageInfo: "\u20B915,000\u201318,000/month",
  },
  {
    title: "Signage Print Shop Assistant",
    description:
      "Assist screen printing runs, ink mixing and finishing work in a signage print shop.",
    requiredSkills: ["screen_printing", "ink_mixing"],
    preferredSkills: ["signage_production", "labelling"],
    jobCategory: "printing",
    district: "Nashik",
    minExperienceMonths: 0,
    openings: 2,
    wageInfo: "\u20B915,000\u201318,000/month",
  },
  {
    title: "Carpentry Workshop Hand",
    description:
      "Support carpentry operations including cutting, joining and finishing wooden pieces.",
    requiredSkills: ["carpentry", "wood_cutting", "tool_handling"],
    preferredSkills: ["wood_finishing", "precision_measurement"],
    jobCategory: "carpentry",
    district: "Bhopal",
    minExperienceMonths: 3,
    openings: 2,
    wageInfo: "\u20B917,000\u201320,000/month",
  },
  {
    title: "Data Entry Executive",
    description:
      "Enter records into spreadsheets and office software accurately and on schedule.",
    requiredSkills: ["data_entry", "typing"],
    preferredSkills: ["ms_office", "spreadsheet_basics", "tally_basics"],
    jobCategory: "clerical",
    district: "West Delhi",
    minExperienceMonths: 6,
    openings: 2,
    wageInfo: "\u20B918,000\u201320,000/month",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const ngos = [
    { email: "ngo1@rihai.gov.in", name: "Meera Sharma (Seva Foundation)" },
    { email: "ngo2@rihai.gov.in", name: "Arjun Livelihood Trust" },
  ];

  const ngoIds: string[] = [];
  for (const ngo of ngos) {
    const user = await prisma.user.upsert({
      where: { email: ngo.email },
      update: { role: "ngo_partner", isActive: true },
      create: {
        name: ngo.name,
        email: ngo.email,
        passwordHash,
        role: "ngo_partner",
        isActive: true,
      },
    });
    ngoIds.push(user.id);
    console.log(`NGO user ready: ${ngo.email} (${user.id})`);
  }

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < JOBS.length; i++) {
    const job = JOBS[i]!;
    // Jobs 1-6 -> ngo1, jobs 7-12 -> ngo2
    const ngoId = ngoIds[i < 6 ? 0 : 1]!;

    const existing = await prisma.jobPosting.findFirst({
      where: { title: job.title, ngoId },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.jobPosting.create({
      data: {
        ngoId,
        title: job.title,
        description: job.description,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        requiredCertificates: job.requiredCertificates ?? [],
        minExperienceMonths: job.minExperienceMonths,
        jobCategory: job.jobCategory,
        district: job.district,
        status: "active",
        ...(job.openings !== undefined ? { openings: job.openings } : {}),
        ...(job.wageInfo !== undefined ? { wageInfo: job.wageInfo } : {}),
      },
    });
    created++;
  }

  const totalNgoUsers = await prisma.user.count({ where: { role: "ngo_partner" } });
  const totalJobs = await prisma.jobPosting.count();

  console.log(
    `seed-ngo: created ${created} job(s), skipped ${skipped} existing; ` +
      `ngo_partner users: ${totalNgoUsers}, JobPosting rows: ${totalJobs}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
