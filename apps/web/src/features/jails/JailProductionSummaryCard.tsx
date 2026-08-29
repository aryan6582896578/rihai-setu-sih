import { useQuery } from "@tanstack/react-query";
import type { JailProductionSummaryDto } from "@rihai/shared-types";
import { api } from "../../lib/api";

export default function JailProductionSummaryCard({ jailId }: { jailId: string }) {
  const query = useQuery({
    queryKey: ["jail-production-summary", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: JailProductionSummaryDto }>(`/jails/${jailId}/production-summary`);
      return res.data.data;
    },
  });

  if (!query.data) return null;
  const s = query.data;

  return (
    <div className="mini-stat border border-peach/60 bg-gradient-to-br from-[#FFF9F3] via-white to-[#FAF4EC] p-4 shadow-sm col-span-1 sm:col-span-3 mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="rounded-full bg-peach/80 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-terracotta">
            In-Custody Production & Kara Bazaar Linkage
          </span>
          <p className="v mt-1 text-xl font-extrabold text-navy">
            {s.totalItemsThisQuarter} items produced this quarter
          </p>
          <p className="sub text-xs text-bodytext mt-0.5">
            Est. turnover value: <b className="font-mono text-terracotta">₹{s.totalEstimatedValue.toLocaleString("en-IN")}</b> · {s.listedOnKaraBazaarCount} items onboarded to Kara Bazaar
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(s.byCategory).map(([cat, count]) => (
            <span key={cat} className="code-chip text-[11px]">
              {cat}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
