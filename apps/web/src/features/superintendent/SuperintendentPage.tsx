import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApplicationType,
  type AutoDraftOutcome,
  type EligiblePrisonerRow,
} from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

export default function SuperintendentPage() {
  const { jailId = "" } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<ApplicationType>(ApplicationType.Bail);
  const [outcomes, setOutcomes] = useState<AutoDraftOutcome[] | null>(null);

  const isManager =
    !!user && ["super_admin", "jail_superintendent"].includes(user.role);

  const query = useQuery({
    queryKey: ["eligible-prisoners", jailId],
    enabled: isManager,
    queryFn: async () => {
      const res = await api.get<{ data: EligiblePrisonerRow[] }>(
        `/jails/${jailId}/superintendent/eligible-prisoners`,
      );
      return res.data.data;
    },
  });

  const draft = useMutation({
    mutationFn: async (prisonerIds: string[]) => {
      const res = await api.post<{ data: AutoDraftOutcome[] }>(
        `/jails/${jailId}/superintendent/auto-draft`,
        { prisonerIds, type },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setOutcomes(data);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["eligible-prisoners", jailId] });
    },
  });

  const review = useMutation({
    mutationFn: async (applicationId: string) => {
      await api.post(`/applications/${applicationId}/review`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["stall-list", jailId] }),
  });

  const allSelected = useMemo(
    () => !!query.data && query.data.length > 0 && selected.size === query.data.length,
    [query.data, selected.size],
  );

  if (!isManager) {
    return (
      <EmptyState
        title="Superintendent access only"
        body="This portal is restricted to jail superintendents."
        action={<Link to={`/jails/${jailId}`} className="text-sm font-medium text-blue-700 hover:underline">← Back to jail</Link>}
      />
    );
  }

  if (query.isLoading) return <Spinner label="Finding eligible prisoners…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const rows = query.data ?? [];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/jails/${jailId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Jail portal
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Section 479 — Superintendent portal
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Prisoners whose latest eligibility assessment is <strong>eligible</strong> and whose application has not
          advanced past <em>flagged</em>. Drafting accelerates paperwork; a human lawyer always reviews before filing.
        </p>
      </div>

      {draft.isError && <ErrorBanner message={extractApiError(draft.error).message} />}

      {outcomes && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-800">Draft results</p>
          <ul className="space-y-1.5 text-sm">
            {outcomes.map((o) => (
              <li key={o.prisonerId}>
                {o.ok ? (
                  <span className="text-emerald-800">
                    ✓ Application drafted —{" "}
                    <a
                      href={`${(import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1").replace(/\/api\/v1$/, "")}${o.documentUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      open document ↗
                    </a>{" "}
                    <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                      Lawyer review pending
                    </span>
                  </span>
                ) : (
                  <span className="text-red-700">✗ {o.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No eligible prisoners awaiting applications"
          body="Run the nightly eligibility sweep or recompute after editing case details to refresh this list."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(rows.map((r) => r.prisonerId)) : new Set())
                }
              />
              Select all ({rows.length})
            </label>
            <div className="flex items-center gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ApplicationType)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value={ApplicationType.Bail}>Bail</option>
                <option value={ApplicationType.PersonalBond}>Personal bond</option>
              </select>
              <button
                disabled={selected.size === 0 || draft.isPending}
                onClick={() => draft.mutate([...selected])}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
              >
                {draft.isPending ? "Drafting…" : `Auto-draft ${selected.size || ""} application${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3"></th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Case no</th>
                  <th className="px-4 py-3">Offence</th>
                  <th className="px-4 py-3">Eligibility basis</th>
                  <th className="px-4 py-3">In custody</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.prisonerId} className={selected.has(r.prisonerId) ? "bg-blue-50/40" : undefined}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(r.prisonerId)} onChange={() => toggle(r.prisonerId)} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.fullName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{r.prisonerRegNo}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.caseNumber}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">{r.offence}</td>
                    <td className="max-w-[260px] px-4 py-3 text-xs text-slate-600">{r.eligibilityReason}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {Math.floor(r.custodyDays / 30.4375)} mo {r.custodyDays % 30} d
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => draft.mutate([r.prisonerId])}
                        disabled={draft.isPending}
                        className="whitespace-nowrap rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                      >
                        Auto-draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Drafted applications appear on each prisoner profile under "Application progress" with a
            lawyer-review-pending warning;
            they must be marked reviewed by a DLSA lawyer or superintendent before they can be filed.
            {review.isPending ? " Saving review…" : ""}
          </p>
        </>
      )}
    </div>
  );
}
