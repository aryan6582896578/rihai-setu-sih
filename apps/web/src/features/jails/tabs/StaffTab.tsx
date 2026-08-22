import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Role, type CreateStaffResult, type StaffMember } from "@rihai/shared-types";
import { api, extractApiError } from "../../../lib/api";
import { EmptyState, ErrorBanner, Spinner } from "../../../components/ui";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.JailSuperintendent, label: "Jail Superintendent" },
  { value: Role.JailStaff, label: "Jail Staff" },
  { value: Role.DlsaLawyer, label: "DLSA Lawyer" },
  { value: Role.Viewer, label: "Viewer (read-only)" },
];

export default function StaffTab({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: ["staff", jailId],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: StaffMember[] }>(`/jails/${jailId}/staff`);
        return res.data.data;
      } catch (err) {
        throw new Error(extractApiError(err).message);
      }
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["staff", jailId] });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, body }: { userId: string; body: { roleAtJail?: Role; isActive?: boolean } }) => {
      await api.patch(`/jails/${jailId}/staff/${userId}`, body);
    },
    onSuccess: invalidate,
    onError: () => undefined,
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post<{ data: CreateStaffResult }>(`/jails/${jailId}/staff`, body);
      return res.data.data;
    },
    onSuccess: (result) => {
      setTempPassword(result.temporaryPassword ?? null);
      invalidate();
    },
    onError: () => undefined,
  });

  if (staffQuery.isLoading) return <Spinner label="Loading staff…" />;
  if (staffQuery.isError) return <ErrorBanner message={extractApiError(staffQuery.error).message} />;

  const staff = staffQuery.data ?? [];
  const updateError = updateMutation.isError ? extractApiError(updateMutation.error) : null;
  const addError = addMutation.isError ? extractApiError(addMutation.error) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">People with JailAccess to this facility.</p>
        <button
          onClick={() => {
            setAddOpen((v) => !v);
            setTempPassword(null);
          }}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          {addOpen ? "Close" : "+ Add staff"}
        </button>
      </div>

      {tempPassword && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-semibold">Account created.</span> Temporary password (shown only once):{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono">{tempPassword}</code>
        </div>
      )}

      {addOpen && (
        <AddStaffForm
          busy={addMutation.isPending}
          error={addError?.message}
          onSubmit={(body) => addMutation.mutate(body)}
        />
      )}

      {updateError && <ErrorBanner message={updateError.message} />}

      {staff.length === 0 ? (
        <EmptyState title="No staff assigned yet" body="Use “Add staff” to attach or create accounts." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role at jail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((member) => (
                <tr key={member.accessId}>
                  <td className="px-4 py-3 font-medium text-slate-800">{member.name}</td>
                  <td className="px-4 py-3 text-slate-600">{member.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={member.roleAtJail}
                      disabled={updateMutation.isPending}
                      onChange={(e) =>
                        updateMutation.mutate({
                          userId: member.userId,
                          body: { roleAtJail: e.target.value as Role },
                        })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        member.isActive
                          ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-600 ring-slate-500/20"
                      }`}
                    >
                      {member.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ userId: member.userId, body: { isActive: false } })}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove access
                    </button>
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

function AddStaffForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleAtJail, setRoleAtJail] = useState<Role>(Role.JailStaff);

  return (
    <form
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[repeat(2,minmax(0,1fr))_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim()) return;
        if (mode === "new" && name.trim().length < 2) return;
        onSubmit(mode === "existing" ? { mode, email: email.trim(), roleAtJail } : { mode, email: email.trim(), name: name.trim(), roleAtJail });
      }}
    >
      <div className="sm:col-span-3 flex gap-2">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === m ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {m === "existing" ? "Attach existing user" : "Create new user"}
          </button>
        ))}
      </div>

      {mode === "new" && (
        <input
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
      )}

      <input
        required
        type="email"
        placeholder={mode === "existing" ? "Search by registered email" : "New account email"}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
      />

      <select
        value={roleAtJail}
        onChange={(e) => setRoleAtJail(e.target.value as Role)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs text-red-700 sm:col-span-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 sm:col-span-3 sm:w-fit"
      >
        {busy ? "Saving…" : mode === "existing" ? "Attach & assign role" : "Create with temp password"}
      </button>
    </form>
  );
}
