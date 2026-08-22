import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Paginated } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import type { JailListItem } from "@rihai/shared-types";
import { EmptyState, ErrorBanner, OccupancyBadge, Spinner } from "../../components/ui";

export default function JailsPage() {
  const query = useQuery({
    queryKey: ["jails"],
    queryFn: async () => {
      const res = await api.get<Paginated<JailListItem>>("/jails");
      return res.data;
    },
  });

  if (query.isLoading) return <Spinner label="Loading jails…" />;

  if (query.isError) {
    return <ErrorBanner message={extractApiError(query.error).message} />;
  }

  const jails = query.data?.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your jails</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facilities you have access to. Click a jail to open its portal.
          </p>
        </div>
      </div>

      {jails.length === 0 ? (
        <EmptyState
          title="No jail access assigned — contact your administrator"
          body="Your account currently has no JailAccess rows, so there is nothing to show here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jails.map((jail) => (
            <Link
              key={jail.id}
              to={`/jails/${jail.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900 group-hover:text-blue-800">{jail.name}</h2>
                  <p className="text-sm text-slate-500">
                    {jail.district}, {jail.state}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                  {jail.code}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <OccupancyBadge pct={jail.occupancyPct} />
                <span className="text-xs text-slate-500">
                  {jail.currentCount}/{jail.sanctionedCapacity} inmates
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Undertrials</span>
                <span className="font-semibold text-blue-800">{jail.undertrialCount}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
