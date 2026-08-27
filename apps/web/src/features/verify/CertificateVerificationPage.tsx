import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, extractApiError } from "../../lib/api";
import { ErrorBanner, Spinner } from "../../components/ui";

interface VerifiedCert {
  valid: boolean;
  certificateCode: string;
  enrollmentId: string;
  prisonerName: string;
  prisonerRegNo: string;
  gender: string;
  jailName: string;
  jailDistrict: string;
  jailState: string;
  jailCode: string;
  programName: string;
  category: string;
  completedAt: string;
  verificationUrl: string;
  certificateUrl: string | null;
}

export default function CertificateVerificationPage() {
  const { id = "" } = useParams();
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ["verify-certificate", id],
    queryFn: async () => {
      const res = await api.get<{ data: VerifiedCert }>(`/verify/certificate/${id}`);
      return res.data.data;
    },
    enabled: Boolean(id),
  });

  const apiOriginUrl = (relative: string | null | undefined): string | null => {
    if (!relative) return null;
    const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
    return `${origin}${relative}`;
  };

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <Spinner label="Verifying authentic certificate record…" />
      </div>
    );
  }

  if (query.isError || !query.data || !query.data.valid) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-xl space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <h1 className="display text-2xl font-extrabold text-navy">Certificate Unverified</h1>
            <p className="mt-2 text-sm text-bodytext">
              The requested certificate reference (<code className="font-mono text-terracotta">{id}</code>) could not be verified on the official RIHAI SETU register.
            </p>
          </div>
          {query.isError && <ErrorBanner message={extractApiError(query.error).message} />}
          <div>
            <Link to="/" className="btn btn-primary btn-sm">Return to Home Page</Link>
          </div>
        </div>
      </div>
    );
  }

  const cert = query.data;
  const completedDate = new Date(cert.completedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEE4D6] pb-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="display flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-terracotta to-saffron text-base font-extrabold text-white">
              RS
            </span>
            <span className="leading-tight">
              <span className="display block text-lg font-extrabold tracking-tight text-navy">
                RIHAI SETU
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-bodytext">
                Public Certificate Verification
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={handleCopyLink} className="btn btn-outline btn-sm">
              {copied ? "✓ Copied Link" : "Copy Share Link"}
            </button>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Verification Banner */}
        <div className="rounded-card border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-lg">
              ✓
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-wide uppercase text-emerald-950">
                Official Authentic Record
              </p>
              <p className="text-xs text-emerald-800">
                Digitally verified by RIHAI SETU Vocational Skill Passport System
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 font-mono text-xs font-bold text-terracotta border border-peach">
            {cert.certificateCode}
          </span>
        </div>

        {/* Main Certificate Sheet */}
        <div className="relative rounded-card border-2 border-[#D9531E] bg-white p-6 sm:p-10 shadow-xl overflow-hidden text-center space-y-6">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-terracotta via-saffron to-terracotta" />
          
          <div className="flex items-center justify-between text-xs font-semibold text-bodytext uppercase tracking-widest border-b border-[#EEE4D6] pb-3">
            <span>RIHAI SETU &middot; VOCATIONAL REHABILITATION</span>
            <span className="text-terracotta font-mono font-bold">{cert.jailCode}</span>
          </div>

          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-terracotta uppercase mb-1">
              SKILL PASSPORT &middot; CERTIFICATE OF COMPLETION
            </p>
            <h1 className="display text-3xl font-extrabold text-navy sm:text-4xl">
              Certificate of Completion
            </h1>
          </div>

          <p className="text-sm text-bodytext">This document certifies that</p>

          <div>
            <h2 className="display text-3xl font-extrabold text-terracotta tracking-tight">
              {cert.prisonerName}
            </h2>
            <p className="mt-1 text-xs sm:text-sm font-medium text-bodytext">
              Prisoner Reg. No: <strong className="font-mono text-navy">{cert.prisonerRegNo}</strong> &nbsp;&middot;&nbsp; 
              Facility: <strong className="text-navy">{cert.jailName}, {cert.jailDistrict} ({cert.jailState})</strong>
            </p>
          </div>

          <div className="mx-auto h-0.5 w-32 bg-gradient-to-r from-transparent via-saffron to-transparent" />

          <p className="text-sm text-bodytext">
            has successfully completed the certified vocational skill training program
          </p>

          <div className="mx-auto max-w-lg rounded-xl border border-[#EEE4D6] bg-[#FFF6EC] p-5">
            <h3 className="display text-xl font-bold text-navy sm:text-2xl">
              {cert.programName}
            </h3>
            <span className="mt-2 inline-block rounded-full bg-peach px-3 py-1 text-xs font-bold text-terracotta">
              {cert.category}
            </span>
          </div>

          <p className="text-xs text-bodytext">
            Completion Date: <strong>{completedDate}</strong> &nbsp;&middot;&nbsp; 
            Verified by Jail Administration &amp; Skill Development Authority
          </p>

          {/* Footer Details & External Link */}
          <div className="pt-6 border-t border-dashed border-[#EEE4D6] flex flex-wrap items-center justify-between gap-4 text-left text-xs text-bodytext">
            <div>
              <p className="font-bold text-navy">Unique Verification URL:</p>
              <a href={cert.verificationUrl} className="text-terracotta font-mono text-[11px] hover:underline break-all">
                {cert.verificationUrl}
              </a>
            </div>
            {cert.certificateUrl && (
              <a
                href={apiOriginUrl(cert.certificateUrl)!}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm"
              >
                View HTML Source →
              </a>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-bodytext">
          RIHAI SETU &mdash; Official Skill Passport &amp; Public Authenticity Verification System.
        </p>
      </div>
    </div>
  );
}
