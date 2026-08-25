import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Role } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import { useLang } from "../../lib/i18n";
import { EmptyState, ErrorBanner, occupancyTone, Spinner } from "../../components/ui";
import OverviewTab from "./tabs/OverviewTab";
import StaffTab from "./tabs/StaffTab";
import StallTab from "./tabs/StallTab";
import type { JailStats, StallRow } from "@rihai/shared-types";

type TabKey = "overview" | "staff" | "stalls";

export default function JailDetailPage() {
  const { jailId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const { t } = useLang();
  const [tab, setTab] = useState<TabKey>("overview");

  const statsQuery = useQuery({
    queryKey: ["jail-stats", jailId],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: JailStats }>(`/jails/${jailId}/stats`);
        return res.data.data;
      } catch (err) {
        throw new Error(extractApiError(err).message);
      }
    },
  });

  const stallCountQuery = useQuery({
    queryKey: ["stall-list", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: StallRow[] }>(`/jails/${jailId}/stall-list`);
      return res.data.data;
    },
    // The badge must track reality: recompute whenever the page mounts and poll
    // gently instead of serving a stale cache after updates happen elsewhere.
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 45_000,
  });

  if (statsQuery.isLoading) return <Spinner label="Loading jail portal…" />;

  if (statsQuery.isError) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={statsQuery.error.message} />
        <Link to="/jails" className="crumb">← All jails</Link>
      </div>
    );
  }

  const stats = statsQuery.data!;
  const canManageStaff =
    user?.role === Role.SuperAdmin || user?.role === Role.JailSuperintendent;
  const stalledCount = stallCountQuery.data?.length ?? 0;
  const tone = occupancyTone(stats.capacityPct);
  const capPillCls =
    tone === "red" ? "pill-full" : tone === "amber" ? "pill-warn" : "pill-ok";

  const tabs: { key: TabKey; label: string; badge?: number; visible: boolean }[] = [
    { key: "overview", label: t("jailtab.overview"), visible: true },
    { key: "staff", label: t("jailtab.staff"), visible: canManageStaff },
    { key: "stalls", label: t("jailtab.stalls"), badge: stalledCount, visible: true },
  ];

  return (
    <div>
      <Link to="/jails" className="crumb">{t("back.alljails")}</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display mb-1 text-2xl font-bold text-navy sm:text-[1.8rem]">{stats.jail.name}</h1>
          <p className="text-[13.5px] text-bodytext">
            {stats.jail.district}, {stats.jail.state} · <span className="font-mono">{stats.jail.code}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/jails/${jailId}/prisoners`} className="btn btn-outline btn-sm">
            {t("btn.prisoners")} ({stats.totalPrisoners})
          </Link>
          <Link to={`/jails/${jailId}/court-tracking`} className="btn btn-ghost btn-sm">{t("link.court")}</Link>
          <Link to={`/jails/${jailId}/legal-aid`} className="btn btn-ghost btn-sm">{t("link.legalaid")}</Link>
          <Link to={`/jails/${jailId}/overcrowding`} className="btn btn-ghost btn-sm">{t("link.overcrowding")}</Link>
          <Link to={`/jails/${jailId}/compliance-report`} className="btn btn-ghost btn-sm">{t("link.compliance")}</Link>
          {canManageStaff && (
            <Link to={`/jails/${jailId}/superintendent`} className="btn btn-ghost btn-sm">
              {t("btn.superportal")}{stalledCount > 0 ? ` · ${stalledCount} ${t("stalled.count")}` : ""}
            </Link>
          )}
          <span className={capPillCls}>{stats.capacityPct}% capacity</span>
        </div>
      </div>

      <div className="tabbar">
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
              {!!t.badge && <span className="badge-count">{t.badge}</span>}
            </button>
          ))}
      </div>

      {tab === "overview" &&
        (stallCountQuery.isLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
              <div className={`mini-stat ${stats.capacityPct > 100 ? "warn-border" : ""}`}>
                <p className="k">{t("kpi.occupancy")}</p>
                <p className="v">
                  {stats.currentOccupancy}/{stats.sanctionedCapacity}
                </p>
                <p className="sub">{stats.capacityPct}% {t("kpi.ofsanctioned")}</p>
              </div>
              <div className="mini-stat">
                <p className="k">{t("kpi.sanctioned")}</p>
                <p className="v">{stats.sanctionedCapacity}</p>
              </div>
              <div className="mini-stat warn-border">
                <p className="k">{t("kpi.pctcap")}</p>
                <p className="v">{stats.capacityPct}%</p>
              </div>
              <div className="mini-stat">
                <p className="k">{t("kpi.total")}</p>
                <p className="v">{stats.totalPrisoners}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4">
              <div className="mini-stat">
                <p className="k">{t("kpi.undertrials")}</p>
                <p className="v">{stats.undertrialCount}</p>
              </div>
              <div className="mini-stat">
                <p className="k">{t("kpi.convicts")}</p>
                <p className="v">{stats.convictCount}</p>
              </div>
              <div className="mini-stat">
                <p className="k">{t("kpi.staff")}</p>
                <p className="v">{stats.staffCount}</p>
              </div>
            </div>
            <OverviewTab activity={stats.recentActivity} />
          </>
        ))}

      {tab === "staff" && <StaffTab jailId={jailId} />}
      {tab === "stalls" && <StallTab jailId={jailId} />}

      {!canManageStaff && tab !== "staff" && null}
      {tab === "overview" && stats.recentActivity.length === 0 && !stallCountQuery.isLoading && (
        <EmptyState icon="🕐" title={t("recent.none")} />
      )}
    </div>
  );
}
