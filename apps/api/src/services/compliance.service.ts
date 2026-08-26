import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { storage } from "../lib/storage.js";

export interface ComplianceMetrics {
  eligibleIdentified: number;
  applicationsFiled: number;
  releasesCompleted: number;
  avgDaysFlaggedToReleased: number | null;
}

export async function getComplianceMetrics(
  jailId: string | null,
  from: Date,
  to: Date,
): Promise<ComplianceMetrics> {
  const jailFilter = jailId ? Prisma.sql`AND p.jail_id = ${jailId}` : Prisma.empty;

  const [eligibleRows, filedRows, releasedRows, avgRows] = await Promise.all([
    // First-ever "eligible" assessment per prisoner within range. The jail filter
    // must live in WHERE (p.jail_id is not grouped) — HAVING broke with a 500.
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS n FROM (
        SELECT e.prisoner_id, MIN(e.computed_at) AS first_eligible
        FROM "EligibilityAssessment" e
        JOIN "Prisoner" p ON p.id = e.prisoner_id
        WHERE e.status = 'eligible' ${jailFilter}
        GROUP BY e.prisoner_id
        HAVING MIN(e.computed_at) BETWEEN ${from} AND ${to}
      ) t
    `),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS n
      FROM "Application" a
      JOIN "Prisoner" p ON p.id = a.prisoner_id
      WHERE (a.stage_history->>'filed') IS NOT NULL
        AND COALESCE(a.stage_history#>>'{filed,at}', a.stage_history->>'filed')::timestamptz BETWEEN ${from} AND ${to}
        ${jailFilter}
    `),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS n
      FROM "Application" a
      JOIN "Prisoner" p ON p.id = a.prisoner_id
      WHERE a.stage = 'released'
        AND (a.stage_history->>'released') IS NOT NULL
        AND COALESCE(a.stage_history#>>'{released,at}', a.stage_history->>'released')::timestamptz BETWEEN ${from} AND ${to}
        ${jailFilter}
    `),
    prisma.$queryRaw<{ avg_days: number | null }[]>(Prisma.sql`
      SELECT AVG(
        EXTRACT(EPOCH FROM (
          COALESCE(a.stage_history#>>'{released,at}', a.stage_history->>'released')::timestamptz - COALESCE(a.stage_history#>>'{flagged,at}', a.stage_history->>'flagged')::timestamptz
        )) / 86400
      )::float AS avg_days
      FROM "Application" a
      JOIN "Prisoner" p ON p.id = a.prisoner_id
      WHERE a.stage = 'released'
        AND (a.stage_history->>'flagged') IS NOT NULL
        AND (a.stage_history->>'released') IS NOT NULL
        AND COALESCE(a.stage_history#>>'{released,at}', a.stage_history->>'released')::timestamptz BETWEEN ${from} AND ${to}
        ${jailFilter}
    `),
  ]);

  return {
    eligibleIdentified: Number(eligibleRows[0]?.n ?? 0n),
    applicationsFiled: Number(filedRows[0]?.n ?? 0n),
    releasesCompleted: Number(releasedRows[0]?.n ?? 0n),
    avgDaysFlaggedToReleased:
      avgRows[0]?.avg_days != null ? Math.round(avgRows[0].avg_days * 10) / 10 : null,
  };
}

function toCsv(metrics: ComplianceMetrics, scope: string, from: Date, to: Date): string {
  const lines = [
    `RIHAI SETU Compliance Report,${scope}`,
    `Period,${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    "",
    "Metric,Value",
    `Eligible undertrials identified,${metrics.eligibleIdentified}`,
    `Applications filed,${metrics.applicationsFiled}`,
    `Releases completed,${metrics.releasesCompleted}`,
    `Avg days flagged-to-released,${metrics.avgDaysFlaggedToReleased ?? "n/a"}`,
  ];
  return lines.join("\r\n") + "\r\n";
}

function toExcelXml(metrics: ComplianceMetrics, scope: string, from: Date, to: Date): string {
  const cell = (v: string | number) =>
    typeof v === "number"
      ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${v}</Data></Cell>`;
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Compliance Report">
  <Table>
   <Row>${cell("RIHAI SETU Compliance Report")}${cell(scope)}</Row>
   <Row>${cell("Period")}${cell(`${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`)}</Row>
   <Row></Row>
   <Row>${cell("Metric")}${cell("Value")}</Row>
   <Row>${cell("Eligible undertrials identified")}${cell(metrics.eligibleIdentified)}</Row>
   <Row>${cell("Applications filed")}${cell(metrics.applicationsFiled)}</Row>
   <Row>${cell("Releases completed")}${cell(metrics.releasesCompleted)}</Row>
   <Row>${cell("Avg days flagged-to-released")}${cell(metrics.avgDaysFlaggedToReleased ?? "n/a")}</Row>
  </Table>
 </Worksheet>
</Workbook>`;
}

async function toPdfStyleHtml(
  metrics: ComplianceMetrics,
  scope: string,
  from: Date,
  to: Date,
): Promise<string> {
  const stored = await storage.save(
    `compliance/report-${Date.now()}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><title>Compliance Report</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:720px;margin:40px auto;color:#0f172a}
h1{color:#1d4ed8;font-size:22px}.sub{color:#64748b;font-size:13px;margin-bottom:24px}
table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #e2e8f0;font-size:14px}
td:last-child{text-align:right;font-weight:700}.note{margin-top:26px;font-size:11px;color:#94a3b8}</style></head><body>
<h1>Section 479 Compliance Report</h1>
<p class="sub">${scope} &middot; ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)} &middot; generated ${new Date().toLocaleString("en-IN")}</p>
<table>
<tr><td>Eligible undertrials identified</td><td>${metrics.eligibleIdentified}</td></tr>
<tr><td>Applications filed</td><td>${metrics.applicationsFiled}</td></tr>
<tr><td>Releases completed</td><td>${metrics.releasesCompleted}</td></tr>
<tr><td>Average days flagged &rarr; released</td><td>${metrics.avgDaysFlaggedToReleased ?? "n/a"}</td></tr>
</table>
<p class="note">Figures mirror the reporting states/UTs provide to the Supreme Court on Section 479 BNSS implementation. Generated by RIHAI SETU from signed operational records.</p>
</body></html>`,
  );
  return stored.url;
}

export async function buildExport(
  jailId: string | null,
  scope: string,
  from: Date,
  to: Date,
  format: "csv" | "xlsx" | "pdf",
): Promise<{ body: string; contentType: string; filename: string; url?: string }> {
  const metrics = await getComplianceMetrics(jailId, from, to);
  if (format === "csv") {
    return {
      body: toCsv(metrics, scope, from, to),
      contentType: "text/csv",
      filename: `compliance-${scope}-${from.toISOString().slice(0, 10)}.csv`,
    };
  }
  if (format === "xlsx") {
    return {
      body: toExcelXml(metrics, scope, from, to),
      contentType: "application/vnd.ms-excel",
      filename: `compliance-${scope}-${from.toISOString().slice(0, 10)}.xls`,
    };
  }
  const url = await toPdfStyleHtml(metrics, scope, from, to);
  return {
    body: "",
    contentType: "text/html",
    filename: `compliance-${scope}-${from.toISOString().slice(0, 10)}.html`,
    url,
  };
}
