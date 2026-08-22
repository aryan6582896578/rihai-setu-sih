import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationStage, Role, type Paginated, type PrisonerListItem } from "@rihai/shared-types";
import { api } from "../../lib/api";
import { ELIGIBILITY_BADGE, STAGE_LABELS } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, Spinner } from "../../components/ui";
import AddPrisonerModal from "./AddPrisonerModal";

const EDITOR_ROLES: string[] = ["super_admin", "jail_superintendent", "jail_staff"];

export default function PrisonersPage() {
  const { jailId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["prisoners", jailId, search, eligibility, stage, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (eligibility) params.set("eligibility", eligibility);
      if (stage) params.set("stage", stage);
      const res = await api.get<Paginated<PrisonerListItem>>(
        `/jails/${jailId}/prisoners?${params.toString()}`,
      );
      return res.data;
    },
  });

  if (query.isLoading) return <Spinner label="Loading prisoners…" />;

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const canAdd = user && EDITOR_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/jails/${jailId}`} className="text-sm text-slate-500 hover:text-slate-700">
            ← Jail portal
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Prisoners</h1>
        </div>
        {canAdd && (
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            + Add prisoner
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, reg no or case number…"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
        <select
          value={eligibility}
          onChange={(e) => {
            setEligibility(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All §479 statuses</option>
          <option value="eligible">Eligible</option>
          <option value="not_eligible">Not eligible</option>
          <option value="excluded">Excluded</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All application stages</option>
          <option value="none">No application</option>
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {(query.data?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="No prisoners match"
          body={search || eligibility || stage ? "Try clearing filters." : "Add the first admission to get started."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Reg no</th>
                <th className="px-4 py-3">Case no</th>
                <th className="px-4 py-3">Offence</th>
                <th className="px-4 py-3">In custody</th>
                <th className="px-4 py-3">§479 status</th>
                <th className="px-4 py-3">Application</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.data ?? []).map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/jails/${jailId}/prisoners/${p.id}`)}
                  className="cursor-pointer hover:bg-blue-50/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{p.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.prisonerRegNo}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.caseNumber}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{p.offence}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{p.custodyDurationLabel}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        ELIGIBILITY_BADGE[p.eligibility.status].cls
                      }`}
                    >
                      {ELIGIBILITY_BADGE[p.eligibility.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.applicationStage ? STAGE_LABELS[p.applicationStage as ApplicationStage] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {totalPages} — {data.total} prisoners
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {addOpen && (
        <AddPrisonerModal
          jailId={jailId}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["prisoners", jailId] });
            navigate(`/jails/${jailId}/prisoners/${id}`);
          }}
        />
      )}
    </div>
  );
}

export function canManagePrisoners(role?: Role): boolean {
  return !!role && EDITOR_ROLES.includes(role);
}
