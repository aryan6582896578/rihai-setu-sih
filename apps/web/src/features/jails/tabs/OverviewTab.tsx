import type { ActivityItem } from "@rihai/shared-types";

export default function OverviewTab({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-900">Recent activity</h2>
        <p className="text-xs text-slate-500">Latest application stage changes and admissions</p>
      </div>
      {activity.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {activity.map((item, i) => (
            <li key={`${item.kind}-${item.prisonerId}-${i}`} className="flex items-start gap-3 px-5 py-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  item.kind === "new_admission" ? "bg-emerald-500" : "bg-blue-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{item.prisonerName}</span> — {item.detail}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(item.at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
