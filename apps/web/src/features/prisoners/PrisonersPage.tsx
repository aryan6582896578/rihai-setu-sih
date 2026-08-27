import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationStage, Role, type Paginated, type PrisonerListItem } from "@rihai/shared-types";
import { api } from "../../lib/api";
import { ELIGIBILITY_BADGE, STAGE_LABELS } from "../../lib/format";
import { useAuthStore } from "../../state/authStore";
import { EmptyState, Spinner } from "../../components/ui";
import AddPrisonerModal from "./AddPrisonerModal";

const EDITOR_ROLES: string[] = ["super_admin", "jail_superintendent"];

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

  if (user?.role === Role.DlsaLawyer) {
    return (
      <div className="space-y-4">
        <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="display text-lg font-bold text-navy mb-2">Access Restricted</h2>
          <p className="text-sm text-bodytext mb-4">
            DLSA Lawyer accounts are restricted from viewing full prisoner directories and personal info.
          </p>
          <div className="flex justify-center gap-3">
            <Link to={`/jails/${jailId}/court-tracking`} className="btn btn-primary btn-sm">Court Tracking</Link>
            <Link to={`/jails/${jailId}/legal-aid`} className="btn btn-outline btn-sm">Legal Aid</Link>
          </div>
        </div>
      </div>
    );
  }

  if (query.isLoading) return <Spinner label="Loading prisoners…" />;

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const canAdd = user && EDITOR_ROLES.includes(user.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/jails/${jailId}`} className="crumb">← Jail portal</Link>
          <h1 className="page-title">Prisoners</h1>
        </div>
        {canAdd && (
          <button onClick={() => setAddOpen(true)} className="btn btn-primary">
            + Add prisoner
          </button>
        )}
      </div>

      <div className="filters-row flex flex-wrap gap-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, reg no or case number…"
          className="input-base min-w-[200px] flex-1"
        />
        <select
          value={eligibility}
          onChange={(e) => {
            setEligibility(e.target.value);
            setPage(1);
          }}
          className="input-base w-fit bg-white sm:w-auto"
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
          className="input-base w-fit bg-white sm:w-auto"
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
          icon="🗂️"
          title="No prisoners match"
          body={search || eligibility || stage ? "Try clearing filters." : "Add the first admission to get started."}
        />
      ) : (
        <div className="panel-tight overflow-x-auto">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Reg no</th>
                <th>Case no</th>
                <th>Offence</th>
                <th>In custody</th>
                <th>§479 status</th>
                <th>Application</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/jails/${jailId}/prisoners/${p.id}`)}
                  className="clickable"
                >
                  <td className="font-semibold text-navy">{p.fullName}</td>
                  <td className="mono-cell text-bodytext">{p.prisonerRegNo}</td>
                  <td className="mono-cell text-bodytext">{p.caseNumber}</td>
                  <td className="max-w-[220px] truncate text-bodytext">{p.offence}</td>
                  <td className="whitespace-nowrap text-bodytext">{p.custodyDurationLabel}</td>
                  <td>
                    <span className={`pill ${ELIGIBILITY_BADGE[p.eligibility.status].cls}`}>
                      {ELIGIBILITY_BADGE[p.eligibility.status].label}
                    </span>
                  </td>
                  <td className="text-bodytext">
                    {p.applicationStage ? STAGE_LABELS[p.applicationStage as ApplicationStage] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-bodytext">
          <span>
            Page {page} of {totalPages} — {data.total} prisoners
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn btn-outline btn-sm disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="btn btn-outline btn-sm disabled:opacity-40"
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
