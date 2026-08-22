import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { OvercrowdingRollup } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import LineChart from "../../components/LineChart";
import { EmptyState, ErrorBanner, Spinner, StatCard } from "../../components/ui";

export default function RollupPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const query = useQuery({
    enabled: user?.role === "super_admin",
    queryKey: ["overcrowding-rollup"],
    queryFn: async () => {
      const res = await api.get<{ data: OvercrowdingRollup }>("/overcrowding/rollup");
      return res.data.data;
    },
  });

  if (user && user.role !== "super_admin") {
    return (
      <EmptyState
        title="Super admin only"
        body="The cross-jail rollup aggregates every facility and is restricted to system administrators."
        action={
          <Link to="/jails" className="text-sm font-medium text-blue-700 hover:underline">
            ← Back to your jails
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Cross-jail overcrowding rollup
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          State-level view with the forward-projection layer static dashboards lack.
        </p>
      </div>

      {query.isLoading && <Spinner label="Aggregating jails…" />}
      {query.isError && <ErrorBanner message={extractApiError(query.error).message} />}
      {query.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="System occupancy" value={`${query.data.totals.occupancy}/${query.data.totals.sanctionedCapacity}`} />
            <StatCard label="% of capacity" value={`${query.data.totals.capacityPct}%`} tone={query.data.totals.capacityPct > 100 ? "red" : "green"} />
            <StatCard
              label="Eligible but unprocessed"
              value={query.data.totals.eligibleButUnprocessed}
              sub="beds paperwork could free"
              tone="amber"
            />
            <StatCard
              label="30-day pipeline relief"
              value={`-${query.data.projection30.baselineSum - query.data.projection30.projectedSum}`}
              sub="vs no-intervention baseline"
              tone="green"
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">30-day projection — all jails combined</h2>
            <div className="mt-2">
              <LineChart
                series={[
                  {
                    label: "Baseline sum",
                    color: "#f59e0b",
                    points: Array.from({ length: 31 }, (_, i) =>
                      Math.round(
                        (query.data!.projection30.baselineSum * i) / 30 +
                          query.data!.totals.occupancy *
                            (1 - i / 30),
                      ),
                    ),
                  },
                  {
                    label: "Projected sum (with pipeline)",
                    color: "#059669",
                    points: (() => {
                      const start = query.data!.totals.occupancy;
                      const end = query.data!.projection30.projectedSum;
                      return Array.from({ length: 31 }, (_, i) => Math.round(start + ((end - start) * i) / 30));
                    })(),
                  },
                ]}
                yLabel="inmates"
              />
            </div>
          </section>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Jail</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">% capacity</th>
                  <th className="px-4 py-3">Eligible unprocessed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.jails.map((j) => (
                  <tr key={j.jailId} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{j.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {j.district}, {j.state}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {j.occupancy}/{j.sanctionedCapacity}
                    </td>
                    <td className="px-4 py-3 font-semibold">{j.capacityPct}%</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {j.eligibleButUnprocessed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/jails/${j.jailId}/overcrowding`)}
                        className="whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
