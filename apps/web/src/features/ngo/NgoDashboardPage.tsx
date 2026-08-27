import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JobApplicationDto,
  JobApplicationStatus,
  JobPostingDto,
  JobStatus,
  NgoStatsDto,
} from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

const STATUS_PILL: Record<JobStatus, string> = {
  active: "rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-0.5 text-xs font-extrabold inline-block",
  paused: "rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-3 py-0.5 text-xs font-extrabold inline-block",
  closed: "rounded-full bg-gray-100 text-gray-700 border border-gray-300 px-3 py-0.5 text-xs font-extrabold inline-block",
};

const APP_STATUS_PILL: Record<JobApplicationStatus, string> = {
  pending: "rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-3 py-0.5 text-xs font-bold inline-block",
  shortlisted: "rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-3 py-0.5 text-xs font-bold inline-block",
  hired: "rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-0.5 text-xs font-bold inline-block",
  rejected: "rounded-full bg-red-100 text-red-800 border border-red-200 px-3 py-0.5 text-xs font-bold inline-block",
};

const DEFAULT_CANONICAL_SKILLS = [
  "Single Needle Lockstitch",
  "Overlock Machine",
  "Pattern Cutting",
  "Baking & Oven Operation",
  "Pastry Decoration",
  "Food Hygiene & Safety",
  "Organic Farming & Composting",
  "Drip Irrigation Setup",
  "Pesticide Application",
  "Electrical Wiring & Testing",
  "Circuit Repair",
  "Solar Panel Installation",
  "Forklift Operation",
  "Inventory Barcoding",
  "Packaging & Palletizing",
  "Quality Inspection",
  "Workplace Communication & Teamwork",
  "Financial Literacy & Bank Account Operations",
  "Digital Literacy & Online Job Search",
  "Entrepreneurship Basics & Udyam Registration",
];

function apiOriginUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  return `${origin}${relative}`;
}

