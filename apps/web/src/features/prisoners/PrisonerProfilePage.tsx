import { useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApplicationStage,
  STAGE_ORDER,
  type ApplicationDto,
  type PrisonerDetail,
  type TrainingProgramDto,
} from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, formatDateTime, STAGE_LABELS, eligibilityBadge } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

const EDITOR_ROLES = ["super_admin", "jail_superintendent", "jail_staff"];
const ADVANCE_ROLES = [...EDITOR_ROLES, "dlsa_lawyer"];
const REVIEW_ROLES = ["super_admin", "jail_superintendent", "dlsa_lawyer"];

function apiOriginUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  return `${origin}${relative}`;
}

export default function PrisonerProfilePage() {
  const { prisonerId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["prisoner", prisonerId],
    queryFn: async () => {
      const res = await api.get<{ data: PrisonerDetail }>(`/prisoners/${prisonerId}`);
      return res.data.data;
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["prisoner", prisonerId] });

  if (query.isLoading) return <Spinner label="Loading profile…" />;
  if (query.isError)
    return (
      <div className="space-y-3">
        <ErrorBanner message={extractApiError(query.error).message} />
        <Link to=".." className="text-sm text-blue-700 hover:underline">
          ← Back
        </Link>
      </div>
    );

  const detail = query.data!;
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);

  return (
    <div className="space-y-6">
      <ProfileHeader detail={detail} canEdit={canEdit} onChanged={refresh} />

      <nav className="flex flex-wrap gap-2 text-xs">
        {[
          ["#personal", "Personal"],
          ["#case", "Case details"],
          ["#eligibility", "§479 eligibility"],
          ["#application", "Application progress"],
          ["#skills", "Skill Passport"],
          ["#notes", "Notes"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full bg-slate-200/70 px-3 py-1 font-medium text-slate-600 hover:bg-slate-300/70">
            {label}
          </a>
        ))}
      </nav>

      <PersonalSection detail={detail} canEdit={canEdit} onChanged={refresh} />
      <EligibilityPanel detail={detail} canEdit={canEdit} onChanged={refresh} />
      <CaseSection detail={detail} canEdit={canEdit} onChanged={refresh} />
      <ApplicationProgressCard detail={detail} onChanged={refresh} />
      <SkillPassportPanel detail={detail} canEdit={canEdit} onChanged={refresh} />
      <NotesPanel detail={detail} canEdit={!!user && user.role !== "viewer"} onChanged={refresh} />
    </div>
  );
}

function ProfileHeader({
  detail,
  canEdit,
  onChanged,
}: {
  detail: PrisonerDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      await api.post(`/prisoners/${detail.id}/photo`, fd);
    },
    onSuccess: () => {
      setUploadError(null);
      onChanged();
    },
    onError: (e) => setUploadError(extractApiError(e).message),
  });

  const badge = eligibilityBadge(detail.eligibility?.status ?? "pending");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="personal">
      <Link to=".." className="text-sm text-slate-500 hover:text-slate-700">
        ← All prisoners
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <label className={canEdit ? "group relative cursor-pointer" : ""}>
          {detail.photoUrl ? (
            <img
              src={apiOriginUrl(detail.photoUrl)!}
              alt={detail.fullName}
              className="h-20 w-20 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-800">
              {detail.fullName.slice(0, 1)}
            </span>
          )}
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                {upload.isPending ? "…" : "Change"}
              </span>
            </>
          )}
        </label>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{detail.fullName}</h1>
          <p className="text-sm text-slate-500">
            Reg no <span className="font-mono">{detail.prisonerRegNo}</span> ·{" "}
            {formatDate(detail.admissionDate)} admission · {detail.gender}
          </p>
          {uploadError && <p className="mt-1 text-xs text-red-700">{uploadError}</p>}
        </div>
        <span className={`ml-auto inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${badge.cls}`}>
          §479: {badge.label}
        </span>
      </div>
    </div>
  );
}

