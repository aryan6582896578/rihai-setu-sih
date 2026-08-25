import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationStage, type StallRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../../lib/api";
import { useLang } from "../../../lib/i18n";
import { EmptyState, ErrorBanner, Spinner } from "../../../components/ui";

const STAGE_KEY: Record<ApplicationStage, string> = {
  [ApplicationStage.Flagged]: "stage.flagged",
  [ApplicationStage.Drafted]: "stage.drafted",
  [ApplicationStage.Filed]: "stage.filed",
  [ApplicationStage.HearingScheduled]: "stage.hearing",
  [ApplicationStage.OrderPassed]: "stage.order",
  [ApplicationStage.Released]: "stage.released",
};

export default function StallTab({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const { t } = useLang();

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
    staleTime: 0,
    refetchOnMount: "always",
  });

  const escalateMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      await api.post(`/applications/${applicationId}/escalate`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["stall-list", jailId] }),
  });

  if (stallQuery.isLoading) return <Spinner />;
  if (stallQuery.isError) return <ErrorBanner message={extractApiError(stallQuery.error).message} />;

  const rows = stallQuery.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState icon="✅" title={t("stall.empty.h")} body={t("stall.empty.p")} />
    );
  }

  return (
    <div className="space-y-3">
      <p className="lede">{t("stall.intro")}</p>

      {escalateMutation.isError && (
        <ErrorBanner message={extractApiError(escalateMutation.error).message} />
      )}

      <div className="panel-tight overflow-x-auto">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th>{t("stall.th.prisoner")}</th>
              <th>{t("stall.th.case")}</th>
              <th>{t("stall.th.court")}</th>
              <th>{t("stall.th.stage")}</th>
              <th>{t("stall.th.days")}</th>
              <th className="text-right">{t("stall.th.escalation")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.applicationId} className={row.daysStalled > 14 ? "bg-red-50/40" : undefined}>
                <td className="font-semibold text-navy">{row.prisonerName}</td>
                <td className="mono-cell text-bodytext">{row.caseNumber}</td>
                <td className="text-bodytext">{row.courtName}</td>
                <td>
                  <span className="pill pill-neutral">
                    {t(STAGE_KEY[row.stage] ?? "stage.flagged")}
                  </span>
                </td>
                <td>
                  <span className={`font-bold ${row.daysStalled > 14 ? "text-red-600" : "text-amber-600"}`}>
                    {row.daysStalled}
                  </span>
                </td>
                <td className="text-right">
                  {row.escalated ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      ✓ {t("stall.escalated")}{" "}
                      {row.escalatedAt &&
                        new Date(row.escalatedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </span>
                  ) : (
                    <button
                      onClick={() => escalateMutation.mutate(row.applicationId)}
                      disabled={escalateMutation.isPending}
                      className="btn btn-primary btn-sm disabled:opacity-60"
                    >
                      {t("stall.escalate")}
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
