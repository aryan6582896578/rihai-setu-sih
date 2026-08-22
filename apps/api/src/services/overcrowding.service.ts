import { CaseStatus, EligibilityStatus } from "@rihai/shared-types";
import { prisma } from "../lib/prisma.js";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

export interface TrendPoint {
  date: string;
  occupancy: number;
}

export async function getCurrentState(jailId: string) {
  const jail = await prisma.jail.findUniqueOrThrow({ where: { id: jailId } });

  const [occupancy, undertrials, convicts] = await Promise.all([
    prisma.prisoner.count({ where: { jailId } }),
    prisma.prisoner.count({
      where: { jailId, cases: { some: { caseStatus: CaseStatus.Undertrial } } },
    }),
    prisma.prisoner.count({
      where: { jailId, cases: { some: { caseStatus: CaseStatus.Convict } } },
    }),
  ]);

  const snapshots = await prisma.occupancySnapshot.findMany({
    where: { jailId },
    orderBy: { date: "asc" },
    take: 30,
  });

  const trend: TrendPoint[] = snapshots.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    occupancy: s.occupancy,
  }));
  trend.push({ date: new Date().toISOString().slice(0, 10), occupancy });

  return {
    jail: { id: jail.id, name: jail.name, code: jail.code },
    occupancy,
    sanctionedCapacity: jail.sanctionedCapacity,
    capacityPct: jail.sanctionedCapacity
      ? Math.round((occupancy / jail.sanctionedCapacity) * 1000) / 10
      : 0,
    undertrialCount: undertrials,
    convictCount: convicts,
    trend,
  };
}

export interface ProjectionPoint {
  day: number;
  baseline: number;
  projected: number;
}

interface ReleaseCandidate {
  crossingDay: number;
}

