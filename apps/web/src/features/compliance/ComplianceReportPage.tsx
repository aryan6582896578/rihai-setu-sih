import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ComplianceMetrics } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner, StatCard } from "../..//components/ui";

export default function ComplianceReportPage() {
  const params = useParams();
  const user = useAuthStore((s) => s.user);
  const isRollup = !params.jailId;
  const jailId = params.jailId ?? "";

  const allowed = !isRollup || user?.role === "super_admin";

  if (user?.role === "dlsa_lawyer") {
    return (
      <div className="space-y-4">
        <Link to={jailId ? `/jails/${jailId}` : "/jails"} className="crumb">← Jail portal</Link>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="display text-lg font-bold text-navy mb-2">Access Restricted</h2>
          <p className="text-sm text-bodytext mb-4">
            DLSA Lawyer accounts are not authorized to view compliance reports.
          </p>
          {jailId && (
            <div className="flex justify-center gap-3">
              <Link to={`/jails/${jailId}/court-tracking`} className="btn btn-primary btn-sm">Court Tracking</Link>
              <Link to={`/jails/${jailId}/legal-aid`} className="btn btn-outline btn-sm">Legal Aid</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const defaultFrom = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  // BUGFIX: the rollup route is mounted at /api/v1/compliance-report (route "/").
  // The old code doubled the segment ("/compliance-report/compliance-report") → 404.
  const base = isRollup ? "/compliance-report" : `/jails/${jailId}/compliance-report`;

  const query = useQuery({
    enabled: allowed,
    queryKey: ["compliance", jailId || "rollup", from, to],
    queryFn: async () => {
      const res = await api.get<{ data: ComplianceMetrics }>(base + "?from=" + from + "&to=" + to);
      return res.data.data;
    },
  });

  function apiOrigin(): string {
    return import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  }

  async function download(format: "csv" | "xlsx" | "pdf") {
    const qs = "?from=" + from + "&to=" + to + "&format=" + format;
    if (format === "pdf") {
      const res = await api.get<{ data: { url: string } }>(base + "/export" + qs);
      window.open(apiOrigin() + res.data.data.url, "_blank");
      return;
    }
    const res = await api.get(base + "/export" + qs, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(res.data as unknown as Blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "compliance-" + from + "." + (format === "csv" ? "csv" : "xls");
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  if (!allowed) {
    return (
      <EmptyState
        title="Super admin only"
        body="The cross-jail compliance rollup is restricted to system administrators."
        action={<Link to="/jails" className="text-sm font-medium text-blue-700 hover:underline">← Back</Link>}
      />
    );
  }

  const m = query.data;

  return (
    <div className="space-y-4">
      <div>
        <Link to={isRollup ? "/jails" : `/jails/${jailId}`} className="crumb">
          {isRollup ? "← All jails" : "← Jail portal"}
        </Link>
        <h1 className="page-title mb-1.5">
          §479 compliance report {isRollup ? "— all jails" : ""}
        </h1>
        <p className="lede max-w-2xl">
          These are close to the exact numbers states/UTs already report to the Supreme Court on Section 479 BNSS
          implementation — pulled live from signed operational records.
        </p>
      </div>

      <div className="card-shadow flex flex-wrap items-end gap-3 rounded-card bg-white p-4">
        <label className="field text-sm !mb-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-bodytext">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field text-sm !mb-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-bodytext">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => void download("csv")} disabled={!m}
            className="btn btn-outline btn-sm disabled:opacity-40">Export CSV</button>
          <button onClick={() => void download("xlsx")} disabled={!m}
            className="btn btn-navy btn-sm disabled:opacity-40">Excel</button>
          <button onClick={() => void download("pdf")} disabled={!m}
            className="btn btn-primary btn-sm disabled:opacity-40">Printable report</button>
        </div>
      </div>

      {query.isLoading && <Spinner label="Crunching records…" />}
      {query.isError && <ErrorBanner message={extractApiError(query.error).message} />}

      {m && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Eligible undertrials identified" value={m.eligibleIdentified} tone="amber"
            sub="first-time eligible in period" />
          <StatCard label="Applications filed" value={m.applicationsFiled} tone="blue" />
          <StatCard label="Releases completed" value={m.releasesCompleted} tone="green" />
          <StatCard label="Avg days flagged → released" value={m.avgDaysFlaggedToReleased ?? "n/a"} sub="throughput" />
        </div>
      )}
    </div>
  );
}
