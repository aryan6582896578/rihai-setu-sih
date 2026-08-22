import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ProjectionPoint } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
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
  const [days, setDays] = useState<30 | 60 | 90>(30);

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
        <Link to={`/jails/${jailId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Jail portal
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Overcrowding intelligence — {state.jail.name}
            </h1>
            <p className="text-sm text-slate-500">
              Deterministic date-math projections from live eligibility data. No black boxes.
            </p>
          </div>
          <OccupancyBadge pct={state.capacityPct} />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Current state &amp; 30-day trend</h2>
          <p className="text-xs text-slate-400">Snapshots written nightly at 02:00</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Occupancy", `${state.occupancy}/${state.sanctionedCapacity}`],
            ["% of capacity", `${state.capacityPct}%`],
            [over > 0 ? "Over by" : "Headroom", `${Math.abs(over)} beds`],
            ["Undertrials", String(state.undertrialCount)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{k}</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <LineChart
            series={[{ label: "Actual occupancy (past 30 snapshots)", color: "#1d4ed8", points: state.trend.map((t) => t.occupancy) }]}
            yLabel="inmates"
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Forward projection</h2>
          <div className="flex gap-1">
            {([30, 60, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  days === d ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {projectionQuery.isLoading || !projectionQuery.data ? (
          <Spinner />
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-700">Expected releases ({days}d)</p>
                <p className="mt-0.5 text-lg font-semibold text-emerald-900">
                  {projectionQuery.data.expectedReleasesInWindow}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg admissions/day</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">
                  {projectionQuery.data.dailyAdmissionRate}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-blue-700">Pipeline relief vs baseline</p>
                <p className="mt-0.5 text-lg font-semibold text-blue-900">
                  -{(projectionQuery.data.points.at(-1)?.baseline ?? 0) - (projectionQuery.data.points.at(-1)?.projected ?? 0)} beds
                </p>
              </div>
            </div>
            <div className="mt-3">
              <LineChart
                series={[
                  { label: "Baseline (no intervention)", color: "#f59e0b", points: projectionQuery.data.points.map((p) => p.baseline), dashed: true },
                  { label: "Projected with §479 pipeline", color: "#059669", points: projectionQuery.data.points.map((p) => p.projected) },
                ]}
                yLabel="inmates"
              />
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Backlog breakdown</h2>
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

