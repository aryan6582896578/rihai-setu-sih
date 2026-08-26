import { useQuery } from "@tanstack/react-query";
import type { PortalDocumentDto } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { Spinner, EmptyState, ErrorBanner } from "../../components/ui";
import { formatDate } from "../../lib/format";

function apiOriginUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  return `${origin}${relative}`;
}

export default function PortalDocumentsPage() {
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
        <p className="kicker">Prisoner portal</p>
        <h1 className="page-title">Certificates &amp; documents</h1>
        <p className="lede">
          Your Skill Passport certificates and copies of court paperwork that has been filed and
          checked by a lawyer.
        </p>
      </div>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">Skill Passport certificates</h2>
        {certificates.length === 0 ? (
          <EmptyState icon="🎓" title="No certificates yet" body="Complete a training program to earn your first certificate." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {certificates.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="display mb-4 text-base font-bold text-navy">Application documents</h2>
        {applications.length === 0 ? (
          <EmptyState
            icon="📁"
            title="Nothing here yet"
            body="Once your release papers are filed in court and reviewed by a lawyer, a copy appears here. Drafts stay private until then."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {applications.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocCard({ doc }: { doc: PortalDocumentDto }) {
  const url = apiOriginUrl(doc.url);
  return (
    <li className="rounded-card border border-[#f1e6d5] bg-white p-5 transition hover:border-saffron">
      <span className={`pill ${doc.kind === "skill_certificate" ? "pill-ok" : "pill-neutral"} mb-2 inline-flex`}>
        {doc.kind === "skill_certificate" ? "Certificate" : "Court document"}
      </span>
      <p className="display text-[15px] font-bold text-navy">{doc.title}</p>
      <p className="mt-0.5 text-xs capitalize text-bodytext">{doc.detail}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-bodytext">{formatDate(doc.issuedAt)}</span>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            Open ↗
          </a>
        )}
      </div>
    </li>
  );
}

function extractMsg(err: unknown): string {
  const anyErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return anyErr?.response?.data?.error?.message ?? anyErr?.message ?? "Could not load documents.";
}
