import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ProjectionPoint } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import LineChart from "../../components/LineChart";
import { ErrorBanner, OccupancyBadge, Spinner } from "../../components/ui";

interface CurrentState {
  jail: { id: string; name: string; code: string };
  occupancy: number;
  sanctionedCapacity: number;
  capacityPct: number;
  undertrialCount: number;
  convictCount: number;
  trend: { date: string; occupancy: number }[];
}

interface Backlog {
  totalPrisoners: number;
  eligibleButUnprocessed: number;
  genuineCapacityLoad: number;
}

export default function OvercrowdingPage() {
  const { jailId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const [days, setDays] = useState<30 | 60 | 90>(30);

  if (user?.role === "dlsa_lawyer") {
    return (
      <div className="space-y-4">
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="display text-lg font-bold text-navy mb-2">Access Restricted</h2>
          <p className="text-sm text-bodytext mb-4">
            DLSA Lawyer accounts are not authorized to view overcrowding metrics.
          </p>
          <div className="flex justify-center gap-3">
            <Link to={`/jails/${jailId}/court-tracking`} className="btn btn-primary btn-sm">Court Tracking</Link>
            <Link to={`/jails/${jailId}/legal-aid`} className="btn btn-outline btn-sm">Legal Aid</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuery = useQuery({
    queryKey: ["overcrowding-current", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: CurrentState }>(`/jails/${jailId}/overcrowding/current`);
      return res.data.data;
    },
  });

  const projectionQuery = useQuery({
    queryKey: ["overcrowding-projection", jailId, days],
    queryFn: async () => {
      const res = await api.get<{ data: {
        days: number;
        currentOccupancy: number;
        expectedReleasesInWindow: number;
        dailyAdmissionRate: number;
        points: ProjectionPoint[];
      } }>(`/jails/${jailId}/overcrowding/projection?days=${days}`);
      return res.data.data;
    },
  });

  const backlogQuery = useQuery({
    queryKey: ["overcrowding-backlog", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: Backlog }>(`/jails/${jailId}/overcrowding/backlog-breakdown`);
      return res.data.data;
    },
  });

  if (currentQuery.isLoading) return <Spinner label="Loading overcrowding intelligence…" />;
  if (currentQuery.isError)
    return <ErrorBanner message={extractApiError(currentQuery.error).message} />;

  const state = currentQuery.data!;
  const over = state.occupancy - state.sanctionedCapacity;

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="page-title mb-1.5">
              Overcrowding intelligence — {state.jail.name}
            </h1>
            <p className="lede">
              Deterministic date-math projections from live eligibility data. No black boxes.
            </p>
          </div>
          <OccupancyBadge pct={state.capacityPct} />
        </div>
      </div>

      <section className="panel !mt-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display m-0 text-base font-bold text-navy">Current state &amp; 30-day trend</h2>
          <p className="text-xs text-bodytext">Snapshots written nightly at 02:00</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Occupancy", `${state.occupancy}/${state.sanctionedCapacity}`],
            ["% of capacity", `${state.capacityPct}%`],
            [over > 0 ? "Over by" : "Headroom", `${Math.abs(over)} beds`],
            ["Undertrials", String(state.undertrialCount)],
          ].map(([k, v]) => (
            <div key={k} className="mini-stat !p-3">
              <p className="k">{k}</p>
              <p className="display mt-0.5 text-lg font-bold text-navy">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <LineChart
            series={[{ label: "Actual occupancy (past 30 snapshots)", color: "#D9531E", points: state.trend.map((t) => t.occupancy) }]}
            yLabel="inmates"
          />
        </div>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display m-0 text-base font-bold text-navy">Forward projection</h2>
          <div className="tabpills !mb-0">
            {([30, 60, 90] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)} className={days === d ? "active" : ""}>
                {d} days
              </button>
            ))}
          </div>
        </div>

        {projectionQuery.isLoading || !projectionQuery.data ? (
          <Spinner />
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="k !text-emerald-700">Expected releases ({days}d)</p>
                <p className="display mt-0.5 text-lg font-bold text-emerald-900">
                  {projectionQuery.data.expectedReleasesInWindow}
                </p>
              </div>
              <div className="mini-stat !p-3">
                <p className="k">Avg admissions/day</p>
                <p className="display mt-0.5 text-lg font-bold text-navy">
                  {projectionQuery.data.dailyAdmissionRate}
                </p>
              </div>
              <div className="rounded-lg border border-peach bg-[#FFF6EC] p-3">
                <p className="k !text-[#8a4a1c]">Pipeline relief vs baseline</p>
                <p className="display mt-0.5 text-lg font-bold text-terracotta">
                  -{(projectionQuery.data.points.at(-1)?.baseline ?? 0) - (projectionQuery.data.points.at(-1)?.projected ?? 0)} beds
                </p>
              </div>
            </div>
            <div className="mt-4">
              <LineChart
                series={[
                  { label: "Baseline (no intervention)", color: "#F5A623", points: projectionQuery.data.points.map((p) => p.baseline), dashed: true },
                  { label: "Projected with §479 pipeline", color: "#4C7A3B", points: projectionQuery.data.points.map((p) => p.projected) },
                ]}
                yLabel="inmates"
              />
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="display m-0 text-base font-bold text-navy">Backlog breakdown</h2>
        {backlogQuery.isLoading || !backlogQuery.data ? (
          <Spinner />
        ) : (
          (() => {
            const b = backlogQuery.data;
            const eligiblePct = b.totalPrisoners ? (b.eligibleButUnprocessed / b.totalPrisoners) * 100 : 0;
            return (
              <>
                <div className="mt-3 flex h-9 overflow-hidden rounded-lg border border-slate-200">
                  <div
                    className="flex items-center justify-center bg-amber-400 text-xs font-bold text-amber-950"
                    style={{ width: `${eligiblePct}%` }}
                  >
                    {b.eligibleButUnprocessed > 0 ? `${b.eligibleButUnprocessed}` : ""}
                  </div>
                  <div
                    className="flex flex-1 items-center justify-center bg-slate-300 text-xs font-bold text-slate-700"
                    style={{ width: `${100 - eligiblePct}%` }}
                  >
                    {b.genuineCapacityLoad}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                    Eligible but unprocessed — paperwork could free these beds now:{" "}
                    <strong>{b.eligibleButUnprocessed}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
                    Genuine capacity load: <strong>{b.genuineCapacityLoad}</strong>
                  </span>
                </div>
              </>
            );
          })()
        )}
      </section>
    </div>
  );
}