function PersonalSection({ detail }: { detail: PrisonerDetail; canEdit: boolean; onChanged: () => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Personal information</h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {[
          ["Date of birth", formatDate(detail.dateOfBirth)],
          ["Gender", detail.gender],
          ["Admission date", formatDate(detail.admissionDate)],
          ["Registration no", detail.prisonerRegNo],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EligibilityPanel({
  detail,
  canEdit,
  onChanged,
}: {
  detail: PrisonerDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const recompute = useMutation({
    mutationFn: async () => {
      await api.post(`/prisoners/${detail.id}/eligibility/recompute`);
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const a = detail.eligibility;
  const badge = eligibilityBadge(a?.status ?? "pending");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="eligibility">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Section 479 eligibility</h2>
        {canEdit && (
          <button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
          >
            {recompute.isPending ? "Recomputing…" : "Recompute"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badge.cls}`}>
          {badge.label}
        </span>
        <p className="text-sm text-slate-700">{a?.reason ?? "Not yet assessed."}</p>
      </div>
      <p className="mt-2 text-xs text-slate-400">Last computed: {formatDateTime(a?.computedAt)}</p>
    </section>
  );
}

function CaseSection({ detail, canEdit, onChanged }: { detail: PrisonerDetail; canEdit: boolean; onChanged: () => void }) {
  const primary = detail.cases.find((c) => c.id === detail.primaryCaseId) ?? detail.cases[0];
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() =>
    primary
      ? {
          caseNumber: primary.caseNumber,
          courtName: primary.courtName,
          offence: primary.offence,
          maxSentenceYears: primary.maxSentenceYears,
          pendingCaseCount: primary.pendingCaseCount,
          custodyStartDate: primary.custodyStartDate.slice(0, 10),
          carriesDeathOrLife: primary.carriesDeathOrLife,
          isFirstTimeOffender: primary.isFirstTimeOffender,
        }
      : null,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!primary || !form) return;
      await api.patch(`/prisoners/${detail.id}/case/${primary.id}`, form);
    },
    onSuccess: () => {
      setError(null);
      setEditing(false);
      onChanged();
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  if (!primary || !form) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="case">
        <h2 className="font-semibold text-slate-900">Case details</h2>
        <p className="mt-2 text-sm text-slate-500">No case record on file.</p>
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none";
  const labelCls = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="case">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Case details</h2>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {[
            ["Case number", primary.caseNumber],
            ["CNR number", primary.cnrNumber ?? "-"],
            ["Court", primary.courtName],
            ["Offence", primary.offence],
            ["Max sentence", `${primary.maxSentenceYears} yr`],
            ["Other pending cases", String(primary.pendingCaseCount)],
            ["Custody start", formatDate(primary.custodyStartDate)],
            [
              "Flags",
              [
                primary.carriesDeathOrLife && "Death/life",
                primary.isFirstTimeOffender && "First-timer",
              ]
                .filter(Boolean)
                .join(", ") || "—",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          {error && <ErrorBanner message={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Case number</label>
              <input className={inputCls} value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Court</label>
              <input className={inputCls} value={form.courtName} onChange={(e) => setForm({ ...form, courtName: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Offence</label>
              <input className={inputCls} value={form.offence} onChange={(e) => setForm({ ...form, offence: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Max sentence (years)</label>
              <input type="number" min={0} max={50} className={inputCls} value={form.maxSentenceYears} onChange={(e) => setForm({ ...form, maxSentenceYears: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Other pending cases</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.pendingCaseCount} onChange={(e) => setForm({ ...form, pendingCaseCount: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Custody start date</label>
              <input type="date" className={inputCls} value={form.custodyStartDate} onChange={(e) => setForm({ ...form, custodyStartDate: e.target.value })} />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.carriesDeathOrLife} onChange={(e) => setForm({ ...form, carriesDeathOrLife: e.target.checked })} /> Death / life
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isFirstTimeOffender} onChange={(e) => setForm({ ...form, isFirstTimeOffender: e.target.checked })} /> First-timer
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-500">Saving triggers an automatic §479 eligibility recomputation.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {save.isPending ? "Saving…" : "Save & recompute"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
              Cancel
            </button>
          </div>
        </form>
      )}

      {detail.cases.length > 1 && (
        <p className="mt-3 text-xs text-slate-400">{detail.cases.length - 1} other case record(s) also on file.</p>
      )}
    </section>
  );
}

function ApplicationProgressCard({ detail, onChanged }: { detail: PrisonerDetail; onChanged: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const active = detail.applications.find(
    (a) => a.stage !== ApplicationStage.Released,
  ) ?? detail.applications[0];

  const invalidate = () => {
    setError(null);
    onChanged();
  };

  const openApp = useMutation({
    mutationFn: async () => {
      await api.post(`/prisoners/${detail.id}/applications`, {});
    },
    onSuccess: invalidate,
    onError: (e) => setError(extractApiError(e).message),
  });

  const advance = useMutation({
    mutationFn: async (vars: { app: ApplicationDto; next: ApplicationStage }) => {
      await api.patch(`/applications/${vars.app.id}/stage`, { stage: vars.next });
    },
    onSuccess: invalidate,
    onError: (e) => setError(extractApiError(e).message),
  });

  const review = useMutation({
    mutationFn: async (app: ApplicationDto) => {
      await api.post(`/applications/${app.id}/review`);
    },
    onSuccess: invalidate,
    onError: (e) => setError(extractApiError(e).message),
  });

  const [previewBusy, setPreviewBusy] = useState(false);
  const openPreview = async (applicationId: string) => {
    setPreviewBusy(true);
    try {
      const res = await api.get(`/applications/${applicationId}/document`, {
        responseType: "text",
        transformResponse: [(d) => d],
      });
      const blob = new Blob([res.data as string], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const canAdvance = !!user && ADVANCE_ROLES.includes(user.role);
  const canReview = !!user && REVIEW_ROLES.includes(user.role);

  let nextStage: ApplicationStage | null = null;
  if (active) {
    const idx = STAGE_ORDER.indexOf(active.stage);
    nextStage = idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="application">
      <h2 className="font-semibold text-slate-900">Application progress</h2>
      {error && <div className="mt-2"><ErrorBanner message={error} /></div>}

      {!active ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">No application opened yet.</p>
          {canAdvance && (
            <button onClick={() => openApp.mutate()} disabled={openApp.isPending} className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50">
              Open application (flagged)
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="mt-4 flex flex-col gap-0 sm:flex-row sm:items-start">
            {STAGE_ORDER.map((stage, i) => {
              const date = active.stageHistory?.[stage]?.at;
              const currentIdx = STAGE_ORDER.indexOf(active.stage);
              const done = i < currentIdx || (!!date && i === currentIdx);
              const isCurrent = i === currentIdx;
              return (
                <li key={stage} className="flex flex-1 items-center sm:flex-col sm:items-stretch">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent ? "bg-blue-700 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                  }`}>
                    {done && !isCurrent ? "✓" : i + 1}
                  </div>
                  {i < STAGE_ORDER.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 ${i < currentIdx ? "bg-emerald-500" : "bg-slate-200"}`} />
                  )}
                  <div className="ml-2 sm:ml-0 sm:mt-1.5 sm:text-center">
                    <p className={`text-xs font-semibold ${isCurrent ? "text-blue-800" : done ? "text-emerald-700" : "text-slate-400"}`}>
                      {STAGE_LABELS[stage]}
                    </p>
                    {date && <p className="text-[10px] text-slate-400">{formatDate(date)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              {active.type === "personal_bond" ? "Personal bond" : "Bail"} application · updated {formatDateTime(active.updatedAt)}
            </span>
            {active.reviewedByName ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                Reviewed by {active.reviewedByName}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                Not yet reviewed
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => void openPreview(active.id)}
                disabled={previewBusy}
                className="rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-60"
              >
                {previewBusy ? "Opening…" : "Task preview ↗"}
              </button>
              {active.generatedDocumentUrl && (
                <a
                  href={apiOriginUrl(active.generatedDocumentUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Formal draft document ↗
                </a>
              )}
              {canReview && !active.reviewedByName &&
                STAGE_ORDER.indexOf(active.stage) < STAGE_ORDER.indexOf(ApplicationStage.Filed) && (
                  <button onClick={() => review.mutate(active)} disabled={review.isPending} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    Mark reviewed
                  </button>
                )}
              {canAdvance && nextStage && (
                <button
                  onClick={() => advance.mutate({ app: active, next: nextStage })}
                  disabled={advance.isPending}
                  title={
                    nextStage === ApplicationStage.Filed && !active.reviewedByName
                      ? "Requires review by DLSA lawyer first"
                      : undefined
                  }
                  className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  Advance to {STAGE_LABELS[nextStage]}
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Stage log — who did what</p>
            <ul className="space-y-1.5">
              {STAGE_ORDER.map((stage) => {
                const h = active.stageHistory?.[stage];
                const currentIdx = STAGE_ORDER.indexOf(active.stage);
                const idx = STAGE_ORDER.indexOf(stage);
                const isCurrent = idx === currentIdx;
                const done = !!h || idx < currentIdx;
                return (
                  <li
                    key={stage}
                    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 text-sm ${
                      isCurrent ? "bg-blue-50/70" : done ? "bg-emerald-50/40" : "bg-slate-50/60"
                    }`}
                  >
                    <span className={`font-medium ${isCurrent ? "text-blue-900" : done ? "text-emerald-800" : "text-slate-400"}`}>
                      {done && !isCurrent ? "✓ " : isCurrent ? "● " : "●‹ "}
                      {STAGE_LABELS[stage]}
                      {isCurrent && <span className="ml-1 text-[10px] font-bold uppercase text-blue-700">current</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      {h?.byName && (
                        <span>
                          by <strong className="font-semibold text-slate-700">{h.byName}</strong>
                        </span>
                      )}
                      {h?.note && <span className="italic text-slate-400">{h.note}</span>}
                      {h ? (
                        <span>{formatDateTime(h.at)}</span>
                      ) : (
                        <span className="text-slate-300">not yet reached</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {nextStage === ApplicationStage.Filed && !active.reviewedByName && (
            <p className="mt-2 text-xs text-orange-700">
              Filing is blocked until a DLSA lawyer or superintendent marks this draft reviewed.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SkillPassportPanel({ detail, canEdit, onChanged }: { detail: PrisonerDetail; canEdit: boolean; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");

  const programsQuery = useQuery({
    queryKey: ["training-programs"],
    queryFn: async () => {
      const res = await api.get<{ data: TrainingProgramDto[] }>("/training-programs");
      return res.data.data;
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      await api.post(`/prisoners/${detail.id}/enrollments`, { programId });
    },
    onSuccess: () => {
      setError(null);
      setProgramId("");
      onChanged();
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; progressPct?: number; markComplete?: boolean }) => {
      await api.patch(`/enrollments/${vars.id}`, {
        ...(vars.progressPct !== undefined ? { progressPct: vars.progressPct } : {}),
        ...(vars.markComplete !== undefined ? { markComplete: vars.markComplete } : {}),
      });
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="skills">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Skill Passport</h2>
          <p className="text-xs text-slate-400">
            Vocational training record that follows the individual after release
          </p>
        </div>
        {canEdit && programsQuery.data && programsQuery.data.length > 0 && (
          <div className="flex gap-2">
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              <option value="">Pick a program…</option>
              {programsQuery.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category})
                </option>
              ))}
            </select>
            <button
              onClick={() => enroll.mutate()}
              disabled={!programId || enroll.isPending}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
            >
              + Enroll
            </button>
          </div>
        )}
      </div>

      {detail.enrollments.length > 0 && (
        <SkillSummary enrollments={detail.enrollments} />
      )}

      {error && <div className="mt-2"><ErrorBanner message={error} /></div>}

      {detail.enrollments.length === 0 ? (
        <EmptyState
          title="No training enrollments yet"
          body={canEdit ? "Enroll this person in a program to start building their passport." : "Enrollments will appear here once staff add them."}
        />
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {detail.enrollments.map((e) => (
            <SkillCard key={e.id} enrollment={e} canEdit={canEdit} busy={update.isPending} onSave={update.mutate} />
          ))}
        </div>
      )}
    </section>
  );

  function SkillSummary({ enrollments }: { enrollments: PrisonerDetail["enrollments"] }) {
    const completed = enrollments.filter((e) => e.status === "completed").length;
    const inProgress = enrollments.filter((e) => e.status === "in_progress").length;
    const avg = Math.round(
      enrollments.reduce((sum, e) => sum + e.progressPct, 0) / enrollments.length,
    );
    const chips = [
      { label: "completed", value: completed, cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
      { label: "in progress", value: inProgress, cls: "bg-blue-50 text-blue-800 border-blue-200" },
      {
        label: "enrolled",
        value: enrollments.filter((e) => e.status === "enrolled").length,
        cls: "bg-slate-50 text-slate-600 border-slate-200",
      },
      { label: "avg progress", value: `${avg}%`, cls: "bg-indigo-50 text-indigo-800 border-indigo-200" },
    ];
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c.label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${c.cls}`}>
            {c.value} {c.label}
          </span>
        ))}
      </div>
    );
  }

  function SkillCard({
    enrollment,
    canEdit,
    busy,
    onSave,
  }: {
    enrollment: PrisonerDetail["enrollments"][number];
    canEdit: boolean;
    busy: boolean;
    onSave: (vars: { id: string; progressPct?: number; markComplete?: boolean }) => void;
  }) {
    const e = enrollment;
    const [draftPct, setDraftPct] = useState(e.progressPct);
    const pct = e.status === "completed" ? 100 : draftPct;

    const accent =
      e.status === "completed" ? "border-l-emerald-500" : e.status === "in_progress" ? "border-l-blue-500" : "border-l-slate-300";
    const pillCls =
      e.status === "completed"
        ? "bg-emerald-100 text-emerald-800"
        : e.status === "in_progress"
          ? "bg-blue-100 text-blue-800"
          : "bg-slate-100 text-slate-600";
    const barColor = e.status === "completed" ? "bg-emerald-500" : e.status === "in_progress" ? "bg-blue-600" : "bg-slate-400";

    return (
      <div className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm transition hover:shadow-md ${accent}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{e.program.name}</p>
            <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {e.program.category}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillCls}`}>
              {e.status.replace("_", " ")}
            </span>
            {e.certificateUrl && (
              <a
                href={apiOriginUrl(e.certificateUrl)!}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
              >
                Certificate
              </a>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-11 text-right text-sm font-bold tabular-nums text-slate-700">{pct}%</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 pt-2.5 text-xs text-slate-400">
          <span>
            {e.completedAt ? `Completed ${formatDate(e.completedAt)}` : e.status === "in_progress" ? "Underway" : "Not started yet"}
          </span>
          {canEdit && e.status !== "completed" && (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={draftPct}
                onChange={(ev) => setDraftPct(Number(ev.target.value))}
                onMouseUp={() => draftPct !== e.progressPct && onSave({ id: e.id, progressPct: draftPct })}
                onTouchEnd={() => draftPct !== e.progressPct && onSave({ id: e.id, progressPct: draftPct })}
                className="h-1.5 w-32 cursor-pointer accent-blue-600"
              />
              <button
                onClick={() => onSave({ id: e.id, markComplete: true })}
                disabled={busy}
                className="rounded-md border border-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
              >
                Mark complete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}

function NotesPanel({ detail, canEdit, onChanged }: { detail: PrisonerDetail; canEdit: boolean; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      await api.post(`/prisoners/${detail.id}/notes`, { body });
    },
    onSuccess: () => {
      setBody("");
      onChanged();
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" id="notes">
      <h2 className="font-semibold text-slate-900">Notes & activity log</h2>
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an observation…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
          <button type="submit" disabled={add.isPending || !body.trim()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            Add note
          </button>
        </form>
      )}
      {detail.notes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No notes recorded.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {detail.notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-800">{n.body}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {n.authorName} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

