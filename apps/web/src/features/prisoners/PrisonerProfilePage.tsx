import { useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApplicationStage,
  STAGE_ORDER,
  type ApplicationDto,
  type JobApplicationDto,
  type PrisonerDetail,
  type RecommendationDto,
  type TrainingProgramDto,
} from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, formatDateTime, STAGE_LABELS, eligibilityBadge } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

const EDITOR_ROLES = ["super_admin", "jail_superintendent"];
const ADVANCE_ROLES = ["super_admin", "jail_superintendent", "dlsa_lawyer"];
const REVIEW_ROLES = ["super_admin", "jail_superintendent", "dlsa_lawyer"];

const STAGE_PILLS: Partial<Record<ApplicationStage, string>> = {
  [ApplicationStage.Flagged]: "pill-warn",
  [ApplicationStage.Drafted]: "pill-warn",
  [ApplicationStage.Filed]: "pill-neutral",
  [ApplicationStage.HearingScheduled]: "pill-neutral",
  [ApplicationStage.OrderPassed]: "pill-ok",
  [ApplicationStage.Released]: "pill-ok",
};

function apiOriginUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const origin = import.meta.env.VITE_API_URL?.replace(/\/api\/v1$/, "") ?? "http://localhost:4000";
  return `${origin}${relative}`;
}

