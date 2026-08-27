import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationStage, type StallRow } from "@rihai/shared-types";
import { api, extractApiError } from "../../../lib/api";
import { useLang } from "../../../lib/i18n";
import { roleFlags } from "../../../lib/permissions";
import { useAuthStore } from "../../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../../components/ui";

const STAGE_KEY: Record<ApplicationStage, string> = {
  [ApplicationStage.Flagged]: "stage.flagged",
  [ApplicationStage.Drafted]: "stage.drafted",
  [ApplicationStage.Filed]: "stage.filed",
  [ApplicationStage.HearingScheduled]: "stage.hearing",
  [ApplicationStage.OrderPassed]: "stage.order",
  [ApplicationStage.Released]: "stage.released",
};

const ITEMS_PER_PAGE = 15;

export default function StallTab({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const user = useAuthStore((s) => s.user);
  const { canEscalate } = roleFlags(user?.role);

  const [activeTab, setActiveTab] = useState<"stalled" | "escalated">("stalled");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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

  if (stallQuery.isLoading) return <Spinner label="Loading stalled cases…" />;
  if (stallQuery.isError) return <ErrorBanner message={extractApiError(stallQuery.error).message} />;

  const allRows = stallQuery.data ?? [];

  const stalledRows = allRows.filter((r) => !r.escalated);
  const escalatedRows = allRows.filter((r) => r.escalated);

  const currentTabRows = activeTab === "stalled" ? stalledRows : escalatedRows;

  // Search Filter
  const filteredRows = currentTabRows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.prisonerName.toLowerCase().includes(q) ||
      row.caseNumber.toLowerCase().includes(q) ||
      row.courtName.toLowerCase().includes(q)
    );
  });

  // Pagination Math
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleTabChange = (tab: "stalled" | "escalated") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Executive Intro Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-6 shadow-xl">
        <div>
          <h2 className="display text-xl font-bold text-navy">Stalled &amp; Escalated Case Tracker</h2>
          <p className="mt-1 text-xs text-bodytext">
            {t("stall.intro")}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-terracotta text-white px-3.5 py-1.5 text-xs font-extrabold shadow-sm border border-red-800">
            {stalledRows.length} Stalled
          </span>
          <span className="rounded-lg bg-emerald-800 text-white px-3.5 py-1.5 text-xs font-extrabold shadow-sm border border-emerald-950">
            {escalatedRows.length} Escalated
          </span>
        </div>
      </div>

      {escalateMutation.isError && (
        <ErrorBanner message={extractApiError(escalateMutation.error).message} />
      )}

      {/* Main Container Card */}
      <div className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-6 sm:p-7 shadow-xl space-y-5">
        {/* Controls Bar: Sub-Tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee4d6] pb-4">
          {/* Sub-Tabs */}
          <div className="inline-flex rounded-xl bg-[#FAF7F2] p-1 border border-[#eee4d6]">
            <button
              type="button"
              onClick={() => handleTabChange("stalled")}
              className={`rounded-xl px-5 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === "stalled"
                  ? "bg-navy text-white shadow-md"
                  : "text-navy hover:text-terracotta hover:bg-white/80"
              }`}
            >
              Stalled Cases ({stalledRows.length})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("escalated")}
              className={`rounded-xl px-5 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === "escalated"
                  ? "bg-emerald-800 text-white shadow-md"
                  : "text-navy hover:text-emerald-800 hover:bg-white/80"
              }`}
            >
              ⚡ Escalated High-Priority ({escalatedRows.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search name, case #, court…"
              className="w-full rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-2 pl-9 text-xs text-navy transition focus:border-terracotta focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/20"
            />
            <span className="absolute left-3 top-2 text-xs text-bodytext">🔍</span>
            {searchQuery && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-2 text-xs font-bold text-bodytext hover:text-navy cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Table View */}
        {filteredRows.length === 0 ? (
          <div className="py-10 text-center">
            {searchQuery ? (
              <p className="text-sm font-semibold text-bodytext">No matching cases found for "{searchQuery}".</p>
            ) : activeTab === "stalled" ? (
              <EmptyState icon="✅" title={t("stall.empty.h")} body={t("stall.empty.p")} />
            ) : (
              <EmptyState icon="📋" title="No Escalated Cases" body="Cases escalated to DLSA High-Priority will appear in this tab." />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-[#eee4d6] bg-[#FAF7F2]">
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.prisoner")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.case")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.court")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.stage")}</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.days")}</th>
                  <th className="py-3 px-4 text-right text-[11px] font-extrabold uppercase tracking-wider text-navy">{t("stall.th.escalation")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f6f1e7]">
                {paginatedRows.map((row) => (
                  <tr key={row.applicationId} className={`transition ${row.daysStalled > 14 ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-[#FFFBF7]"}`}>
                    <td className="py-3.5 px-4 font-bold text-navy">{row.prisonerName}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-bodytext">{row.caseNumber}</td>
                    <td className="py-3.5 px-4 text-xs text-bodytext">{row.courtName}</td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-full bg-slate-100 border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {t(STAGE_KEY[row.stage] ?? "stage.flagged")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-extrabold text-sm ${row.daysStalled > 14 ? "text-red-600" : "text-amber-600"}`}>
                        {row.daysStalled} days
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {row.escalated ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm">
                          ⚡ {t("stall.escalated")}
                          {row.escalatedAt &&
                            ` · ${new Date(row.escalatedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`}
                        </span>
                      ) : canEscalate ? (
                        <button
                          onClick={() => escalateMutation.mutate(row.applicationId)}
                          disabled={escalateMutation.isPending}
                          className="btn btn-primary btn-sm disabled:opacity-60 shadow-sm"
                        >
                          {t("stall.escalate")}
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

        {/* Pagination Bar */}
        {filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee4d6] pt-4 text-xs font-semibold text-bodytext">
            <span>
              Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredRows.length)} of {filteredRows.length} {activeTab} cases
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage === 1}
                className="rounded-lg border border-[#EBE3D7] bg-[#FAF7F2] px-3 py-1.5 font-bold text-navy transition hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>

              {getVisiblePageNumbers(validPage, totalPages).map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs font-bold text-bodytext">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition ${
                      validPage === item
                        ? "bg-navy text-white shadow-sm"
                        : "border border-[#EBE3D7] bg-[#FAF7F2] text-navy hover:bg-white"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                className="rounded-lg border border-[#EBE3D7] bg-[#FAF7F2] px-3 py-1.5 font-bold text-navy transition hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getVisiblePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}
