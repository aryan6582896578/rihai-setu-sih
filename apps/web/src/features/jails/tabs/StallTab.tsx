import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationStage, type StallRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../../lib/api";
import { EmptyState, ErrorBanner, Spinner } from "../../../components/ui";

const STAGE_LABELS: Record<ApplicationStage, string> = {
  [ApplicationStage.Flagged]: "Flagged",
  [ApplicationStage.Drafted]: "Drafted",
  [ApplicationStage.Filed]: "Filed",
  [ApplicationStage.HearingScheduled]: "Hearing scheduled",
  [ApplicationStage.OrderPassed]: "Order passed",
  [ApplicationStage.Released]: "Released",
};

export default function StallTab({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();

  const stallQuery = useQuery({
    queryKey: ["stall-list", jailId],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: StallRow[] }>(`/jails/${jailId}/stall-list`);
        return res.data.data;
      } catch (err) {
        throw new Error(extractApiError(err).message);
      }
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      await api.post(`/applications/${applicationId}/escalate`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["stall-list", jailId] }),
  });

  if (stallQuery.isLoading) return <Spinner label="Computing stalled applications…" />;
  if (stallQuery.isError) return <ErrorBanner message={extractApiError(stallQuery.error).message} />;

  const rows = stallQuery.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing is stalled"
        body="Applications past their per-stage threshold will appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Applications exceeding stage thresholds: flagged 3d · drafted 5d · filed 10d · hearing scheduled 14d · order
        passed→release 3d. Sorted by days stalled.
      </p>

      {escalateMutation.isError && (
        <ErrorBanner message={extractApiError(escalateMutation.error).message} />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Prisoner</th>
              <th className="px-4 py-3">Case no.</th>
              <th className="px-4 py-3">Court</th>
              <th className="px-4 py-3">Current stage</th>
              <th className="px-4 py-3">Days stalled</th>
              <th className="px-4 py-3 text-right">Escalation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.applicationId} className={row.daysStalled > 14 ? "bg-red-50/40" : undefined}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.prisonerName}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.caseNumber}</td>
                <td className="px-4 py-3 text-slate-600">{row.courtName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-600/20">
                    {STAGE_LABELS[row.stage] ?? row.stage}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${row.daysStalled > 14 ? "text-red-700" : "text-amber-700"}`}>
                    {row.daysStalled}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {row.escalated ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      ✓ Escalated{" "}
                      {row.escalatedAt &&
                        new Date(row.escalatedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </span>
                  ) : (
                    <button
                      onClick={() => escalateMutation.mutate(row.applicationId)}
                      disabled={escalateMutation.isPending}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      Escalate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
