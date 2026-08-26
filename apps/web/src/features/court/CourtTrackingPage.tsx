import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { CourtTrackingRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, STAGE_LABELS } from "../../lib/format";
import { roleFlags } from "../../lib/permissions";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

export default function CourtTrackingPage() {
  const { jailId = "" } = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { canAdvance } = roleFlags(user?.role);

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
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title mb-1.5">Court tracking</h1>
            <p className="lede max-w-2xl">
              Filed and in-hearing applications. Syncing pulls in the court's own hearing date / outcome —
              <strong> it never decides bail</strong>; only the court does.
            </p>
          </div>
          {canAdvance && (
          <button
            onClick={() => syncAll.mutate(rows)}
            disabled={rows.length === 0 || syncAll.isPending}
            className="btn btn-primary disabled:opacity-40"
          >
            {syncAll.isPending ? "Syncing all…" : `Sync all (${rows.length})`}
          </button>
          )}
        </div>
      </div>

      {syncOne.isError && <ErrorBanner message={extractApiError(syncOne.error).message} />}

      {rows.length === 0 ? (
        <EmptyState
          icon="⚖️"
          title="Nothing filed yet"
          body="Applications appear here once they reach the “filed” stage."
        />
      ) : (
        <div className="panel-tight overflow-x-auto">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Prisoner</th>
                <th>Case no</th>
                <th>CNR</th>
                <th>Stage</th>
                <th>Hearing date</th>
                <th>Order outcome</th>
                <th>Days since filed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.applicationId}>
                  <td className="font-semibold text-navy">{r.prisonerName}</td>
                  <td className="mono-cell text-bodytext">{r.caseNumber}</td>
                  <td className="mono-cell text-bodytext">{r.cnrNumber ?? "-"}</td>
                  <td><span className="pill pill-neutral">{STAGE_LABELS[r.stage]}</span></td>
                  <td className="text-bodytext">{formatDate(r.hearingDate)}</td>
                  <td>
                    {r.orderOutcome ? (
                      <span
                        className={`pill ${
                          r.orderOutcome === "granted"
                            ? "pill-ok"
                            : r.orderOutcome === "denied"
                              ? "pill-full"
                              : "pill-neutral"
                        }`}
                      >
                        {r.orderOutcome}
                      </span>
                    ) : (
                      <span className="text-[#a7adb6]">pending</span>
                    )}
                    {r.orderOutcome === "granted" && (
                      <Link
                        to={`/jails/${jailId}/legal-aid`}
                        className="ml-2 whitespace-nowrap text-[11px] font-bold text-emerald-700 hover:underline"
                      >
                        Surety checklist →
                      </Link>
                    )}
                  </td>
                  <td className="text-bodytext">{r.daysSinceFiled ?? "-"}</td>
                  <td className="text-right">
                    {canAdvance ? (
                      <button
                        onClick={() => syncOne.mutate(r.applicationId)}
                        disabled={syncOne.isPending}
                        className="btn btn-outline btn-sm whitespace-nowrap"
                      >
                        {syncOne.isPending && syncOne.variables === r.applicationId ? "Syncing…" : "Sync from eCourts (mock)"}
                      </button>
                    ) : (
                      <span className="text-xs text-[#c3c8cf]">—</span>
                    )}
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
