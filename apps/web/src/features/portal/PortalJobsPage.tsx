import { EmptyState } from "../../components/ui";
import { useLang } from "../../lib/i18n";

/**
 * Job Board (/portal/jobs) — deliberately a shell for this session (Prompt 10).
 * The personalized recommendation engine is a separate team's work.
 */
export default function PortalJobsPage() {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">{t("portal.jobs.kicker")}</p>
        <h1 className="page-title">{t("portal.jobs.title")}</h1>
        <p className="lede">
          {t("portal.jobs.lede")}
        </p>
      </div>

      <section className="panel">
        <EmptyState
          icon="🧭"
          title={t("portal.jobs.emptytitle")}
          body={t("portal.jobs.emptybody")}
        />
      </section>
    </div>
  );
}
