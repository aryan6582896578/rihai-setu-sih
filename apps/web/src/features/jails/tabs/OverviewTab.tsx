import type { ActivityItem } from "@rihai/shared-types";
import { useLang } from "../../../lib/i18n";

export default function OverviewTab({ activity }: { activity: ActivityItem[] }) {
  const { t } = useLang();
  return (
    <section className="panel">
      <h3 className="display m-0 text-base font-bold text-navy">{t("recent.h")}</h3>
      <p className="sub mb-0 text-[13px] text-bodytext">{t("recent.sub")}</p>
      {activity.length === 0 ? (
        <p className="py-8 text-center text-sm text-bodytext">{t("recent.none")}</p>
      ) : (
        <ul className="mt-2">
          {activity.map((item, i) => (
            <li key={`${item.kind}-${item.prisonerId}-${i}`} className="flex items-start gap-3 border-b border-[#f2ece2] py-3 last:border-none">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  item.kind === "new_admission" ? "bg-emerald-500" : "bg-blue-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-heading">
                  <span className="font-semibold">{item.prisonerName}</span> — {item.detail}
                </p>
                <time className="mt-0.5 block text-[11.5px] text-bodytext">
                  {new Date(item.at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
