import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { PrisonerDetail } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";

export default function AddPrisonerModal({
  jailId,
  onClose,
  onCreated,
}: {
  jailId: string;
  onClose: () => void;
  onCreated: (prisonerId: string) => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    gender: "male",
    dateOfBirth: "",
    admissionDate: new Date().toISOString().slice(0, 10),
    caseNumber: "",
    courtName: "",
    offence: "",
    maxSentenceYears: 3,
    carriesDeathOrLife: false,
    isFirstTimeOffender: true,
    pendingCaseCount: 0,
    custodyStartDate: new Date().toISOString().slice(0, 10),
    cnrNumber: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: PrisonerDetail }>(`/jails/${jailId}/prisoners`, {
        fullName: form.fullName,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
        admissionDate: form.admissionDate,
        case: {
          caseNumber: form.caseNumber,
          courtName: form.courtName,
          offence: form.offence,
          maxSentenceYears: Number(form.maxSentenceYears),
          carriesDeathOrLife: form.carriesDeathOrLife,
          isFirstTimeOffender: form.isFirstTimeOffender,
          pendingCaseCount: Number(form.pendingCaseCount),
          custodyStartDate: form.custodyStartDate,
          ...(form.cnrNumber ? { cnrNumber: form.cnrNumber } : {}),
        },
      });
      return res.data.data;
    },
    onSuccess: (d) => onCreated(d.id),
  });

  const set = (k: keyof typeof form, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none";
  const labelCls = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Admission intake</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        {mutation.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {extractApiError(mutation.error).message}
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-700">Personal details</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Full name *</label>
              <input required className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Gender *</label>
              <select className={inputCls} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date of birth *</label>
              <input required type="date" className={inputCls} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Admission date</label>
              <input type="date" className={inputCls} value={form.admissionDate} onChange={(e) => set("admissionDate", e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-700">Initial case record</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Case number *</label>
              <input required className={inputCls} value={form.caseNumber} onChange={(e) => set("caseNumber", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>CNR number</label>
              <input className={inputCls} value={form.cnrNumber} onChange={(e) => set("cnrNumber", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Court *</label>
              <input required className={inputCls} value={form.courtName} onChange={(e) => set("courtName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Offence *</label>
              <input required className={inputCls} value={form.offence} onChange={(e) => set("offence", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Max sentence (years) *</label>
              <input required type="number" min={0} max={50} className={inputCls} value={form.maxSentenceYears} onChange={(e) => set("maxSentenceYears", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Other pending cases *</label>
              <input required type="number" min={0} max={100} className={inputCls} value={form.pendingCaseCount} onChange={(e) => set("pendingCaseCount", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Custody start date *</label>
              <input required type="date" className={inputCls} value={form.custodyStartDate} onChange={(e) => set("custodyStartDate", e.target.value)} />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.carriesDeathOrLife} onChange={(e) => set("carriesDeathOrLife", e.target.checked)} />
                Death / life
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.isFirstTimeOffender} onChange={(e) => set("isFirstTimeOffender", e.target.checked)} />
                First-time offender
              </label>
            </div>
          </div>
        </fieldset>

        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          A registration number is generated automatically. §479 eligibility is computed on save — it is never entered manually.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {mutation.isPending ? "Saving…" : "Admit prisoner"}
          </button>
        </div>
      </form>
    </div>
  );
}
