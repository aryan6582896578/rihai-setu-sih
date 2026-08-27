import { useQuery } from "@tanstack/react-query";
import type { PortalDocumentDto } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { Spinner, EmptyState, ErrorBanner } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useLang } from "../../lib/i18n";

function apiOriginUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  return `${origin}${relative}`;
}

export default function PortalDocumentsPage() {
  const { t } = useLang();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["portal-documents"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: PortalDocumentDto[] }>("/portal/documents");
      return res.data.data;
    },
  });

  if (isLoading) return <Spinner label="Loading your documents…" />;
  if (isError) return <ErrorBanner message={extractMsg(error)} />;

  const docs = data ?? [];
  const certificates = docs.filter((d) => d.kind === "skill_certificate");
  const applications = docs.filter((d) => d.kind === "application_document");

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">{t("portal.docs.kicker")}</p>
        <h1 className="page-title">{t("portal.docs.title")}</h1>
        <p className="lede">
          {t("portal.docs.lede")}
        </p>
      </div>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">{t("portal.docs.certstitle")}</h2>
        {certificates.length === 0 ? (
          <EmptyState icon="🎓" title={t("portal.docs.nocerts")} body={t("portal.docs.nocertsbody")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {certificates.map((doc) => (
              <DocCard key={doc.id} doc={doc} t={t} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">{t("portal.docs.appstitle")}</h2>
        {applications.length === 0 ? (
          <EmptyState
            icon="📁"
            title={t("portal.docs.noapps")}
            body={t("portal.docs.noappsbody")}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {applications.map((doc) => (
              <DocCard key={doc.id} doc={doc} t={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocCard({ doc, t }: { doc: PortalDocumentDto; t: (key: string) => string }) {
  const isCert = doc.kind === "skill_certificate";
  const targetUrl = isCert ? `/verify/certificate/${doc.id}` : apiOriginUrl(doc.url);

  return (
    <li className="rounded-card border border-[#f1e6d5] bg-white p-5 transition hover:border-saffron flex flex-col justify-between">
      <div>
        <span className={`pill ${isCert ? "pill-ok" : "pill-neutral"} mb-2 inline-flex`}>
          {isCert ? t("portal.docs.certlabel") : t("portal.docs.doclabel")}
        </span>
        <p className="display text-[15px] font-bold text-navy">{doc.title}</p>
        <p className="mt-0.5 text-xs capitalize text-bodytext">{doc.detail}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#f7efe4] pt-3">
        <span className="text-xs text-bodytext">{formatDate(doc.issuedAt)}</span>
        {targetUrl ? (
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm cursor-pointer"
          >
            {t("portal.docs.open")}
          </a>
        ) : (
          <span className="text-xs italic text-bodytext">Pending</span>
        )}
      </div>
    </li>
  );
}

function extractMsg(err: unknown): string {
  const anyErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return anyErr?.response?.data?.error?.message ?? anyErr?.message ?? "Could not load documents.";
}
