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
    refetchOnMount: "always",
    staleTime: 0,
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
      // Drafting moves applications out of "flagged", which changes stall windows.
      void queryClient.invalidateQueries({ queryKey: ["stall-list", jailId] });
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
        action={<Link to={`/jails/${jailId}`} className="crumb">← Back to jail</Link>}
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
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <h1 className="page-title mb-1.5">Section 479 — Superintendent portal</h1>
        <p className="lede max-w-2xl">
          Prisoners whose latest eligibility assessment is <strong>eligible</strong> and whose application has not
          advanced past <em>flagged</em>. Drafting accelerates paperwork; a human lawyer always reviews before filing.
        </p>
      </div>

      {draft.isError && <ErrorBanner message={extractApiError(draft.error).message} />}

      {outcomes && (
        <div className="panel !mt-4">
          <p className="mb-2 text-sm font-bold text-navy">Draft results</p>
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
                      className="font-semibold underline"
                    >
                      open document ↗
                    </a>{" "}
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
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
          icon="🔍"
          title="No eligible prisoners awaiting applications"
          body="Run the nightly eligibility sweep or recompute after editing case details to refresh this list."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-navy">
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
                className="input-base w-auto bg-white"
              >
                <option value={ApplicationType.Bail}>Bail</option>
                <option value={ApplicationType.PersonalBond}>Personal bond</option>
              </select>
              <button
                disabled={selected.size === 0 || draft.isPending}
                onClick={() => draft.mutate([...selected])}
                className="btn btn-primary disabled:opacity-40"
              >
                {draft.isPending ? "Drafting…" : `Auto-draft ${selected.size || ""} application${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <div className="panel-tight overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Name</th>
                  <th>Case no</th>
                  <th>Offence</th>
                  <th>Eligibility basis</th>
                  <th>In custody</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.prisonerId} className={selected.has(r.prisonerId) ? "bg-[#FFF6EC]/70" : undefined}>
                    <td>
                      <input type="checkbox" checked={selected.has(r.prisonerId)} onChange={() => toggle(r.prisonerId)} />
                    </td>
                    <td>
                      <p className="font-semibold text-navy">{r.fullName}</p>
                      <p className="mono-cell text-[#a7adb6]">{r.prisonerRegNo}</p>
                    </td>
                    <td className="mono-cell text-bodytext">{r.caseNumber}</td>
                    <td className="max-w-[200px] truncate text-bodytext">{r.offence}</td>
                    <td className="max-w-[260px] text-xs text-bodytext">{r.eligibilityReason}</td>
                    <td className="whitespace-nowrap text-bodytext">
                      {Math.floor(r.custodyDays / 30.4375)} mo {r.custodyDays % 30} d
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => draft.mutate([r.prisonerId])}
                        disabled={draft.isPending}
                        className="btn btn-primary btn-sm whitespace-nowrap disabled:opacity-60"
                      >
                        Auto-draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-bodytext">
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