export default function PrisonerProfilePage() {
  const { prisonerId = "", jailId = "" } = useParams();
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

  if (user?.role === "dlsa_lawyer") {
    return (
      <div className="space-y-4">
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="display text-lg font-bold text-navy mb-2">Access Restricted</h2>
          <p className="text-sm text-bodytext mb-4">
            DLSA Lawyer accounts are restricted from viewing personal prisoner profiles.
          </p>
          <div className="flex justify-center gap-3">
            <Link to={`/jails/${jailId}/court-tracking`} className="btn btn-primary btn-sm">Court Tracking</Link>
            <Link to={`/jails/${jailId}/legal-aid`} className="btn btn-outline btn-sm">Legal Aid</Link>
          </div>
        </div>
      </div>
    );
  }

  if (query.isLoading) return <Spinner label="Loading profile…" />;
  if (query.isError)
    return (
      <div className="space-y-3">
        <ErrorBanner message={extractApiError(query.error).message} />
        <Link to={`/jails/${jailId}/prisoners`} className="crumb">← All prisoners</Link>
      </div>
    );

  const detail = query.data!;
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);

  return (
    <div className="space-y-5">
      {/* Absolute paths: `to=".."` resolves against the ROUTE hierarchy, and this
          page is a flat leaf route under pathless wrappers — so ".." lands on "/"
          (react-router v7). Never use relative links from this page. */}
      <Link to={`/jails/${jailId}/prisoners`} className="crumb">← All prisoners</Link>
      <ProfileHeader detail={detail} canEdit={canEdit} onChanged={refresh} />

      <nav className="tabpills">
        {[
          ["#personal-info", "Personal"],
          ["#family-alerts", "Family alerts"],
          ["#case", "Case details"],
          ["#eligibility", "§479 eligibility"],
          ["#application", "Application progress"],
          ["#skills", "Skill Passport"],
          ["#notes", "Notes"],
        ].map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      <PersonalSection detail={detail} canEdit={canEdit} onChanged={refresh} />
      <NextOfKinPanel detail={detail} canEdit={canEdit} onChanged={refresh} />
      <EligibilityPanel detail={detail} canEdit={canEdit} onChanged={refresh} />
      <CaseSection detail={detail} canEdit={canEdit} onChanged={refresh} />
      <ApplicationProgressCard detail={detail} onChanged={refresh} />
      <SkillPassportPanel detail={detail} canEdit={canEdit} onChanged={refresh} />
      <RecommendedJobsPanel detail={detail} canEdit={canEdit} />
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
  const [tempPin, setTempPin] = useState<string | null>(null);

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

  const issueTempPin = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { temporaryPin: string } }>(
        `/prisoners/${detail.id}/portal/temp-pin`,
      );
      return res.data.data.temporaryPin;
    },
    onSuccess: (pin) => setTempPin(pin),
    onError: (e) => setUploadError(extractApiError(e).message),
  });

  const badge = eligibilityBadge(detail.eligibility?.status ?? "pending");

  return (
    <div className="panel !mt-0" id="personal">
      <div className="flex flex-wrap items-center gap-4">
        <label className={canEdit ? "group relative cursor-pointer" : ""}>
          {detail.photoUrl ? (
            <img
              src={apiOriginUrl(detail.photoUrl)!}
              alt={detail.fullName}
              className="h-16 w-16 rounded-full border border-[#f1e6d5] object-cover sm:h-[58px] sm:w-[58px]"
            />
          ) : (
            <span className="display flex h-16 w-16 items-center justify-center rounded-full bg-peach text-xl font-extrabold text-terracotta sm:h-[58px] sm:w-[58px] sm:text-[22px]">
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
          <h1 className="display text-xl font-bold text-navy sm:text-[1.4rem]">{detail.fullName}</h1>
          <p className="mt-0.5 text-[13px] text-bodytext">
            Reg no <span className="font-mono">{detail.prisonerRegNo}</span> ·{" "}
            {formatDate(detail.admissionDate)} admission · {detail.gender}
          </p>
          {uploadError && <p className="mt-1 text-xs font-medium text-red-700">{uploadError}</p>}
        </div>
        <span className={`ml-auto ${badge.cls}`}>
          §479: {badge.label}
        </span>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f0e4d3] pt-3">
          <button
            onClick={() => issueTempPin.mutate()}
            disabled={issueTempPin.isPending}
            className="btn btn-outline btn-sm"
            title="One-time PIN for the prisoner portal (/portal/login). The prisoner must change it at next login."
          >
            {issueTempPin.isPending ? "Issuing…" : "Issue portal temp PIN"}
          </button>
          {tempPin && (
            <span className="rounded-lg border border-peach bg-[#FFF6EC] px-3 py-1.5 text-xs font-semibold text-navy">
              One-time PIN: <b className="font-mono">{tempPin}</b> — show once; prisoner changes it on
              next login
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PersonalSection({ detail }: { detail: PrisonerDetail; canEdit: boolean; onChanged: () => void }) {
  return (
    <section className="panel" id="personal-info">
      <h2 className="display m-0 text-base font-bold text-navy">Personal information</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
        {[
          ["Date of birth", formatDate(detail.dateOfBirth)],
          ["Gender", detail.gender],
          ["Admission date", formatDate(detail.admissionDate)],
          ["Registration no", detail.prisonerRegNo],
        ].map(([k, v]) => (
          <div key={k} className="info-field">
            <dt className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-bodytext">{k}</dt>
            <dd className="font-semibold text-heading">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---- Family (next-of-kin) contact + consent for automatic WhatsApp/SMS updates ----

type NextOfKin = {
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  consentGiven: boolean;
  preferredChannel: "sms" | "whatsapp" | null;
  preferredLocale: "en" | "hi" | null;
};

function NextOfKinPanel({
  detail,
  canEdit,
  onChanged,
}: {
  detail: PrisonerDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nextOfKinName: "",
    nextOfKinPhone: "",
    preferredChannel: "whatsapp" as "sms" | "whatsapp",
    preferredLocale: "en" as "en" | "hi",
  });
  const [consentDraft, setConsentDraft] = useState(false);

  const inputCls = "input-base";
  const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-bodytext";

  const nokQuery = useQuery({
    queryKey: ["next-of-kin", detail.id],
    queryFn: async () => {
      const res = await api.get<{ data: NextOfKin }>(`/prisoners/${detail.id}/next-of-kin`);
      return res.data.data;
    },
  });
  const nok = nokQuery.data;

  const startEdit = () => {
    if (nok) {
      setForm({
        nextOfKinName: nok.nextOfKinName ?? "",
        nextOfKinPhone: nok.nextOfKinPhone ?? "",
        preferredChannel: nok.preferredChannel ?? "whatsapp",
        preferredLocale: nok.preferredLocale ?? "en",
      });
      setConsentDraft(nok.consentGiven);
    }
    setError(null);
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      // Backend fields are individually optional — only send the ones filled in.
      await api.patch(`/prisoners/${detail.id}/next-of-kin`, {
        ...(form.nextOfKinName.trim() ? { nextOfKinName: form.nextOfKinName.trim() } : {}),
        ...(form.nextOfKinPhone.trim() ? { nextOfKinPhone: form.nextOfKinPhone.trim() } : {}),
        preferredChannel: form.preferredChannel,
        preferredLocale: form.preferredLocale,
        consentGiven: consentDraft,
      });
    },
    onSuccess: () => {
      setError(null);
      setEditing(false);
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ["next-of-kin", detail.id] });
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  return (
    <section className="panel" id="family-alerts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="display m-0 text-base font-bold text-navy">Family case updates</h2>
          <p className="kicker mb-0 mt-0.5">Automatic WhatsApp/SMS updates to the registered family member</p>
        </div>
        {canEdit && !editing && (
          <button onClick={startEdit} className="btn btn-outline btn-sm">
            {nok?.nextOfKinPhone ? "Edit" : "Add family contact"}
          </button>
        )}
      </div>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="mt-3 space-y-3"
        >
          {error && <ErrorBanner message={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Family member name</label>
              <input
                className={inputCls}
                value={form.nextOfKinName}
                onChange={(e) => setForm({ ...form, nextOfKinName: e.target.value })}
                placeholder="e.g. Sunita Devi"
              />
            </div>
            <div>
              <label className={labelCls}>WhatsApp / SMS number</label>
              <input
                type="tel"
                className={inputCls}
                value={form.nextOfKinPhone}
                onChange={(e) => setForm({ ...form, nextOfKinPhone: e.target.value })}
                placeholder="+91 98765 43210 (E.164)"
              />
            </div>
            <div>
              <label className={labelCls}>Preferred channel</label>
              <select
                className={`${inputCls} bg-white`}
                value={form.preferredChannel}
                onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as "sms" | "whatsapp" })}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Message language</label>
              <select
                className={`${inputCls} bg-white`}
                value={form.preferredLocale}
                onChange={(e) => setForm({ ...form, preferredLocale: e.target.value as "en" | "hi" })}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consentDraft} onChange={(e) => setConsentDraft(e.target.checked)} />
            The family member has consented to receive automatic updates about this prisoner
          </label>
          {!consentDraft && (
            <p className="info-note">Without consent no message is ever sent — updates stay disabled.</p>
          )}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={save.isPending} className="btn btn-primary btn-sm disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-outline btn-sm">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
            {[
              ["Family member", nok?.nextOfKinName ?? "-"],
              ["Phone", nok?.nextOfKinPhone ?? "-"],
              [
                "Preferred channel",
                nok?.preferredChannel === "whatsapp" ? "WhatsApp" : nok?.preferredChannel === "sms" ? "SMS" : "-",
              ],
              ["Language", nok?.preferredLocale === "hi" ? "Hindi" : nok?.preferredLocale === "en" ? "English" : "-"],
            ].map(([k, v]) => (
              <div key={k} className="info-field">
                <dt className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-bodytext">{k}</dt>
                <dd className="font-semibold text-heading">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {nok?.consentGiven ? (
              <span className="pill pill-ok">Consent recorded — updates active</span>
            ) : (
              <span className="pill pill-warn">No consent — updates disabled</span>
            )}
          </div>
          {!nok?.consentGiven && (
            <p className="info-note mt-3">
              Add the family member's number and tick consent — they will then automatically receive
              WhatsApp/SMS updates when an application moves forward, a hearing is scheduled, a skill course is
              completed, or a job application status changes.
            </p>
          )}
        </>
      )}
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
    <section className="panel" id="eligibility">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display m-0 text-base font-bold text-navy">Section 479 eligibility</h2>
        {canEdit && (
          <button
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            className="btn btn-outline btn-sm"
          >
            {recompute.isPending ? "Recomputing…" : "Recompute"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      <div className="eligibility-row mt-4 flex flex-wrap items-center gap-3">
        <span className={`pill ${badge.cls}`}>{badge.label}</span>
        <p className="text-[13.5px] text-bodytext">{a?.reason ?? "Not yet assessed."}</p>
      </div>
      <p className="timestamp-note mt-2.5 text-xs text-[#9aa1ab]">Last computed: {formatDateTime(a?.computedAt)}</p>
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
      <section className="panel" id="case">
        <h2 className="display m-0 text-base font-bold text-navy">Case details</h2>
        <p className="mt-2 text-sm text-bodytext">No case record on file.</p>
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const inputCls = "input-base";
  const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-bodytext";

  return (
    <section className="panel" id="case">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display m-0 text-base font-bold text-navy">Case details</h2>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-outline btn-sm">Edit</button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
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
            <div key={k} className="info-field">
              <dt className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-bodytext">{k}</dt>
              <dd className="font-semibold text-heading">{v}</dd>
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
          <p className="info-note">Saving triggers an automatic §479 eligibility recomputation.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={save.isPending} className="btn btn-primary">
              {save.isPending ? "Saving…" : "Save & recompute"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-outline">Cancel</button>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active =
    detail.applications.find((a) => a.id === selectedId) ??
    detail.applications.find((a) => a.stage !== ApplicationStage.Released) ??
    detail.applications[0];

  // Stage changes reset/shift stall windows and move cases through court, so
  // every dependent view must refetch — not serve stale cache.
  const qc = useQueryClient();
  const invalidate = () => {
    setError(null);
    void qc.invalidateQueries({ queryKey: ["stall-list"] });
    void qc.invalidateQueries({ queryKey: ["jail-stats"] });
    void qc.invalidateQueries({ queryKey: ["court-tracking"] });
    onChanged();
  };

  const openApp = useMutation({
    mutationFn: async () => {
      await api.post(`/prisoners/${detail.id}/applications`, {});
    },
    onSuccess: invalidate,
    onError: (e) => setError(extractApiError(e).message),
  });

  const createDraft = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await api.post<{ data: ApplicationDto }>(`/applications/${applicationId}/generate-draft`);
      return res.data.data;
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
  const canEdit = !!user && EDITOR_ROLES.includes(user.role);

  let nextStage: ApplicationStage | null = null;
  if (active) {
    const idx = STAGE_ORDER.indexOf(active.stage);
    nextStage = idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  }

  return (
    <section className="panel" id="application">
      <h2 className="display m-0 text-base font-bold text-navy">Application progress</h2>
      {error && <div className="mt-2"><ErrorBanner message={error} /></div>}

      {detail.applications.length > 0 && (
        <div className="mt-4">
          <p className="kicker mb-2">
            All applications ({detail.applications.length}) — pick one to inspect
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.applications.map((a) => {
              const isActive = a.id === active?.id;
              const stageIdx = STAGE_ORDER.indexOf(a.stage);
              const isDraftLike = stageIdx >= 0 && stageIdx <= STAGE_ORDER.indexOf(ApplicationStage.Drafted);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  title={`${a.type === "personal_bond" ? "Personal bond" : "Bail"} application · updated ${formatDateTime(a.updatedAt)}`}
                  className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-xs transition ${
                    isActive
                      ? "border-terracotta bg-[#FFF6EC] ring-2 ring-terracotta/20"
                      : "border-[#f1e6d5] bg-white hover:border-saffron"
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isDraftLike ? "bg-amber-400" : "bg-emerald-500"}`} />
                  <span className="font-bold text-navy">
                    {a.type === "personal_bond" ? "Personal bond" : "Bail"}
                  </span>
                  <span className={`pill ${STAGE_PILLS[a.stage] ?? "pill-neutral"}`}>{STAGE_LABELS[a.stage]}</span>
                  {a.generatedDocumentUrl && (
                    <a
                      href={apiOriginUrl(a.generatedDocumentUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-terracotta hover:underline"
                    >
                      draft ↗
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!active ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-bodytext">No application opened yet.</p>
          {canEdit && (
            <button onClick={() => openApp.mutate()} disabled={openApp.isPending} className="btn btn-outline btn-sm">
              Open application (flagged)
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="mt-5 flex flex-col gap-0 sm:flex-row sm:items-start">
            {STAGE_ORDER.map((stage, i) => {
              const date = active.stageHistory?.[stage]?.at;
              const currentIdx = STAGE_ORDER.indexOf(active.stage);
              const done = i < currentIdx || (!!date && i === currentIdx);
              const isCurrent = i === currentIdx;
              return (
                <li key={stage} className="flex flex-1 items-center sm:flex-col sm:items-stretch">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-xs font-extrabold ${
                    done
                      ? "bg-terracotta text-white"
                      : "bg-[#ece2d3] text-bodytext"
                  }`}>
                    {done && !isCurrent ? "✓" : i + 1}
                  </div>
                  {i < STAGE_ORDER.length - 1 && (
                    <div className={`mx-2 h-0.5 flex-1 ${i < currentIdx ? "bg-terracotta/60" : "bg-[#ece2d3]"}`} />
                  )}
                  <div className="ml-2 sm:ml-0 sm:mt-2 sm:text-center">
                    <p className={`text-xs font-bold ${isCurrent || done ? "text-terracotta" : "text-bodytext"}`}>
                      {STAGE_LABELS[stage]}
                    </p>
                    {date && <p className="text-[10.5px] text-[#a7adb6]">{formatDate(date)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="app-status-row mt-5 flex flex-wrap items-center gap-3 rounded-[10px] bg-[#FBF9F5] px-4 py-3.5">
            <span className="text-xs text-bodytext">
              <b className="font-bold text-navy">{active.type === "personal_bond" ? "Personal bond" : "Bail"} application</b> · updated {formatDateTime(active.updatedAt)}
            </span>
            {active.reviewedByName ? (
              <span className="status-active">Reviewed by {active.reviewedByName}</span>
            ) : (
              <span className="review-pill rounded-full bg-amber-100 px-3 py-1 text-[11.5px] font-bold text-amber-700">
                Not yet reviewed
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {canAdvance &&
                !active.generatedDocumentUrl &&
                STAGE_ORDER.indexOf(active.stage) <= STAGE_ORDER.indexOf(ApplicationStage.Drafted) && (
                  <button
                    onClick={() => createDraft.mutate(active.id)}
                    disabled={createDraft.isPending}
                    title="Generate the formal bail / bond draft document (any staff, DLSA lawyer or superintendent)"
                    className="btn btn-navy btn-sm"
                  >
                    {createDraft.isPending ? "Generating…" : "Create formal draft"}
                  </button>
                )}
              <button
                onClick={() => void openPreview(active.id)}
                disabled={previewBusy}
                className="btn btn-outline btn-sm"
              >
                {previewBusy ? "Opening…" : "Task preview ↗"}
              </button>
              {active.generatedDocumentUrl && (
                <a
                  href={apiOriginUrl(active.generatedDocumentUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  Formal draft ↗
                </a>
              )}
              {canReview && !active.reviewedByName &&
                STAGE_ORDER.indexOf(active.stage) < STAGE_ORDER.indexOf(ApplicationStage.Filed) && (
                  <button onClick={() => review.mutate(active)} disabled={review.isPending} className="btn btn-navy btn-sm">
                    Mark reviewed
                  </button>
                )}
              {canAdvance && nextStage && (
                (() => {
                  const filedBlocked =
                    nextStage === ApplicationStage.Filed &&
                    (!active.reviewedByName || !active.generatedDocumentUrl);
                  return (
                    <button
                      onClick={() => advance.mutate({ app: active, next: nextStage })}
                      disabled={advance.isPending || filedBlocked}
                      title={
                        nextStage === ApplicationStage.Filed
                          ? "Filing needs BOTH a formal draft document and approval (Mark reviewed) by a DLSA lawyer or superintendent"
                          : undefined
                      }
                      className="btn btn-primary btn-sm disabled:opacity-40"
                    >
                      Advance to {STAGE_LABELS[nextStage]}
                    </button>
                  );
                })()
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-[#f0e4d3] pt-3">
            <p className="kicker mb-2">Stage log — who did what</p>
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
                      isCurrent ? "bg-[#FFF6EC]" : done ? "bg-[#FBF9F5]" : "bg-[#f6f4f0]/60"
                    }`}
                  >
                    <span className={`font-semibold ${isCurrent ? "text-terracotta" : done ? "text-navy" : "text-bodytext/70"}`}>
                      {done && !isCurrent ? "✓ " : isCurrent ? "● " : "●‹ "}
                      {STAGE_LABELS[stage]}
                      {isCurrent && <span className="ml-1 text-[10px] font-extrabold uppercase text-terracotta/80">current</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-bodytext">
                      {h?.byName && (
                        <span>
                          by <strong className="font-semibold text-navy">{h.byName}</strong>
                        </span>
                      )}
                      {h?.note && <span className="italic text-bodytext/80">{h.note}</span>}
                      {h ? (
                        <span>{formatDateTime(h.at)}</span>
                      ) : (
                        <span className="text-[#c3c8cf]">not yet reached</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {nextStage === ApplicationStage.Filed && (!active.reviewedByName || !active.generatedDocumentUrl) && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Filing is blocked until the formal draft document exists{" "}
              {(!active.generatedDocumentUrl) && <span>(use “Create formal draft” above)</span>}
              {!active.generatedDocumentUrl && !active.reviewedByName && " and "}
              {(!active.reviewedByName) && <span>a DLSA lawyer or superintendent marks it Reviewed</span>}.
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
    <section className="panel" id="skills">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display m-0 text-base font-bold text-navy">Skill Passport</h2>
          <p className="text-xs text-bodytext">
            Vocational training record that follows the individual after release
          </p>
        </div>
        {canEdit && programsQuery.data && programsQuery.data.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="input-base w-auto bg-white px-2 py-1.5 text-xs">
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
              className="btn btn-primary btn-sm disabled:opacity-40"
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
      e.status === "completed" ? "border-l-emerald-500" : e.status === "in_progress" ? "border-l-terracotta" : "border-l-slate-300";
    const pillCls =
      e.status === "completed"
        ? "pill-ok"
        : e.status === "in_progress"
          ? "pill-warn"
          : "pill-neutral";
    const barColor = e.status === "completed" ? "bg-emerald-500" : e.status === "in_progress" ? "bg-terracotta" : "bg-slate-400";

    return (
      <div className={`card-shadow rounded-xl border border-[#f1e6d5] border-l-4 bg-white p-4 transition hover:shadow-md ${accent}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="display truncate text-sm font-bold text-navy">{e.program.name}</p>
            <span className="mt-0.5 inline-block rounded bg-peach/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a4a1c]">
              {e.program.category}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={pillCls}>
              {e.status.replace("_", " ")}
            </span>
            {e.certificateUrl && (
              <a
                href={apiOriginUrl(e.certificateUrl)!}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm !px-2.5 !py-1 !text-[11px]"
              >
                Certificate
              </a>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[#f1ece1]">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-11 text-right font-mono text-sm font-bold tabular-nums text-navy">{pct}%</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f6f1e7] pt-2.5 text-xs text-bodytext">
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
                className="h-1.5 w-32 cursor-pointer accent-terracotta"
              />
              <button
                onClick={() => onSave({ id: e.id, markComplete: true })}
                disabled={busy}
                className="btn btn-outline btn-sm disabled:opacity-50"
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

function RecommendedJobsPanel({ detail, canEdit }: { detail: PrisonerDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [recs, setRecs] = useState<RecommendationDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const consentMutation = useMutation({
    mutationFn: async (consent: boolean) => {
      await api.patch(`/prisoners/${detail.id}/consent`, { consentToShareProfile: consent });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["prisoner", detail.id] }),
  });

  const applicationsQuery = useQuery({
    queryKey: ["job-applications", detail.id],
    queryFn: async () => {
      const res = await api.get<{ data: JobApplicationDto[] }>(`/prisoners/${detail.id}/job-applications`);
      return res.data.data;
    },
  });

  const findJobs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: RecommendationDto[] }>(`/prisoners/${detail.id}/recommended-jobs`);
      setRecs(res.data.data);
      setShowList(true);
    } catch (e) {
      setErr(extractApiError(e).message);
      setShowList(true);
    } finally {
      setLoading(false);
    }
  };

  const apply = useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/prisoners/${detail.id}/job-applications`, { jobId });
    },
    onSuccess: (_d, jobId) => {
      setAppliedIds((prev) => new Set(prev).add(jobId));
      void queryClient.invalidateQueries({ queryKey: ["job-applications"] });
    },
    onError: (e) => setErr(extractApiError(e).message),
  });

  const scorePillCls = (score: number) =>
    score >= 75 ? "pill-ok" : score >= 50 ? "pill-warn" : "pill-neutral";
  const barColor = (score: number) =>
    score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-slate-400";

  return (
    <section className="panel" id="recommended-jobs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display m-0 text-base font-bold text-navy">Recommended jobs</h2>
          <p className="kicker mb-0 mt-0.5">Explainable matches from the AI employment engine (Python)</p>
        </div>
        {detail.consentToShareProfile ? (
          <>
            <button onClick={() => void findJobs()} disabled={loading} className="btn btn-primary btn-sm disabled:opacity-60">
              {loading ? "Matching…" : "Find matching jobs"}
            </button>
            {canEdit && (
              <button
                onClick={() => consentMutation.mutate(false)}
                disabled={consentMutation.isPending}
                className="btn btn-outline btn-sm"
                title="Revoke consent — this prisoner will be excluded from employer recommendations"
              >
                {consentMutation.isPending ? "Saving…" : "Revoke consent"}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="pill-warn">Consent not recorded</span>
            {canEdit && (
              <button
                onClick={() => consentMutation.mutate(true)}
                disabled={consentMutation.isPending}
                className="btn btn-primary btn-sm"
                title="Record prisoner's consent to share their skill passport with NGO employers"
              >
                {consentMutation.isPending ? "Saving…" : "Record consent"}
              </button>
            )}
          </>
        )}
      </div>

      {!detail.consentToShareProfile && (
        <p className="info-note mt-3">
          This prisoner has not consented to profile sharing with employers, so job matching and
          applications are disabled. Click <strong>Record consent</strong> above — the AI engine will then include
          them in recommendations.
        </p>
      )}

      {err && (
        <div className="mt-3">
          <ErrorBanner message={`${err} — Is the Python recommender running on port 8000?`} />
        </div>
      )}

      {showList && recs && recs.length === 0 && (
        <p className="mt-3 text-sm text-bodytext">No matching openings right now. Check back as employers post new roles.</p>
      )}

      {showList && recs && recs.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recs.map((r) => {
            const applied = r.appliedAlready || appliedIds.has(r.job_id);
            return (
              <div key={r.job_id} className="card-shadow rounded-xl border border-[#f1e6d5] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="display m-0 text-sm font-bold text-navy">{r.job.title}</p>
                  <span className={scorePillCls(r.score)}>{Math.round(r.score)}/100</span>
                </div>
                <p className="mt-1 text-xs text-bodytext">
                  {r.job.ngoName} · {r.job.district || "—"} · {r.job.jobCategory || "—"}
                  {r.job.wageInfo ? ` · ${r.job.wageInfo}` : ""}
                </p>
                <div className="mt-2.5 h-2 rounded bg-[#f1ece1]">
                  <div
                    className={`h-full rounded ${barColor(r.score)}`}
                    style={{ width: `${Math.max(0, Math.min(100, Math.round(r.score)))}%` }}
                  />
                </div>
                <p className="mt-2.5 text-sm text-bodytext">{r.explanation}</p>
                {(r.matched_required_skills.length > 0 || r.missing_required_skills.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.matched_required_skills.map((s) => (
                      <span key={`m-${s}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        {s}
                      </span>
                    ))}
                    {r.missing_required_skills.map((s) => (
                      <span key={`x-${s}`} className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        missing: {s}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="mt-3 flex justify-end border-t border-[#f6f1e7] pt-2.5">
                    {applied ? (
                      <button disabled className="btn btn-outline btn-sm opacity-70">
                        Applied
                      </button>
                    ) : (
                      <button
                        onClick={() => apply.mutate(r.job_id)}
                        disabled={apply.isPending}
                        className="btn btn-primary btn-sm"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="panel-tight mt-4 !p-3.5">
        <h3 className="display m-0 mb-2 text-sm font-bold text-navy">Job applications</h3>
        {!applicationsQuery.data || applicationsQuery.data.length === 0 ? (
          <p className="mb-0 text-sm text-bodytext/80">No job applications yet.</p>
        ) : (
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Job</th>
                <th>Applied date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {applicationsQuery.data.map((a) => (
                <tr key={a.id}>
                  <td className="font-semibold text-navy">{a.jobTitle}</td>
                  <td>{formatDate(a.appliedAt)}</td>
                  <td>
                    <span className="pill-neutral">{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
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
    <section className="panel" id="notes">
      <h2 className="display m-0 text-base font-bold text-navy">Notes & activity log</h2>
      {canEdit && (
        <form
          className="notes-add-row mt-4 flex gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an observation…"
            className="input-base min-w-0 flex-1"
          />
          <button type="submit" disabled={add.isPending || !body.trim()} className="btn btn-navy btn-sm disabled:opacity-50">
            Add note
          </button>
        </form>
      )}
      {detail.notes.length === 0 ? (
        <p className="mt-3 text-sm text-bodytext">No notes recorded.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {detail.notes.map((n) => (
            <li key={n.id} className="note-item rounded-[10px] bg-[#FBF9F5] p-3.5">
              <p className="text-sm text-heading">{n.body}</p>
              <p className="mt-1.5 block text-[11.5px] text-bodytext">
                {n.authorName} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