export default function NgoDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [postOpen, setPostOpen] = useState(false);
  const [applicantsJob, setApplicantsJob] = useState<JobPostingDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const allowed =
    !!user && (user.role === "ngo_partner" || user.role === "super_admin");

  const statsQuery = useQuery({
    queryKey: ["ngo-stats"],
    queryFn: async () => {
      const res = await api.get<{ data: NgoStatsDto }>("/ngo/stats");
      return res.data.data;
    },
    enabled: allowed,
    refetchOnMount: "always",
  });

  const jobsQuery = useQuery({
    queryKey: ["ngo-jobs"],
    queryFn: async () => {
      const res = await api.get<{ data: JobPostingDto[] }>("/ngo/jobs");
      return res.data.data;
    },
    enabled: allowed,
    refetchOnMount: "always",
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { jobId: string; status: JobStatus }) => {
      await api.patch(`/ngo/jobs/${vars.jobId}`, { status: vars.status });
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["ngo-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["ngo-stats"] });
    },
    onError: (e) => setActionError(extractApiError(e).message),
  });

  if (!allowed) {
    return <EmptyState icon="🔒" title="NGO partners only" body="Sign in with an NGO partner account to view this dashboard." />;
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-7">
      {/* Sunset Terracotta Header Banner */}
      <section className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#B71C1C_0%,#D9531E_40%,#F57C00_80%,#FFE0B2_100%)] p-7 sm:p-9 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="mb-2 inline-block rounded-full bg-white/20 px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-white backdrop-blur-md">
              Rehabilitation &amp; Employer Portal
            </span>
            <h1 className="display text-3xl font-extrabold sm:text-4xl text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              NGO employer dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-sm sm:text-base font-medium text-[#FFF3E4]">
              Post vacancies for rehabilitation candidates and review applications forwarded by jail staff.
            </p>
          </div>
          <button
            onClick={() => setPostOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-navy shadow-lg transition hover:bg-[#FFF3E4] hover:scale-105"
          >
            ＋ Post a job
          </button>
        </div>
      </section>

      {/* Mini Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "Active jobs", v: stats?.activeJobs ?? "–", badge: "Live", color: "text-emerald-700" },
          { k: "Paused", v: stats?.pausedJobs ?? "–", badge: "Hold", color: "text-amber-700" },
          { k: "Closed", v: stats?.closedJobs ?? "–", badge: "Done", color: "text-bodytext" },
          { k: "Total applications", v: stats?.totalApplications ?? "–", badge: "Total", color: "text-navy" },
          { k: "Pending review", v: stats?.pendingApplications ?? "–", badge: "Review", color: "text-terracotta" },
          { k: "Shortlisted", v: stats?.shortlistedApplications ?? "–", badge: "Stars", color: "text-emerald-700" },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-[20px] border-[2px] border-[#f0e4d3] bg-white p-5 shadow-sm transition hover:border-terracotta/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-bodytext">{s.k}</span>
              <span className="rounded-md bg-[#FAF7F2] px-1.5 py-0.5 text-[10px] font-extrabold text-navy">
                {s.badge}
              </span>
            </div>
            <p className={`mt-2 font-mono text-3xl font-extrabold ${s.color}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      {jobsQuery.isLoading ? (
        <Spinner label="Loading jobs…" />
      ) : jobsQuery.isError ? (
        <ErrorBanner message={extractApiError(jobsQuery.error).message} />
      ) : !jobsQuery.data || jobsQuery.data.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No jobs posted yet"
          body="Use “Post a job” to publish your first vacancy."
        />
      ) : (
        <section className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-6 sm:p-7 shadow-xl">
          <div className="mb-4 flex items-center justify-between border-b border-[#eee4d6] pb-4">
            <h2 className="display text-xl font-bold text-navy">Job Vacancies &amp; Candidates</h2>
            <span className="text-xs font-bold text-bodytext">
              Total {jobsQuery.data.length} vacancies
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-[#eee4d6] bg-[#FAF7F2]">
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">Title</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">Category</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">District</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">Wage</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">Status</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold uppercase tracking-wider text-navy">Candidates in pipeline</th>
                  <th className="py-3 px-4 text-right text-[11px] font-extrabold uppercase tracking-wider text-navy">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f6f1e7]">
                {jobsQuery.data.map((j) => (
                  <tr key={j.id} className="transition hover:bg-[#FFFBF7]">
                    <td className="py-3.5 px-4">
                      <p className="m-0 font-bold text-navy">{j.title}</p>
                      <p className="m-0 text-[11px] text-bodytext">{formatDate(j.createdAt)}</p>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-navy">{j.jobCategory || "—"}</td>
                    <td className="py-3.5 px-4 text-xs font-medium text-navy">{j.district || "—"}</td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-navy">{j.wageInfo || "—"}</td>
                    <td className="py-3.5 px-4">
                      <span className={STATUS_PILL[j.status]}>{j.status}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => setApplicantsJob(j)}
                        className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-sm font-bold text-terracotta hover:underline"
                        title="Review applicants"
                      >
                        {(j.applicationCount ?? 0) > 0 ? (
                          <>
                            <span className="rounded-md bg-terracotta/10 px-2 py-0.5">{j.applicationCount}</span>
                            <span className="text-[11px] uppercase tracking-wide font-extrabold">review →</span>
                          </>
                        ) : (
                          <span className="text-bodytext/60">0 candidates</span>
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {j.status !== "active" && (
                          <button
                            onClick={() => setStatus.mutate({ jobId: j.id, status: "active" })}
                            disabled={setStatus.isPending}
                            className="btn btn-primary btn-sm"
                          >
                            Activate
                          </button>
                        )}
                        {j.status === "active" && (
                          <button
                            onClick={() => setStatus.mutate({ jobId: j.id, status: "paused" })}
                            disabled={setStatus.isPending}
                            className="btn btn-outline btn-sm"
                          >
                            Pause
                          </button>
                        )}
                        {j.status !== "closed" && (
                          <button
                            onClick={() => setStatus.mutate({ jobId: j.id, status: "closed" })}
                            disabled={setStatus.isPending}
                            className="btn btn-ghost btn-sm text-red-700"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 border-t border-[#f6f1e7] pt-3 text-xs text-bodytext flex flex-wrap items-center justify-between gap-2">
            <span>
              Pipeline summary:{" "}
              <strong className="text-navy">pending {stats?.pendingApplications ?? 0}</strong> · shortlisted {stats?.shortlistedApplications ?? 0} · total applications {stats?.totalApplications ?? 0}
            </span>
            <span className="font-semibold text-terracotta">✨ Auto-matched by Section 479 Skill Recommender</span>
          </div>
        </section>
      )}

      {postOpen && (
        <PostJobModal
          onClose={() => setPostOpen(false)}
          onCreated={() => {
            setPostOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["ngo-jobs"] });
            void queryClient.invalidateQueries({ queryKey: ["ngo-stats"] });
          }}
        />
      )}

      {applicantsJob && (
        <ApplicantsReview job={applicantsJob} onClose={() => setApplicantsJob(null)} />
      )}
    </div>
  );
}

/* ============================ Applicant review ============================ */

function ApplicantsReview({ job, onClose }: { job: JobPostingDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | JobApplicationStatus>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["job-applicants", job.id],
    queryFn: async () => {
      const res = await api.get<{ data: JobApplicationDto[] }>(`/ngo/jobs/${job.id}/applications`);
      return res.data.data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: JobApplicationStatus }) => {
      await api.patch(`/ngo/applications/${vars.id}/status`, { status: vars.status });
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["job-applicants", job.id] });
      void queryClient.invalidateQueries({ queryKey: ["ngo-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["ngo-jobs"] });
    },
    onError: (e) => setActionError(extractApiError(e).message),
  });

  const rows = query.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.prisonerName.toLowerCase().includes(q) ||
      r.prisonerRegNo.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,15,10,0.5)] p-4 py-8">
      <div className="w-full max-w-4xl space-y-4 rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#eee4d6] pb-4">
          <div>
            <h2 className="display m-0 text-2xl font-bold text-navy">Candidate pipeline</h2>
            <p className="mb-0 mt-0.5 text-sm text-bodytext">
              {job.title} · {job.district || "—"} · {job.wageInfo || "wage on request"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg bg-[#FAF7F2] px-3 py-1 text-lg font-bold text-navy hover:bg-peach">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "pending", "shortlisted", "hired", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-full border px-3.5 py-1 text-xs font-bold capitalize transition ${
                filter === f
                  ? "border-terracotta bg-peach text-terracotta shadow-sm"
                  : "border-[#e9e0d1] bg-white text-bodytext hover:border-saffron"
              }`}
            >
              {f} ({counts[f] ?? 0})
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or reg no…"
            className="input-base ml-auto h-9 w-52 py-1 text-xs rounded-xl"
          />
        </div>

        {actionError && <ErrorBanner message={actionError} />}

        {query.isLoading ? (
          <Spinner label="Loading candidates…" />
        ) : query.isError ? (
          <ErrorBanner message={extractApiError(query.error).message} />
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-bodytext">
            {rows.length === 0
              ? "No applications yet for this role."
              : "No candidates match this filter."}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((a) => (
              <ApplicantCard
                key={a.id}
                app={a}
                expanded={expandedId === a.id}
                onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                onStatus={(status) => setStatus.mutate({ id: a.id, status })}
                busy={setStatus.isPending}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end border-t border-[#f0e4d3] pt-4">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicantCard({
  app,
  expanded,
  onToggle,
  onStatus,
  busy,
}: {
  app: JobApplicationDto;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: JobApplicationStatus) => void;
  busy: boolean;
}) {
  const completed = app.training.filter((t) => t.status === "completed");
  const ongoing = app.training.filter((t) => t.status !== "completed");

  return (
    <div className={`rounded-2xl border bg-white p-4.5 transition ${app.status === "rejected" ? "opacity-70" : ""} ${expanded ? "border-terracotta ring-2 ring-terracotta/20 shadow-md" : "border-[#f1e6d5]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onToggle} className="cursor-pointer text-left">
          <p className="display m-0 text-base font-bold text-navy hover:text-terracotta">
            {expanded ? "▾" : "▸"} {app.prisonerName}
          </p>
          <p className="m-0 mt-0.5 font-mono text-xs text-bodytext">
            {app.prisonerRegNo} · applied {formatDate(app.appliedAt)}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={APP_STATUS_PILL[app.status]}>{app.status}</span>
          {app.status !== "shortlisted" && app.status !== "hired" && (
            <button onClick={() => onStatus("shortlisted")} disabled={busy} className="btn btn-outline btn-sm !px-3 !py-1 !text-xs">
              ★ Shortlist
            </button>
          )}
          {app.status !== "hired" && (
            <button onClick={() => onStatus("hired")} disabled={busy} className="btn btn-primary btn-sm !px-3 !py-1 !text-xs">
              ✓ Hire
            </button>
          )}
          {app.status !== "rejected" && (
            <button onClick={() => onStatus("rejected")} disabled={busy} className="btn btn-ghost btn-sm !px-3 !py-1 !text-xs !text-red-700">
              ✕ Reject
            </button>
          )}
          {app.status !== "pending" && (
            <button onClick={() => onStatus("pending")} disabled={busy} className="cursor-pointer text-xs font-semibold text-bodytext underline ml-1">
              reset
            </button>
          )}
        </div>
      </div>

      {!expanded ? (
        <p className="m-0 mt-2 truncate text-xs text-bodytext">
          {completed.length > 0
            ? `Certified: ${completed.map((t) => t.program).join(", ")}`
            : "No certified training on record yet"}
          {app.educationBaseline ? ` · Education: ${app.educationBaseline}` : ""}
        </p>
      ) : (
        <div className="mt-4 space-y-4 border-t border-[#f6f1e7] pt-4">
          <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Info label="Previous education"><strong className="text-navy">{app.educationBaseline ?? "Not recorded"}</strong></Info>
            <Info label="Target work domain">{app.targetDomain ?? "—"}</Info>
            <Info label="Machinery handling">
              {app.machinerySkills ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {app.machinerySkills.split(/[|,]/).map((m) => m.trim()).filter(Boolean).map((m) => (
                    <span key={m} className="rounded bg-peach/50 px-2 py-0.5 text-xs font-semibold text-[#8a4a1c]">{m}</span>
                  ))}
                </div>
              ) : "—"}
            </Info>
            <Info label="Verified skills (completed)">
              {app.skills.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {app.skills.map((s) => (
                    <span key={s} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-300">{s}</span>
                  ))}
                </div>
              ) : "None on record"}
            </Info>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-navy">Digital Skill Passport · certificates</p>
            {completed.length === 0 ? (
              <p className="m-0 text-xs text-bodytext">No certificates issued yet.</p>
            ) : (
              <ul className="space-y-2">
                {completed.map((t) => (
                  <li key={t.program} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/70 border border-emerald-200 px-3.5 py-2.5">
                    <div>
                      <p className="m-0 text-[13.5px] font-bold text-navy">{t.program}</p>
                      <p className="m-0 text-xs text-bodytext">
                        {t.category} · completed {t.completedAt ? formatDate(t.completedAt) : "—"}
                      </p>
                    </div>
                    {t.certificateUrl && (
                      <a
                        href={apiOriginUrl(t.certificateUrl)!}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline btn-sm !px-3 !py-1 !text-xs"
                      >
                        View certificate ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ongoing.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-navy">Training in progress</p>
              <div className="space-y-2">
                {ongoing.map((t) => (
                  <div key={t.program}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-navy">{t.program} <span className="font-normal text-bodytext">({t.category})</span></span>
                      <span className="font-mono text-bodytext">{t.progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#f1ece1]">
                      <div className="h-full rounded-full bg-saffron transition-all" style={{ width: `${Math.min(100, t.progressPct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-peach bg-[#FFF6EC] p-4 text-xs text-[#8a4a1c]">
            <p className="m-0 font-bold text-sm">To coordinate interviews or day-release paperwork</p>
            <p className="m-0 mt-1 text-xs sm:text-sm">
              Contact {app.jailName}{app.jailDistrict ? ` (${app.jailDistrict})` : ""} rehabilitation staff
              {app.jailPhone ? (
                <>
                  {" — "}📞 <a href={`tel:${app.jailPhone}`} className="font-bold text-terracotta underline">{app.jailPhone}</a>
                </>
              ) : (
                " — phone number not on file; raise it at the next DLSA review"
              )}
            </p>
            <p className="m-0 mt-1.5 text-[11px] opacity-80">
              All candidate contact is mediated by prison staff. RIHAI SETU never shares direct prisoner contact details.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-bodytext">{label}</p>
      <div className="text-[13.5px] text-bodytext">{children}</div>
    </div>
  );
}

/* ============================ Skill picker ============================ */

function SkillPicker({
  label,
  required,
  options,
  selected,
  onChange,
}: {
  label: string;
  required?: boolean;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (skill: string) =>
    onChange(
      selected.includes(skill)
        ? selected.filter((s) => s !== skill)
        : [...selected, skill],
    );

  return (
    <div className="sm:col-span-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="block text-xs font-bold text-navy">{label}{required ? " *" : ""}</span>
        {selected.map((s) => (
          <span key={s} className="rounded-full bg-peach px-2.5 py-0.5 text-[11px] font-bold text-terracotta">{s}</span>
        ))}
      </div>
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-[#f1e6d5] bg-[#FBF9F5] p-2.5">
        {options.length === 0 && (
          <span className="px-1 text-xs text-bodytext">Loading skill catalog…</span>
        )}
        {options.map((skill) => (
          <label
            key={skill}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
              selected.includes(skill)
                ? "border-terracotta bg-peach text-terracotta shadow-sm"
                : "border-[#e9e0d1] bg-white text-navy hover:border-saffron"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selected.includes(skill)}
              onChange={() => toggle(skill)}
            />
            {skill}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ============================ Post job modal ============================ */

function PostJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    district: "",
    jobCategory: "",
    minExperienceMonths: 0,
    openings: 1,
    wageInfo: "",
    certificatesRaw: "",
  });
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [preferredSkills, setPreferredSkills] = useState<string[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["skills-catalog"],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: { canonical_skills?: string[] } }>("/skills/catalog");
        const list = res.data?.data?.canonical_skills ?? (res.data as any)?.canonical_skills;
        return list && list.length > 0 ? list : DEFAULT_CANONICAL_SKILLS;
      } catch {
        return DEFAULT_CANONICAL_SKILLS;
      }
    },
    initialData: DEFAULT_CANONICAL_SKILLS,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post("/ngo/jobs", {
        title: form.title,
        ...(form.description ? { description: form.description } : {}),
        requiredSkills,
        ...(preferredSkills.length ? { preferredSkills } : {}),
        ...(form.certificatesRaw.trim()
          ? {
              requiredCertificates: form.certificatesRaw
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean),
            }
          : {}),
        minExperienceMonths: Number(form.minExperienceMonths) || 0,
        ...(form.jobCategory ? { jobCategory: form.jobCategory } : {}),
        ...(form.district ? { district: form.district } : {}),
        openings: Number(form.openings),
        ...(form.wageInfo ? { wageInfo: form.wageInfo } : {}),
      });
    },
    onSuccess: onCreated,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (requiredSkills.length === 0) return;
    mutation.mutate();
  };

  const inputCls = "input-base rounded-xl border-[#EBE3D7] bg-[#FAF7F2] px-4 py-2.5 text-sm text-navy focus:border-terracotta focus:bg-white";
  const labelCls = "mb-1.5 block text-xs font-bold text-navy";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,15,10,0.5)] p-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl space-y-4 rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-6 sm:p-8 shadow-2xl"
      >
        <div className="mhead flex items-center justify-between border-b border-[#eee4d6] pb-4">
          <h2 className="display m-0 text-2xl font-bold text-navy">Post a job vacancy</h2>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg bg-[#FAF7F2] px-3 py-1 text-lg font-bold text-navy hover:bg-peach">
            ✕
          </button>
        </div>

        {mutation.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800">
            {extractApiError(mutation.error).message}
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Job title *</label>
            <input
              required
              minLength={3}
              maxLength={140}
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Description</label>
            <textarea
              rows={3}
              maxLength={4000}
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>District</label>
            <input
              className={inputCls}
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Job category</label>
            <input
              className={inputCls}
              placeholder="textile, bakery, logistics…"
              value={form.jobCategory}
              onChange={(e) => setForm({ ...form, jobCategory: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Min experience (months)</label>
            <input
              type="number"
              min={0}
              max={480}
              className={inputCls}
              value={form.minExperienceMonths}
              onChange={(e) => setForm({ ...form, minExperienceMonths: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelCls}>Openings</label>
            <input
              type="number"
              min={0}
              max={9999}
              className={inputCls}
              value={form.openings}
              onChange={(e) => setForm({ ...form, openings: Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Wage info</label>
            <input
              className={inputCls}
              placeholder="₹15,000–18,000/month"
              value={form.wageInfo}
              onChange={(e) => setForm({ ...form, wageInfo: e.target.value })}
            />
          </div>
          <SkillPicker
            label="Required skills"
            required
            options={catalogQuery.data ?? []}
            selected={requiredSkills}
            onChange={setRequiredSkills}
          />
          <SkillPicker
            label="Preferred skills"
            options={catalogQuery.data ?? []}
            selected={preferredSkills}
            onChange={setPreferredSkills}
          />
          <div className="sm:col-span-2">
            <label className={labelCls}>Required certificates (comma-separated)</label>
            <input
              className={inputCls}
              placeholder="Food Safety, ITI Certificate"
              value={form.certificatesRaw}
              onChange={(e) => setForm({ ...form, certificatesRaw: e.target.value })}
            />
          </div>
        </div>

        <p className="rounded-xl border border-peach bg-[#FFF6EC] p-3 text-xs text-[#8a4a1c]">
          Skill tags come from the canonical AI vocabulary so the recommender can rank this job accurately.
        </p>

        <div className="modal-actions flex flex-wrap justify-end gap-2.5 pt-2">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || requiredSkills.length === 0}
            className="btn btn-primary disabled:opacity-60"
          >
            {mutation.isPending ? "Publishing…" : "Publish job"}
          </button>
        </div>
      </form>
    </div>
  );
}