async function collectReleaseCandidates(jailId: string): Promise<ReleaseCandidate[]> {
  const prisoners = await prisma.prisoner.findMany({
    where: { jailId },
    include: {
      cases: { orderBy: { updatedAt: "desc" } },
      assessments: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  });

  const now = Date.now();
  const candidates: ReleaseCandidate[] = [];

  for (const p of prisoners) {
    const primary =
      p.cases.find((c) => c.caseStatus === CaseStatus.Undertrial) ??
      p.cases.find((c) => c.caseStatus === CaseStatus.Convict) ??
      p.cases[0];
    if (!primary) continue;

    const custodyDays = Math.floor((now - primary.custodyStartDate.getTime()) / MS_PER_DAY);
    const halfDays = (primary.maxSentenceYears * DAYS_PER_YEAR) / 2;
    const thirdDays = (primary.maxSentenceYears * DAYS_PER_YEAR) / 3;

    if (primary.caseStatus === CaseStatus.Undertrial) {
      // Already eligible and progressing through the pipeline.
      const latest = p.assessments[0];
      if (latest?.status === EligibilityStatus.Eligible && primary.pendingCaseCount <= 1 && !primary.carriesDeathOrLife) {
        candidates.push({ crossingDay: 0 });
      } else if (!primary.carriesDeathOrLife && primary.pendingCaseCount <= 1) {
        // Will cross the Section 479 threshold within the window.
        const effectiveThreshold = primary.isFirstTimeOffender ? thirdDays : halfDays;
        if (custodyDays < effectiveThreshold) {
          candidates.push({ crossingDay: Math.ceil(effectiveThreshold - custodyDays) });
        }
      }
    } else if (primary.caseStatus === CaseStatus.Convict) {
      // Sentence-end release projection for convicts.
      const sentenceEndDay = Math.ceil(
        (primary.custodyStartDate.getTime() + primary.maxSentenceYears * DAYS_PER_YEAR * MS_PER_DAY - now) / MS_PER_DAY,
      );
      if (sentenceEndDay >= 0) candidates.push({ crossingDay: sentenceEndDay });
    }
  }
  return candidates;
}

async function admissionRatePerDay(jailId: string): Promise<number> {
  const since = new Date(Date.now() - 90 * MS_PER_DAY);
  const count = await prisma.prisoner.count({
    where: { jailId, admissionDate: { gte: since } },
  });
  return Math.max(0.15, count / 90);
}

export async function getProjection(jailId: string, days: 30 | 60 | 90) {
  const state = await getCurrentState(jailId);
  const [candidates, rate] = await Promise.all([
    collectReleaseCandidates(jailId),
    admissionRatePerDay(jailId),
  ]);

  const points: ProjectionPoint[] = [];
  let cumReleases = 0;
  for (let t = 0; t <= days; t++) {
    const dueNow = candidates.filter((c) => c.crossingDay === t).length;
    cumReleases += dueNow;
    const admissionsByT = rate * t;
    points.push({
      day: t,
      baseline: Math.round(state.occupancy + admissionsByT),
      projected: Math.round(Math.max(0, state.occupancy + admissionsByT - cumReleases)),
    });
  }

  return {
    days,
    currentOccupancy: state.occupancy,
    sanctionedCapacity: state.sanctionedCapacity,
    expectedReleasesInWindow: candidates.filter((c) => c.crossingDay <= days).length,
    dailyAdmissionRate: Math.round(rate * 100) / 100,
    points,
  };
}

export async function getBacklogBreakdown(jailId: string) {
  const total = await prisma.prisoner.count({ where: { jailId } });

  const eligibleUnprocessed = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
    FROM "Prisoner" p
    LEFT JOIN LATERAL (
      SELECT status FROM "EligibilityAssessment" e
      WHERE e.prisoner_id = p.id ORDER BY e.computed_at DESC LIMIT 1
    ) ea ON TRUE
    WHERE p.jail_id = ${jailId}
      AND ea.status = 'eligible'
      AND NOT EXISTS (
        SELECT 1 FROM "Application" a
        WHERE a.prisoner_id = p.id AND a.stage <> 'flagged'
      )
  `;

  const eligibleCount = Number(eligibleUnprocessed[0]?.n ?? 0n);
  return {
    totalPrisoners: total,
    eligibleButUnprocessed: eligibleCount,
    genuineCapacityLoad: Math.max(0, total - eligibleCount),
  };
}

// ---------- Cross-jail rollup ----------

export async function getRollup() {
  const jails = await prisma.jail.findMany({ orderBy: { name: "asc" } });

  const rows = [];
  let totalOccupancy = 0;
  let totalCapacity = 0;
  let totalEligibleUnprocessed = 0;

  for (const jail of jails) {
    const [state, backlog] = await Promise.all([
      getCurrentState(jail.id),
      getBacklogBreakdown(jail.id),
    ]);
    totalOccupancy += state.occupancy;
    totalCapacity += jail.sanctionedCapacity;
    totalEligibleUnprocessed += backlog.eligibleButUnprocessed;
    rows.push({
      jailId: jail.id,
      name: jail.name,
      district: jail.district,
      state: jail.state,
      occupancy: state.occupancy,
      sanctionedCapacity: jail.sanctionedCapacity,
      capacityPct: state.capacityPct,
      eligibleButUnprocessed: backlog.eligibleButUnprocessed,
    });
  }

  const combinedBaseline30 = (
    await Promise.all(jails.map((j) => getProjection(j.id, 30)))
  ).map((p) => p.points[p.points.length - 1]?.baseline ?? 0);
  const combinedProjected30 = (
    await Promise.all(jails.map((j) => getProjection(j.id, 30)))
  ).map((p) => p.points[p.points.length - 1]?.projected ?? 0);

  return {
    jails: rows,
    totals: {
      occupancy: totalOccupancy,
      sanctionedCapacity: totalCapacity,
      capacityPct: totalCapacity ? Math.round((totalOccupancy / totalCapacity) * 1000) / 10 : 0,
      eligibleButUnprocessed: totalEligibleUnprocessed,
    },
    projection30: {
      baselineSum: combinedBaseline30.reduce((a, b) => a + b, 0),
      projectedSum: combinedProjected30.reduce((a, b) => a + b, 0),
    },
  };
}
