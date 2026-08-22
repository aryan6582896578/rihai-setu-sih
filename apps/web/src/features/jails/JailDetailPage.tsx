import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Role } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, OccupancyBadge, Spinner, StatCard } from "../../components/ui";
import OverviewTab from "./tabs/OverviewTab";
import StaffTab from "./tabs/StaffTab";
import StallTab from "./tabs/StallTab";
import type { JailStats, StallRow } from "@rihai/shared-types";

type TabKey = "overview" | "staff" | "stalls";

export default function JailDetailPage() {
  const { jailId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
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
  });

  if (statsQuery.isLoading) return <Spinner label="Loading jail portal…" />;

  if (statsQuery.isError) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={statsQuery.error.message} />
        <Link to="/jails" className="text-sm font-medium text-blue-700 hover:underline">
          ← Back to jails
        </Link>
      </div>
    );
  }

  const stats = statsQuery.data!;
  const canManageStaff =
    user?.role === Role.SuperAdmin || user?.role === Role.JailSuperintendent;
  const stalledCount = stallCountQuery.data?.length ?? 0;

  const tabs: { key: TabKey; label: string; badge?: number; visible: boolean }[] = [
    { key: "overview", label: "Overview", visible: true },
    { key: "staff", label: "Employee Management", visible: canManageStaff },
    { key: "stalls", label: "Stall List", badge: stalledCount, visible: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/jails" className="text-sm text-slate-500 hover:text-slate-700">
          ← All jails
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{stats.jail.name}</h1>
            <p className="text-sm text-slate-500">
              {stats.jail.district}, {stats.jail.state} · <span className="font-mono">{stats.jail.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/jails/${jailId}/prisoners`}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Prisoners ({stats.totalPrisoners})
            </Link>
            {canManageStaff && (
              <Link
                to={`/jails/${jailId}/superintendent`}
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50"
              >
                Superintendent portal
                {stalledCount > 0 ? ` · ${stalledCount} stalled` : ""}
              </Link>
            )}
            <OccupancyBadge pct={stats.capacityPct} />
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs
            .filter((t) => t.visible)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
                  tab === t.key
                    ? "border-blue-700 text-blue-800"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {t.label}
                {!!t.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      t.badge > 0 && t.key === "stalls" && stalledCount > 0
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
        </nav>
      </div>

      {tab === "overview" &&
        (stallCountQuery.isLoading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              <StatCard
                label="Occupancy"
                value={`${stats.currentOccupancy}/${stats.sanctionedCapacity}`}
                sub={<OccupancyBadgeInline pct={stats.capacityPct} />}
                tone={stats.capacityPct > 120 ? "red" : stats.capacityPct >= 100 ? "amber" : "green"}
              />
              <StatCard label="Sanctioned capacity" value={stats.sanctionedCapacity} />
              <StatCard label="% capacity" value={`${stats.capacityPct}%`} />
              <StatCard label="Total prisoners" value={stats.totalPrisoners} tone="blue" />
              <StatCard label="Undertrials" value={stats.undertrialCount} tone="amber" />
              <StatCard label="Convicts" value={stats.convictCount} />
              <StatCard label="Active staff" value={stats.staffCount} />
            </div>
            <OverviewTab activity={stats.recentActivity} />
          </>
        ))}

      {tab === "staff" && <StaffTab jailId={jailId} />}
      {tab === "stalls" && <StallTab jailId={jailId} />}

      {!canManageStaff && tab !== "staff" && null}
      {tab === "overview" && stats.recentActivity.length === 0 && !stallCountQuery.isLoading && (
        <EmptyState title="No recent activity" body="Stage changes and admissions will appear here." />
      )}
    </div>
  );
}

function OccupancyBadgeInline({ pct }: { pct: number }) {
  return <span>{pct}% of sanctioned capacity</span>;
}
