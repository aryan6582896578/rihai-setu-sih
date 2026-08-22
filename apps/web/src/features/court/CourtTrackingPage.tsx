import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { CourtTrackingRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, STAGE_LABELS } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

export default function CourtTrackingPage() {
  const { jailId = "" } = useParams();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["court-tracking", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: CourtTrackingRow[] }>(`/jails/${jailId}/court-tracking`);
      return res.data.data;
    },
  });

  const invalidate = () =>
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["court-tracking", jailId] }),
      queryClient.invalidateQueries({ queryKey: ["prisoner"] }),
    ]);

  const syncOne = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await api.post(`/applications/${applicationId}/sync-court-status`);
      return res.data.data as { orderOutcome: string | null; hearingDate: string | null };
    },
    onSuccess: invalidate,
  });

  const syncAll = useMutation({
    mutationFn: async (rows: CourtTrackingRow[]) => {
      for (const r of rows) {
        try {
          await api.post(`/applications/${r.applicationId}/sync-court-status`);
        } catch {
          // keep syncing the rest
        }
      }
    },
    onSuccess: invalidate,
  });

  if (query.isLoading) return <Spinner label="Loading court tracking…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const rows = query.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/jails/${jailId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Jail portal
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Court tracking</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Filed and in-hearing applications. Syncing pulls in the court's own hearing date / outcome —
              <strong> it never decides bail</strong>; only the court does.
            </p>
          </div>
          <button
            onClick={() => syncAll.mutate(rows)}
            disabled={rows.length === 0 || syncAll.isPending}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
          >
            {syncAll.isPending ? "Syncing all…" : `Sync all (${rows.length})`}
          </button>
        </div>
      </div>

      {syncOne.isError && <ErrorBanner message={extractApiError(syncOne.error).message} />}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing filed yet"
          body="Applications appear here once they reach the “filed” stage."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Prisoner</th>
                <th className="px-4 py-3">Case no</th>
                <th className="px-4 py-3">CNR</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Hearing date</th>
                <th className="px-4 py-3">Order outcome</th>
                <th className="px-4 py-3">Days since filed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.applicationId}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.prisonerName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.caseNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.cnrNumber ?? "-"}</td>
                  <td className="px-4 py-3">{STAGE_LABELS[r.stage]}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.hearingDate)}</td>
                  <td className="px-4 py-3">
                    {r.orderOutcome ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.orderOutcome === "granted"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.orderOutcome === "denied"
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.orderOutcome}
                      </span>
                    ) : (
                      <span className="text-slate-400">pending</span>
                    )}
                    {r.orderOutcome === "granted" && (
                      <Link
                        to={`/jails/${jailId}/legal-aid`}
                        className="ml-2 whitespace-nowrap text-[11px] font-semibold text-emerald-700 hover:underline"
                      >
                        Surety checklist →
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.daysSinceFiled ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => syncOne.mutate(r.applicationId)}
                      disabled={syncOne.isPending}
                      className="whitespace-nowrap rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {syncOne.isPending && syncOne.variables === r.applicationId ? "Syncing…" : "Sync from eCourts (mock)"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
