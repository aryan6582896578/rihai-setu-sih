import { useQuery } from "@tanstack/react-query";
import type { PortalProfileDto, ProductionSummaryDto } from "@rihai/shared-types";
import { STAGE_ORDER, ApplicationStage } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { Spinner, EmptyState, ErrorBanner } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useLang } from "../../lib/i18n";

export default function PortalProfilePage() {
  const { t } = useLang();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: PortalProfileDto }>("/portal/profile");
      return res.data.data;
    },
  });

  const getStageLabel = (stage: ApplicationStage): string => {
    switch (stage) {
      case ApplicationStage.Flagged: return t("portal.stage.flagged");
      case ApplicationStage.Drafted: return t("portal.stage.drafted");
      case ApplicationStage.Filed: return t("portal.stage.filed");
      case ApplicationStage.HearingScheduled: return t("portal.stage.hearing");
      case ApplicationStage.OrderPassed: return t("portal.stage.order");
      case ApplicationStage.Released: return t("portal.stage.released");
      default: return stage;
    }
  };

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
        <p className="kicker">{t("portal.profile.kicker")}</p>
        <h1 className="page-title">{data.fullName}</h1>
        <p className="lede">
          Reg no <span className="font-mono font-bold text-navy">{data.prisonerRegNo}</span> ·{" "}
          {data.jailName}, {data.jailDistrict}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="mini-stat">
          <p className="k">{t("portal.profile.custody")}</p>
          <p className="v">{data.custodyDurationLabel}</p>
          <p className="sub">{t("portal.profile.since")} {formatDate(data.admissionDate)}</p>
        </div>
        <div className={`mini-stat ${data.eligibility.status === "eligible" ? "" : "warn-border"}`}>
          <p className="k">{t("portal.profile.s479")}</p>
          <p className="v">{data.eligibility.headline}</p>
          <p className="sub">{t("portal.profile.nightly")}</p>
        </div>
        <div className="mini-stat">
          <p className="k">{t("portal.profile.apps")}</p>
          <p className="v">{data.applications.length}</p>
          <p className="sub">{t("portal.profile.dlsahint")}</p>
        </div>
      </div>

      <section className="panel">
        <h2 className="display mb-1 text-base font-bold text-navy">{t("portal.profile.s479title")}</h2>
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
          <p className="mt-2 text-xs text-bodytext">{t("portal.profile.lastchecked")}: {formatDate(data.eligibility.computedAt)}</p>
        )}
        <p className="info-note mt-4">
          {t("portal.profile.disclaimer")}
        </p>
      </section>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">{t("portal.profile.progresstitle")}</h2>
        {!latest ? (
          <EmptyState
            icon="📄"
            title={t("portal.profile.noapp")}
            body={t("portal.profile.noappbody")}
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
                        {getStageLabel(stage)}
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
                    {getStageLabel(app.stage)}
                  </span>
                  <span className="text-xs text-bodytext">Updated {formatDate(app.updatedAt)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <PortalProductionSection />

      <p className="text-center text-xs text-bodytext">
        Everything on this page is read-only. Corrections are made by jail staff — ask at the welfare desk.
      </p>
    </div>
  );
}

function PortalProductionSection() {
  const { data } = useQuery({
    queryKey: ["portal-production"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: ProductionSummaryDto }>("/portal/production");
      return res.data.data;
    },
  });

  if (!data || data.records.length === 0) return null;

  return (
    <section className="panel" id="things-ive-made">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee4d6] pb-3.5 mb-4">
        <div>
          <h2 className="display text-base font-bold text-navy">🎨 Things I've Made (Prison Industries)</h2>
          <p className="text-xs text-bodytext">In-custody vocational work, craft output & Kara Bazaar listings</p>
        </div>
        <span className="code-chip font-bold text-terracotta">{data.totalItems} Items Logged</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.records.map((r) => (
          <div key={r.id} className="rounded-xl border border-[#f0e4d3] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-bold text-navy text-sm">{r.itemName}</h4>
              <span className="code-chip text-[11px]">{r.category}</span>
            </div>
            <p className="mt-1 text-xs text-bodytext">
              Quantity: <b className="text-navy">{r.quantity}</b> · Date: {formatDate(r.producedAt)}
            </p>
            {r.karaBazaarListingStatus === "listed" && (
              <div className="mt-2.5 flex items-center justify-between border-t border-[#f4ede2] pt-2 text-[11px]">
                <span className="pill pill-ok py-0.5 px-2 text-[10px]">Listed on Kara Bazaar</span>
                {r.karaBazaarListingUrl && (
                  <a href={r.karaBazaarListingUrl} target="_blank" rel="noreferrer" className="font-bold text-terracotta hover:underline">
                    View Product ↗
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
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
