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
        icon="🔒"
        title="Super admin only"
        body="The cross-jail rollup aggregates every facility and is restricted to system administrators."
        action={<Link to="/jails" className="crumb">← Back to your jails</Link>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1.5">Cross-jail overcrowding rollup</h1>
        <p className="lede">
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

          <section className="panel !mt-0">
            <h2 className="display m-0 text-base font-bold text-navy">30-day projection — all jails combined</h2>
            <div className="mt-3">
              <LineChart
                series={[
                  {
                    label: "Baseline sum",
                    color: "#F5A623",
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
                    color: "#4C7A3B",
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

          <div className="panel-tight overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Jail</th>
                  <th>Location</th>
                  <th>Occupancy</th>
                  <th>% capacity</th>
                  <th>Eligible unprocessed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {query.data.jails.map((j) => (
                  <tr key={j.jailId} className="clickable">
                    <td className="font-semibold text-navy">{j.name}</td>
                    <td className="text-bodytext">
                      {j.district}, {j.state}
                    </td>
                    <td className="text-bodytext">
                      {j.occupancy}/{j.sanctionedCapacity}
                    </td>
                    <td className="font-semibold">{j.capacityPct}%</td>
                    <td>
                      <span className="pill-warn">{j.eligibleButUnprocessed}</span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => navigate(`/jails/${j.jailId}/overcrowding`)}
                        className="btn btn-outline btn-sm whitespace-nowrap"
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
