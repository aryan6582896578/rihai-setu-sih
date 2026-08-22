import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AvailableLawyer,
  type GrantedSuretyRow,
  type UnassignedRow,
} from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { formatDate, STAGE_LABELS } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";

export default function LegalAidPage() {
  const { jailId = "" } = useParams();
  const [tab, setTab] = useState<"queue" | "surety">("queue");

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/jails/${jailId}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Jail portal
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Legal aid &amp; surety tracking
        </h1>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1">
          {(
            [
              ["queue", "Assignment queue"],
              ["surety", "Bond / surety checklist"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
                tab === key
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "queue" ? <AssignmentQueue jailId={jailId} /> : <SuretyChecklist jailId={jailId} />}
    </div>
  );
}

function AssignmentQueue({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["legal-aid-unassigned", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: { queue: UnassignedRow[]; lawyers: AvailableLawyer[] } }>(
        `/jails/${jailId}/legal-aid/unassigned`,
      );
      return res.data.data;
    },
  });

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["legal-aid-unassigned", jailId] });
    void queryClient.invalidateQueries({ queryKey: ["prisoner"] });
  };

  const assign = useMutation({
    mutationFn: async (vars: { applicationId: string; method: "round_robin" | "manual"; lawyerId?: string }) => {
      await api.post(`/applications/${vars.applicationId}/assign-lawyer`, {
        method: vars.method,
        ...(vars.lawyerId ? { lawyerId: vars.lawyerId } : {}),
      });
    },
    onSuccess: invalidate,
    onError: (e) => setError(extractApiError(e).message),
  });

  if (query.isLoading) return <Spinner label="Loading queue…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const queue = query.data?.queue ?? [];
  const lawyers = query.data?.lawyers ?? [];

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <p className="text-sm text-slate-500">
        Applications that don't have a DLSA lawyer assigned yet. Round-robin picks the least-loaded active lawyer.
      </p>
      {queue.length === 0 ? (
        <EmptyState title="Assignment queue is clear" body="Every active application has a legal aid counsel." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Prisoner</th>
                <th className="px-4 py-3">Case no</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Assign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map((r) => (
                <tr key={r.applicationId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.prisonerName}</p>
                    <p className="font-mono text-[11px] text-slate-400">{r.prisonerRegNo}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.caseNumber}</td>
                  <td className="px-4 py-3">{STAGE_LABELS[r.stage]}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(r.openedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        value={picked[r.applicationId] ?? ""}
                        onChange={(e) => setPicked((p) => ({ ...p, [r.applicationId]: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Manual pick…</option>
                        {lawyers.map((l) => (
                          <option key={l.lawyerId} value={l.lawyerId}>
                            {l.name} ({l.activeCases} active)
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={assign.isPending || (!!picked[r.applicationId] && picked[r.applicationId] !== "")}
                        onClick={() =>
                          assign.mutate({
                            applicationId: r.applicationId,
                            method: picked[r.applicationId] ? "manual" : "round_robin",
                            lawyerId: picked[r.applicationId] || undefined,
                          })
                        }
                        className="whitespace-nowrap rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                      >
                        Round-robin
                      </button>
                      <button
                        disabled={assign.isPending || !picked[r.applicationId]}
                        onClick={() =>
                          assign.mutate({
                            applicationId: r.applicationId,
                            method: "manual",
                            lawyerId: picked[r.applicationId],
                          })
                        }
                        className="rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-40"
                      >
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SuretyChecklist({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["legal-aid-granted", jailId],
    queryFn: async () => {
      const res = await api.get<{ data: GrantedSuretyRow[] }>(`/jails/${jailId}/legal-aid/granted`);
      return res.data.data;
    },
  });

  const save = useMutation({
    mutationFn: async (vars: {
      applicationId: string;
      bondAmount?: number;
      suretyRequired?: boolean;
      suretyArranged?: boolean;
      notes?: string;
    }) => {
      await api.patch(`/applications/${vars.applicationId}/surety-status`, vars);
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["legal-aid-granted"] });
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  if (query.isLoading) return <Spinner label="Loading granted orders…" />;
  if (query.isError) return <ErrorBanner message={extractApiError(query.error).message} />;

  const rows = query.data ?? [];

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <p className="text-sm text-slate-500">
        Applications with a <strong>granted</strong> court order. Completing the surety checklist is what unlocks
        advancing the application to “released”.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="No granted orders yet"
          body="Sync court statuses on the Court tracking page until an order comes back granted."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <SuretyRow key={r.applicationId} row={r} onSave={(patch) => save.mutate({ applicationId: r.applicationId, ...patch })} busy={save.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuretyRow({
  row,
  onSave,
  busy,
}: {
  row: GrantedSuretyRow;
  onSave: (patch: { bondAmount?: number; suretyRequired?: boolean; suretyArranged?: boolean; notes?: string }) => void;
  busy: boolean;
}) {
  const [bondAmount, setBondAmount] = useState(row.bondAmount ?? 0);
  const [suretyRequired, setSuretyRequired] = useState(row.suretyRequired);
  const [suretyArranged, setSuretyArranged] = useState(row.suretyArranged);
  const [notes, setNotes] = useState(row.notes ?? "");

  const dirty =
    bondAmount !== (row.bondAmount ?? 0) ||
    suretyRequired !== row.suretyRequired ||
    suretyArranged !== row.suretyArranged ||
    notes !== (row.notes ?? "");

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${row.suretyArranged ? "border-emerald-200" : "border-orange-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{row.prisonerName}</p>
          <p className="text-xs text-slate-400">Stage: {STAGE_LABELS[row.stage]}</p>
        </div>
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase text-emerald-800">
          Order {row.orderOutcome}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">Bond amount (₹)</span>
          <input
            type="number"
            min={0}
            value={bondAmount}
            onChange={(e) => setBondAmount(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={suretyRequired} onChange={(e) => setSuretyRequired(e.target.checked)} /> Surety required
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={suretyArranged} onChange={(e) => setSuretyArranged(e.target.checked)} /> Surety arranged
        </label>
        <div className="flex items-end">
          <button
            onClick={() =>
              onSave({
                bondAmount,
                suretyRequired,
                suretyArranged,
                notes: notes || undefined,
              })
            }
            disabled={!dirty || busy}
            className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save checklist"}
          </button>
        </div>
        <input
          placeholder="Notes (sureties, documents…)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none sm:col-span-4"
        />
      </div>
      {!row.suretyArranged && (
        <p className="mt-2 text-xs text-orange-700">
          Pending: mark “surety arranged” once the bond paperwork is complete — this unlocks the release stage.
        </p>
      )}
    </div>
  );
}
