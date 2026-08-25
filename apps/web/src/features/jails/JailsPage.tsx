import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Paginated } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import type { JailListItem } from "@rihai/shared-types";
import { EmptyState, ErrorBanner, occupancyTone, Spinner } from "../../components/ui";

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
      <div className="page-head-row mb-6 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="page-title mb-1.5">Your jails</h1>
          <p className="lede">Facilities you have access to. Click a jail to open its portal.</p>
        </div>
      </div>

      {jails.length === 0 ? (
        <EmptyState
          icon="🏛️"
          title="No jail access assigned — contact your administrator"
          body="Your account currently has no JailAccess rows, so there is nothing to show here."
        />
      ) : (
        <div className="grid gap-5 pb-14 sm:grid-cols-2 lg:grid-cols-3">
          {jails.map((jail) => {
            const tone = occupancyTone(jail.occupancyPct);
            const pillCls = tone === "red" ? "pill-full" : tone === "amber" ? "pill-warn" : "pill-ok";
            return (
              <Link
                key={jail.id}
                to={`/jails/${jail.id}`}
                className="card-shadow group rounded-card border border-transparent bg-white p-5 transition hover:-translate-y-[3px] hover:border-peach hover:shadow-[0_12px_26px_rgba(27,36,48,0.12)]"
              >
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <h3 className="display m-0 text-base font-bold text-navy group-hover:text-terracotta sm:text-[16.5px]">
                    {jail.name}
                  </h3>
                  <span className="code-chip shrink-0">{jail.code}</span>
                </div>
                <p className="mb-4 text-xs text-bodytext">
                  {jail.district}, {jail.state}
                </p>
                <div className="mb-3 flex items-center justify-between">
                  <span className={pillCls}>{jail.occupancyPct}% capacity</span>
                  <span className="text-xs text-bodytext">
                    {jail.currentCount}/{jail.sanctionedCapacity} inmates
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[#f1ece1] pt-3 text-[13px]">
                  <span className="text-bodytext">Undertrials</span>
                  <b className="display text-[15px] font-bold text-terracotta">{jail.undertrialCount}</b>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
