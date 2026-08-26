import { useQuery } from "@tanstack/react-query";
import type { PortalProfileDto } from "@rihai/shared-types";
import { STAGE_ORDER, ApplicationStage } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { Spinner, EmptyState, ErrorBanner } from "../../components/ui";
import { formatDate } from "../../lib/format";

const STAGE_PLAIN: Record<ApplicationStage, string> = {
  [ApplicationStage.Flagged]: "Flagged for help",
  [ApplicationStage.Drafted]: "Papers being prepared",
  [ApplicationStage.Filed]: "Filed in court",
  [ApplicationStage.HearingScheduled]: "Hearing date fixed",
  [ApplicationStage.OrderPassed]: "Court order passed",
  [ApplicationStage.Released]: "Released",
};

export default function PortalProfilePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: PortalProfileDto }>("/portal/profile");
      return res.data.data;
    },
  });

  if (isLoading) return <Spinner label="Loading your profile…" />;
  if (isError) return <ErrorBanner message={extractMsg(error)} />;
  if (!data) return null;

  const activeApps = [...data.applications].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const latest = activeApps[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Prisoner portal · read-only</p>
        <h1 className="page-title">{data.fullName}</h1>
        <p className="lede">
          Reg no <span className="font-mono font-bold text-navy">{data.prisonerRegNo}</span> ·{" "}
          {data.jailName}, {data.jailDistrict}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="mini-stat">
          <span className="k">Time in custody</span>
          <span className="v">{data.custodyDurationLabel}</span>
          <span className="sub">Since {formatDate(data.admissionDate)}</span>
        </div>
        <div className={`mini-stat ${data.eligibility.status === "eligible" ? "" : "warn-border"}`}>
          <span className="k">Section 479 check</span>
          <span className="v">{data.eligibility.headline}</span>
          <span className="sub">Checked nightly by the system</span>
        </div>
        <div className="mini-stat">
          <span className="k">Case applications</span>
          <span className="v">{data.applications.length}</span>
          <span className="sub">Handled with DLSA lawyers</span>
        </div>
      </div>

      <section className="panel">
        <h2 className="display mb-1 text-base font-bold text-navy">What Section 479 means for you</h2>
        <p
          className={`pill mt-2 inline-flex ${
            data.eligibility.status === "eligible"
              ? "pill-ok"
              : data.eligibility.status === "not_eligible"
                ? "pill-warn"
                : "pill-neutral"
          }`}
        >
          {statusPill(data.eligibility.status)}
        </p>
        <p className="mt-3 max-w-3xl text-[14.5px] leading-relaxed text-bodytext">
          {data.eligibility.plainReason}
        </p>
        {data.eligibility.computedAt && (
          <p className="mt-2 text-xs text-bodytext">Last checked: {formatDate(data.eligibility.computedAt)}</p>
        )}
        <p className="info-note mt-4">
          This is only a screening. The court — never this system — decides every release.
        </p>
      </section>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">Your application progress</h2>
        {!latest ? (
          <EmptyState
            icon="📄"
            title="No application yet"
            body="When the legal team starts your release paperwork it will appear here step by step."
          />
        ) : (
          <>
            <ol className="mt-5 flex flex-col gap-0 sm:flex-row sm:items-start">
              {STAGE_ORDER.map((stage, i) => {
                const currentIdx = STAGE_ORDER.indexOf(latest.stage);
                const done = i < currentIdx;
                const isCurrent = i === currentIdx;
                const date = latest.stageHistory?.[stage]?.at;
                return (
                  <li key={stage} className="flex flex-1 items-center sm:flex-col sm:items-stretch">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-xs font-extrabold ${
                        done || isCurrent ? "bg-terracotta text-white" : "bg-[#ece2d3] text-bodytext"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    {i < STAGE_ORDER.length - 1 && (
                      <div className={`mx-2 h-0.5 flex-1 ${i < currentIdx ? "bg-terracotta/60" : "bg-[#ece2d3]"}`} />
                    )}
                    <div className="ml-2 sm:ml-0 sm:mt-2 sm:text-center">
                      <p className={`text-xs font-bold ${isCurrent || done ? "text-terracotta" : "text-bodytext"}`}>
                        {STAGE_PLAIN[stage]}
                      </p>
                      {date && <p className="text-[10.5px] text-[#a7adb6]">{formatDate(date)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-5 space-y-2">
              {activeApps.map((app) => (
                <div
                  key={app.id}
                  className="app-status-row flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[#FBF9F5] px-4 py-3"
                >
                  <span className="text-sm font-bold text-navy">
                    {app.type === "personal_bond" ? "Personal bond" : "Bail application"}
                  </span>
                  <span className={`pill ${app.stage === ApplicationStage.Released ? "pill-ok" : "pill-neutral"}`}>
                    {STAGE_PLAIN[app.stage]}
                  </span>
                  <span className="text-xs text-bodytext">Updated {formatDate(app.updatedAt)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <p className="text-center text-xs text-bodytext">
        Everything on this page is read-only. Corrections are made by jail staff — ask at the welfare desk.
      </p>
    </div>
  );
}

function statusPill(status: string): string {
  switch (status) {
    case "eligible":
      return "May qualify — papers can be prepared";
    case "not_eligible":
      return "Not yet eligible";
    case "excluded":
      return "Not covered by this scheme";
    default:
      return "Awaiting first check";
  }
}

function extractMsg(err: unknown): string {
  const anyErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return anyErr?.response?.data?.error?.message ?? anyErr?.message ?? "Could not load your profile.";
}
