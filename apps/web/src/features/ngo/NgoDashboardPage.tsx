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
  active: "pill-ok",
  paused: "pill-warn",
  closed: "pill-full",
};

const APP_STATUS_PILL: Record<JobApplicationStatus, string> = {
  pending: "pill-neutral",
  shortlisted: "pill-warn",
  hired: "pill-ok",
  rejected: "pill-full",
};

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title m-0">NGO employer dashboard</h1>
          <p className="lede mb-0">
            Post vacancies for rehabilitation candidates and review applications forwarded by jail staff.
          </p>
        </div>
        <button onClick={() => setPostOpen(true)} className="btn btn-primary">
          ＋ Post a job
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "Active jobs", v: stats?.activeJobs ?? "–" },
          { k: "Paused", v: stats?.pausedJobs ?? "–" },
          { k: "Closed", v: stats?.closedJobs ?? "–" },
          { k: "Total applications", v: stats?.totalApplications ?? "–" },
          { k: "Pending review", v: stats?.pendingApplications ?? "–" },
          { k: "Shortlisted", v: stats?.shortlistedApplications ?? "–" },
        ].map((s) => (
          <div key={s.k} className="mini-stat">
            <p className="k">{s.k}</p>
            <p className="v">{s.v}</p>
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
        <section className="panel-tight overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>District</th>
                <th>Wage</th>
                <th>Status</th>
                <th>Candidates in pipeline</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobsQuery.data.map((j) => (
                <tr key={j.id}>
                  <td>
                    <p className="m-0 font-semibold text-navy">{j.title}</p>
                    <p className="m-0 text-[11px] text-bodytext">{formatDate(j.createdAt)}</p>
                  </td>
                  <td>{j.jobCategory || "—"}</td>
                  <td>{j.district || "—"}</td>
                  <td className="text-xs">{j.wageInfo || "—"}</td>
                  <td>
                    <span className={STATUS_PILL[j.status]}>{j.status}</span>
                  </td>
                  <td>
                    <button
                      onClick={() => setApplicantsJob(j)}
                      className="inline-flex cursor-pointer items-center gap-1 font-mono text-sm font-bold text-terracotta hover:underline"
                      title="Review applicants"
                    >
                      {(j.applicationCount ?? 0) > 0 ? (
                        <>
                          {j.applicationCount}
                          <span className="text-[10px] uppercase tracking-wide">review →</span>
                        </>
                      ) : (
                        <span className="text-bodytext/60">0</span>
                      )}
                    </button>
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
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
                          className="btn btn-ghost btn-sm"
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
          <p className="border-t border-[#f6f1e7] px-4 py-3 text-xs text-bodytext">
            Pipeline —{" "}
            <span className="font-semibold text-navy">pending {stats?.pendingApplications ?? 0}</span>{" "}
            · shortlisted {stats?.shortlistedApplications ?? 0} · total applications {stats?.totalApplications ?? 0}
          </p>
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
      <div className="w-full max-w-4xl space-y-4 rounded-card bg-white p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="display m-0 text-[1.35rem] font-bold text-navy">Candidate pipeline</h2>
            <p className="mb-0 mt-0.5 text-sm text-bodytext">
              {job.title} · {job.district || "—"} · {job.wageInfo || "wage on request"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer bg-transparent text-xl text-bodytext hover:text-navy">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["all", "pending", "shortlisted", "hired", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold capitalize transition ${
                filter === f
                  ? "border-terracotta bg-peach text-terracotta"
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
            className="input-base ml-auto h-9 w-48 py-1 text-xs"
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
    <div className={`rounded-xl border bg-white p-4 transition ${app.status === "rejected" ? "opacity-70" : ""} ${expanded ? "border-saffron shadow-sm" : "border-[#f1e6d5]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onToggle} className="cursor-pointer text-left">
          <p className="display m-0 text-sm font-bold text-navy hover:text-terracotta">
            {expanded ? "▾" : "▸"} {app.prisonerName}
          </p>
          <p className="m-0 mt-0.5 font-mono text-[11px] text-bodytext">
            {app.prisonerRegNo} · applied {formatDate(app.appliedAt)}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={APP_STATUS_PILL[app.status]}>{app.status}</span>
          {app.status !== "shortlisted" && app.status !== "hired" && (
            <button onClick={() => onStatus("shortlisted")} disabled={busy} className="btn btn-outline btn-sm !px-2.5 !py-1 !text-[11px]">
              ★ Shortlist
            </button>
          )}
          {app.status !== "hired" && (
            <button onClick={() => onStatus("hired")} disabled={busy} className="btn btn-primary btn-sm !px-2.5 !py-1 !text-[11px]">
              ✓ Hire
            </button>
          )}
          {app.status !== "rejected" && (
            <button onClick={() => onStatus("rejected")} disabled={busy} className="btn btn-ghost btn-sm !px-2.5 !py-1 !text-[11px] !text-red-700">
              ✕ Reject
            </button>
          )}
          {app.status !== "pending" && (
            <button onClick={() => onStatus("pending")} disabled={busy} className="cursor-pointer text-[10px] font-semibold text-bodytext underline">
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
        <div className="mt-3 space-y-4 border-t border-[#f6f1e7] pt-3">
          {/* Education & background */}
          <div className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Info label="Previous education"><strong className="text-heading">{app.educationBaseline ?? "Not recorded"}</strong></Info>
            <Info label="Target work domain">{app.targetDomain ?? "—"}</Info>
            <Info label="Machinery handling">
              {app.machinerySkills ? (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {app.machinerySkills.split(/[|,]/).map((m) => m.trim()).filter(Boolean).map((m) => (
                    <span key={m} className="rounded bg-peach/50 px-1.5 py-0.5 text-[11px] font-semibold text-[#8a4a1c]">{m}</span>
                  ))}
                </div>
              ) : "—"}
            </Info>
            <Info label="Verified skills (completed)">
              {app.skills.length > 0 ? (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {app.skills.map((s) => (
                    <span key={s} className="pill-ok !px-2 !py-0.5 !text-[10.5px]">{s}</span>
                  ))}
                </div>
              ) : "None on record"}
            </Info>
          </div>

          {/* Digital Skill Passport — certificates */}
          <div>
            <p className="kicker mb-1.5">Digital Skill Passport · certificates</p>
            {completed.length === 0 ? (
              <p className="m-0 text-xs text-bodytext">No certificates issued yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {completed.map((t) => (
                  <li key={t.program} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50/60 px-3 py-2">
                    <div>
                      <p className="m-0 text-[13px] font-semibold text-navy">{t.program}</p>
                      <p className="m-0 text-[11px] text-bodytext">
                        {t.category} · completed {t.completedAt ? formatDate(t.completedAt) : "—"}
                      </p>
                    </div>
                    {t.certificateUrl && (
                      <a
                        href={apiOriginUrl(t.certificateUrl)!}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline btn-sm !px-2.5 !py-1 !text-[11px]"
                      >
                        View certificate ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Training in progress */}
          {ongoing.length > 0 && (
            <div>
              <p className="kicker mb-1.5">Training in progress</p>
              <div className="space-y-2">
                {ongoing.map((t) => (
                  <div key={t.program}>
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className="font-semibold text-navy">{t.program} <span className="font-normal text-bodytext">({t.category})</span></span>
                      <span className="font-mono text-bodytext">{t.progressPct}%</span>
                    </div>
                    <div className="h-1.5 rounded bg-[#f1ece1]">
                      <div className="h-full rounded bg-saffron" style={{ width: `${Math.min(100, t.progressPct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact via jail staff */}
          <div className="info-note !bg-[#FFF6EC]">
            <p className="m-0 font-bold">To coordinate interviews or day-release paperwork</p>
            <p className="m-0 mt-1 text-[13px]">
              Contact {app.jailName}{app.jailDistrict ? ` (${app.jailDistrict})` : ""} rehabilitation staff
              {app.jailPhone ? (
                <>
                  {" — "}📞 <a href={`tel:${app.jailPhone}`} className="font-bold text-terracotta underline">{app.jailPhone}</a>
                </>
              ) : (
                " — phone number not on file; raise it at the next DLSA review"
              )}
            </p>
            <p className="m-0 mt-1 text-[11px] opacity-80">
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
      <p className="m-0 mb-0.5 text-[11px] font-bold uppercase tracking-wide text-bodytext">{label}</p>
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
          <span key={s} className="pill-neutral">{s}</span>
        ))}
      </div>
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-[#f1e6d5] bg-[#FBF9F5] p-2">
        {options.length === 0 && (
          <span className="px-1 text-xs text-bodytext">Loading skill catalog…</span>
        )}
        {options.map((skill) => (
          <label
            key={skill}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${
              selected.includes(skill)
                ? "border-terracotta bg-peach text-terracotta"
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
      const res = await api.get<{ data: { canonical_skills: string[] } }>("/skills/catalog");
      return res.data.data.canonical_skills;
    },
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

  const inputCls = "input-base";
  const labelCls = "mb-1.5 block text-xs font-bold text-navy";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,15,10,0.5)] p-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <div className="mhead flex items-center justify-between">
          <h2 className="display m-0 text-[1.35rem] font-bold text-navy">Post a job</h2>
          <button type="button" onClick={onClose} className="cursor-pointer bg-transparent text-xl text-bodytext hover:text-navy">
            ✕
          </button>
        </div>

        {mutation.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {extractApiError(mutation.error).message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
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

        <p className="info-note">
          Skill tags come from the canonical AI vocabulary so the recommender can rank this job accurately.
        </p>

        <div className="modal-actions flex flex-wrap justify-end gap-2.5">
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
