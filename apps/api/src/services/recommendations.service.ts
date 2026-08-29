import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../middleware/errors.js";
import type { JobStatus, RecommendationDto } from "@rihai/shared-types";

/**
 * Bridge to the Python recommender service (backend-ai/recommender-service).
 * The scoring engine stays stateless in Python: Express owns the shared Postgres
 * job/candidate data, maps it into the stable CandidateProfile/Job JSON contract
 * documented in that service's README, and calls /recommendations/rank-jobs.
 */

const RECOMMENDER_URL = process.env.RECOMMENDER_URL ?? "http://127.0.0.1:8000";
const TIMEOUT_MS = 12_000;

let catalogCache: { at: number; skills: string[] } | null = null;

async function recommenderFetch<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${RECOMMENDER_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Recommender returned HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw ApiError.conflict("Recommender service timed out", "RECOMMENDER_UNAVAILABLE");
    }
    logger.error(`Recommender call failed: ${path}`, err);
    throw ApiError.conflict(
      "The job-matching engine is not reachable. Is the Python recommender running on port 8000?",
      "RECOMMENDER_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getSkillCatalog(): Promise<{ count: number; canonical_skills: string[] }> {
  if (catalogCache && Date.now() - catalogCache.at < 5 * 60_000) {
    return { count: catalogCache.skills.length, canonical_skills: catalogCache.skills };
  }
  const res = await recommenderFetch<{ count: number; canonical_skills: string[] }>(
    "/api/v1/skills/catalog",
  );
  catalogCache = { at: Date.now(), skills: res.canonical_skills };
  return res;
}

/** Canonical skill tags for free text, via the engine's extractor. */
async function extractSkills(text: string): Promise<string[]> {
  const res = await recommenderFetch<{
    matches: { canonical_skill: string; match_method: string; confidence: number }[];
  }>("/api/v1/skills/extract", { text });
  // Trust boundary per README: keep high-confidence exact/synonym matches only —
  // fuzzy guesses must never enter verified_skills without human confirmation.
  return [
    ...new Set(
      res.matches
        .filter((m) => m.match_method !== "fuzzy")
        .map((m) => m.canonical_skill),
    ),
  ];
}

interface PrisonerForCandidate {
  id: string;
  consentToShareProfile: boolean;
  jail: { district: string };
  enrollments: { status: string; program: { name: string; category: string } }[];
}

/**
 * Maps a prisoner's Skill Passport into the privacy-safe CandidateProfile:
 * employment-fit fields ONLY (the Python model rejects everything else).
 * - verified_skills: canonical tags extracted from COMPLETED training programs
 *   (mirrors the workbook adapter rule that in-training candidates get no tags)
 * - experience_months: deliberately 0 — workshop hours are not work experience
 * - consent: staff acts on the prisoner's recorded consent to share the passport
 */
async function buildCandidate(prisoner: PrisonerForCandidate) {
  const completed = prisoner.enrollments.filter((e) => e.status === "completed");
  const skillTexts = completed.map((e) => `${e.program.name} ${e.program.category}`);
  const verified = new Set<string>();
  for (const text of skillTexts) {
    for (const tag of await extractSkills(text)) verified.add(tag);
  }
  const categories = [...new Set(completed.map((e) => e.program.category.toLowerCase()))];
  return {
    candidate_id: prisoner.id,
    verified_skills: [...verified],
    certificates: [] as string[],
    experience_months: 0,
    preferred_job_categories: categories,
    preferred_districts: [prisoner.jail.district],
    available_from: null,
    // Real recorded consent — the engine marks non-consenting candidates
    // ineligible so their profiles are never ranked for employers.
    consent: prisoner.consentToShareProfile,
  };
}

export async function recommendedJobsForPrisoner(
  prisonerId: string,
  topK = 5,
  opts?: { bypassConsentCheck?: boolean },
): Promise<RecommendationDto[]> {
  const prisoner = await prisma.prisoner.findUnique({
    where: { id: prisonerId },
    include: {
      jail: { select: { district: true } },
      enrollments: { include: { program: true } },
    },
  });
  if (!prisoner) throw ApiError.notFound("Prisoner not found");
  if (!prisoner.consentToShareProfile && !opts?.bypassConsentCheck) return [];

  const activeJobs = await prisma.jobPosting.findMany({
    where: { status: "active" },
    include: { ngo: { select: { name: true } }, _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (activeJobs.length === 0) return [];

  const candidate = await buildCandidate(prisoner);
  const appliedRows = await prisma.jobApplication.findMany({
    where: { prisonerId },
    select: { jobId: true },
  });
  const appliedSet = new Set(appliedRows.map((r) => r.jobId));

  const rankResponse = await recommenderFetch<{
    recommendations: Omit<RecommendationDto, "job" | "appliedAlready">[];
  }>("/api/v1/recommendations/rank-jobs", {
    candidate,
    jobs: activeJobs.map(toJobDtoForPython),
    top_k: topK,
    minimum_score: 0,
    include_ineligible: false,
  });

  const byId = new Map(activeJobs.map((j) => [j.id, j]));
  return rankResponse.recommendations.flatMap((r) => {
    const j = byId.get(r.job_id);
    if (!j) return [];
    const dto: RecommendationDto = {
      ...r,
      appliedAlready: appliedSet.has(r.job_id),
      job: {
        id: j.id,
        ngoId: j.ngoId,
        ngoName: j.ngo.name,
        title: j.title,
        description: j.description,
        requiredSkills: j.requiredSkills,
        preferredSkills: j.preferredSkills,
        requiredCertificates: j.requiredCertificates,
        minExperienceMonths: j.minExperienceMonths,
        jobCategory: j.jobCategory,
        district: j.district,
        status: j.status as JobStatus,
        openings: j.openings,
        wageInfo: j.wageInfo,
        createdAt: j.createdAt.toISOString(),
        applicationCount: j._count.applications,
      },
    };
    return [dto];
  });
}

function toJobDtoForPython(j: Prisma.JobPostingGetPayload<{
  include: { ngo: { select: { name: true } }; _count: { select: { applications: true } } };
}>) {
  return {
    job_id: j.id,
    title: j.title,
    description: j.description,
    required_skills: j.requiredSkills,
    preferred_skills: j.preferredSkills,
    required_certificates: j.requiredCertificates,
    minimum_experience_months: j.minExperienceMonths,
    job_category: j.jobCategory,
    district: j.district,
    status: j.status,
  };
}
