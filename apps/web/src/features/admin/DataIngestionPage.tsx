import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";

interface BatchRow {
  id: string;
  rowNo: number;
  rawData: Record<string, string>;
  mappedData: Record<string, unknown>;
  validationStatus: string;
  validationErrors: string[];
  conflictType: string | null;
  conflictWith: { id: string; prisonerRegNo: string; fullName: string } | null;
  resolved: boolean;
  resolvedAction: string | null;
}

interface BatchView {
  id: string;
  jailId: string;
  sourceSystem: string;
  status: string;
  rowCount: number;
  errorCount: number;
  mergedCount: number;
  rejectedCount: number;
  createdAt: string;
  rows?: BatchRow[];
}

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  fieldsTouched: string[];
  ipAddress: string | null;
  at: string;
}

const STATUS_STYLES: Record<string, string> = {
  staged: "bg-amber-100 text-amber-800",
  reconciling: "bg-blue-100 text-blue-800",
  merged: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  validating: "bg-slate-100 text-slate-700",
};

export default function DataIngestionPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [tab, setTab] = useState<"batches" | "audit">("batches");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState({ entityType: "", actorId: "" });

  const jailsQuery = useQuery({
    queryKey: ["jails"],
    queryFn: async () => (await api.get("/jails?pageSize=50")).data.data,
  });

  const batchesQuery = useQuery({
    queryKey: ["ingestion-batches"],
    queryFn: async () => (await api.get<{ data: BatchView[] }>("/admin/ingestion")).data.data,
  });

  const batchQuery = useQuery({
    queryKey: ["ingestion-batch", selectedBatch],
    enabled: !!selectedBatch,
    queryFn: async () =>
      (await api.get<{ data: BatchView }>(`/admin/ingestion/${selectedBatch}`)).data.data,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-log", auditFilters],
    enabled: tab === "audit",
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (auditFilters.entityType) params.set("entityType", auditFilters.entityType);
      if (auditFilters.actorId) params.set("actorId", auditFilters.actorId);
      return (
        await api.get<{ data: AuditEntry[]; total: number }>(`/admin/audit-log?${params}`)
      ).data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (jailId: string) => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose a CSV file first");
      const form = new FormData();
      form.append("file", file);
      form.append("jailId", jailId);
      return (await api.post<{ data: BatchView }>("/admin/ingestion/upload", form)).data.data;
    },
    onSuccess: (batch) => {
      setUploadMsg(`Uploaded ${batch.rowCount} rows — ${batch.errorCount} with errors need attention.`);
      setUploadErr(null);
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["ingestion-batches"] });
      setSelectedBatch(batch.id);
    },
    onError: (e) => {
      setUploadErr(extractApiError(e).message || "Upload failed");
      setUploadMsg(null);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: { rowId: string; action: "merge" | "reject" | "attach_case" }) => {
      await api.post(`/admin/ingestion/${selectedBatch}/rows/${input.rowId}/resolve`, {
        action: input.action,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ingestion-batch", selectedBatch] }),
  });

  const defaultJailId =
    user?.role === "super_admin"
      ? jailsQuery.data?.[0]?.id
      : jailsQuery.data?.[0]?.id;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title mb-1.5">Data ingestion &amp; PII security</h1>
          <p className="lede max-w-3xl">
            Bulk records from government spreadsheets are staged here first. Nothing merges into the
            canonical prisoner record without a human reviewing warnings and conflicts — a sync can
            never silently overwrite a manually verified record. Tier-1 fields are envelope-encrypted
            at rest (AES-256-GCM).
          </p>
        </div>
        <div className="tabpills !mb-0">
          {(["batches", "audit"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "active" : ""}>
              {t === "batches" ? "Batches" : "Audit log"}
            </button>
          ))}
        </div>
      </div>

      {tab === "batches" && (
        <>
          <section className="panel !mt-6">
            <h2 className="kicker">Upload CSV</h2>
            <p className="mt-1 text-xs text-bodytext">
              Required columns: full_name, prisoner_reg_no, date_of_birth, gender, admission_date,
              case_number, offence.
            </p>
            {(uploadMsg || uploadErr) && (
              <div
                className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                  uploadErr ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {uploadErr ?? uploadMsg}
              </div>
            )}
            <form
              className="mt-4 flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                uploadMutation.mutate(defaultJailId ?? "");
              }}
            >
              <select
                disabled={user?.role !== "super_admin"}
                value={defaultJailId ?? ""}
                onChange={() => undefined}
                className="input-base w-auto bg-white disabled:bg-slate-50"
              >
                {(jailsQuery.data ?? []).map(
                  (j: { id: string; name: string }) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ),
                )}
              </select>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm" />
              <button
                type="submit"
                disabled={uploadMutation.isPending}
                className="btn btn-primary disabled:opacity-60"
              >
                {uploadMutation.isPending ? "Uploading…" : "Validate & stage"}
              </button>
            </form>
          </section>

          {!selectedBatch ? (
            <section className="panel-tight mt-6 overflow-x-auto">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Errors</th>
                    <th className="px-4 py-3">Merged</th>
                    <th className="px-4 py-3">Rejected</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(batchesQuery.data ?? []).map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3">{b.sourceSystem}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[b.status] ?? "bg-slate-100"}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{b.rowCount}</td>
                      <td className="px-4 py-3">{b.errorCount}</td>
                      <td className="px-4 py-3">{b.mergedCount}</td>
                      <td className="px-4 py-3">{b.rejectedCount}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedBatch(b.id)}
                          className="text-sm font-bold text-terracotta hover:underline"
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  ))}
                  {batchesQuery.data && batchesQuery.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        No ingestion batches yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ) : (
            <BatchReview
              batch={batchQuery.data}
              busy={resolveMutation.isPending}
              onResolve={(rowId, action) => resolveMutation.mutate({ rowId, action })}
              onBack={() => {
                setSelectedBatch(null);
                void queryClient.invalidateQueries({ queryKey: ["ingestion-batches"] });
              }}
            />
          )}
        </>
      )}

      {tab === "audit" && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              placeholder="Filter by entity type (Prisoner…)"
              value={auditFilters.entityType}
              onChange={(e) => setAuditFilters((f) => ({ ...f, entityType: e.target.value }))}
              className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Filter by actor user-id"
              value={auditFilters.actorId}
              onChange={(e) => setAuditFilters((f) => ({ ...f, actorId: e.target.value }))}
              className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="panel-tight mt-4 overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Fields / detail</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(auditQuery.data?.data ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5">{new Date(a.at).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5">{a.actorName ?? a.actorId ?? "system"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.action}</td>
                    <td className="px-4 py-2.5">
                      {a.entityType}
                      <span className="block font-mono text-[11px] text-slate-400">{a.entityId}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                      {(a.fieldsTouched ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.ipAddress ?? "—"}</td>
                  </tr>
                ))}
                {auditQuery.data && auditQuery.data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No audit entries match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function BatchReview({
  batch,
  busy,
  onResolve,
  onBack,
}: {
  batch?: BatchView;
  busy: boolean;
  onResolve: (rowId: string, action: "merge" | "reject" | "attach_case") => void;
  onBack: () => void;
}) {
  if (!batch) return <p className="mt-6 text-sm text-slate-400">Loading batch…</p>;
  const needsReview = (batch.rows ?? []).filter((r) => !r.resolved);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="display text-lg font-bold text-navy">
          Batch review{" "}
          <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[batch.status] ?? "bg-slate-100"}`}>
            {batch.status}
          </span>
        </h2>
        <button onClick={onBack} className="text-sm font-bold text-terracotta hover:underline">
          ← All batches
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {needsReview.length === 0
          ? "Every row has been resolved."
          : `${needsReview.length} row(s) awaiting human reconciliation.`}
      </p>

      <div className="mt-4 space-y-4">
        {(batch.rows ?? [])
          .filter((r) => r.validationStatus !== "valid" || !r.resolved)
          .map((r) => (
            <div key={r.id} className={`rounded-xl border p-4 ${r.validationStatus === "error" ? "border-red-200 bg-red-50/40" : r.conflictType ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  Row {r.rowNo} — {String(r.mappedData.full_name ?? "")}{" "}
                  <span className="font-normal text-slate-500">(Reg {String(r.mappedData.prisoner_reg_no ?? "")})</span>
                </p>
                <span className="flex gap-2">
                  {r.conflictType && (
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      {r.conflictType}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.validationStatus === "error"
                        ? "bg-red-200 text-red-900"
                        : r.validationStatus === "warning"
                          ? "bg-amber-200 text-amber-900"
                          : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    {r.validationStatus}
                  </span>
                  {r.resolved && (
                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {r.resolvedAction}
                    </span>
                  )}
                </span>
              </div>

              {r.validationErrors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                  {r.validationErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming CSV row</p>
                  <dl className="mt-2 space-y-1 text-xs text-slate-700">
                    {Object.entries(r.rawData).slice(0, 10).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-40 shrink-0 font-mono text-slate-500">{k}</dt>
                        <dd className="truncate">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Existing canonical record
                  </p>
                  {r.conflictWith ? (
                    <p className="mt-2 text-xs text-slate-700">
                      {r.conflictWith.fullName} — Reg {r.conflictWith.prisonerRegNo}
                      <span className="block text-slate-500">
                        Merge would NOT overwrite it; attach the case or reject instead.
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">No duplicate detected — safe to merge as a new record.</p>
                  )}
                </div>
              </div>

              {!r.resolved && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!r.conflictType && r.validationStatus === "valid" && (
                    <button
                      onClick={() => onResolve(r.id, "merge")}
                      disabled={busy}
                      className="btn btn-primary btn-sm"
                    >
                      Merge into canonical tables
                    </button>
                  )}
                  {r.conflictType && (
                    <button
                      onClick={() => onResolve(r.id, "attach_case")}
                      disabled={busy}
                      className="btn btn-navy btn-sm"
                    >
                      Attach case to existing record
                    </button>
                  )}
                  <button
                    onClick={() => onResolve(r.id, "reject")}
                    disabled={busy}
                    className="btn btn-sm border-[1.5px] border-red-300 bg-transparent px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    Reject row
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
