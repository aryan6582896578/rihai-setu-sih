import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApplicationStage, type CourtTrackingRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, STAGE_LABELS } from "../../lib/format";
import { roleFlags } from "../../lib/permissions";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import { SearchPagination, useSearchPage } from "../../components/SearchPagination";



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
    // Court statuses change from several views (profile stage moves, legal-aid
    // syncs); poll gently so the table never sits on stale rows.
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 45_000,
  });

  const invalidate = () =>
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["court-tracking", jailId] }),
      queryClient.invalidateQueries({ queryKey: ["prisoner"] }),
      queryClient.invalidateQueries({ queryKey: ["stall-list"] }),
      queryClient.invalidateQueries({ queryKey: ["jail-stats"] }),
    ]);

  const syncOne = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await api.post(`/applications/${applicationId}/sync-court-status`);
      return res.data.data as { orderOutcome: string | null; hearingDate: string | null };
    },
    onSuccess: invalidate,
  });

  const rows = query.data ?? [];
  const sp = useSearchPage(rows, (r) =>
    `${r.prisonerName} ${r.caseNumber} ${r.cnrNumber ?? ""} ${r.stage} ${
      r.orderOutcome ?? ""
    } ${r.hearingDate ?? ""}`,
  );
  const syncableRows = rows.filter((r) => r.orderOutcome !== "granted" && r.stage !== ApplicationStage.Released);

  const syncAll = useMutation({
    mutationFn: async (targets: CourtTrackingRow[]) => {
      for (const r of targets) {
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

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title mb-1.5">Court tracking</h1>
            <p className="lede max-w-2xl">
              Filed and in-hearing applications — concluded orders stay listed with their outcome.
              <strong> “Sync from eCourts”</strong> pulls in the court's hearing date / verdict (mock provider:
              ~12 court days per real second): filed → hearing date arrives → next sync brings the order.
              It never decides bail; only the court does.
            </p>
          </div>
          {canAdvance && (
            <button
              onClick={() => syncAll.mutate(syncableRows)}
              disabled={syncableRows.length === 0 || syncAll.isPending}
              className="btn btn-primary disabled:opacity-40"
            >
              {syncAll.isPending
                ? "Syncing all…"
                : `Sync all pending (${syncableRows.length})`}
            </button>
          )}
        </div>
      </div>

      {(syncOne.isError || syncAll.isError) && (
        <ErrorBanner
          message={extractApiError(syncOne.isError ? syncOne.error : syncAll.error).message}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="⚖️"
          title="Nothing filed yet"
          body="Applications appear here once they reach the “filed” stage."
        />
      ) : (
        <div className="space-y-3">
          <SearchPagination
            q={sp.q}
            setQ={sp.setQ}
            page={sp.page}
            setPage={sp.setPage}
            totalPages={sp.totalPages}
            total={sp.total}
            noun="court cases"
          />
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
                {sp.paged.map((r) => {
                  const syncable = r.orderOutcome !== "granted" && r.stage !== ApplicationStage.Released;
                  return (
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
                          syncable ? (
                            <button
                              onClick={() => syncOne.mutate(r.applicationId)}
                              disabled={syncOne.isPending}
                              className="btn btn-outline btn-sm whitespace-nowrap"
                            >
                              {syncOne.isPending && syncOne.variables === r.applicationId
                                ? "Syncing…"
                                : "Sync from eCourts (mock)"}
                            </button>
                          ) : (
                            <span className="text-xs text-[#c3c8cf]" title="Order already passed — nothing left to sync">
                              concluded
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-[#c3c8cf]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
