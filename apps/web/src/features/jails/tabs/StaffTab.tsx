import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Role, type CreateStaffResult, type StaffMember } from "@rihai/shared-types";
import { api, extractApiError } from "../../../lib/api";
import { useLang } from "../../../lib/i18n";
import { EmptyState, ErrorBanner, Spinner } from "../../../components/ui";

const ROLE_OPTIONS: { value: Role; labelKey: string }[] = [
  { value: Role.JailSuperintendent, labelKey: "role.jail_superintendent" },
  { value: Role.JailStaff, labelKey: "role.jail_staff" },
  { value: Role.DlsaLawyer, labelKey: "role.dlsa_lawyer" },
  { value: Role.Viewer, labelKey: "role.viewer" },
];

export default function StaffTab({ jailId }: { jailId: string }) {
  const queryClient = useQueryClient();
  const { t } = useLang();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="lede">{t("emp.lede")}</p>
        <button
          onClick={() => {
            setAddOpen((v) => !v);
            setTempPassword(null);
          }}
          className="btn btn-primary btn-sm"
        >
          {addOpen ? t("emp.close") : t("emp.addstaff")}
        </button>
      </div>

      {tempPassword && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-semibold">{t("emp.created")}</span> {t("emp.temp")}{" "}
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
        <EmptyState icon="👥" title={t("staff.none.h")} body={t("staff.none.b")} />
      ) : (
        <div className="panel-tight">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>{t("th.name")}</th>
                <th>{t("th.email")}</th>
                <th>{t("th.role")}</th>
                <th>{t("th.status")}</th>
                <th className="text-right">{t("th.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.accessId}>
                  <td className="font-semibold text-navy">{member.name}</td>
                  <td className="text-bodytext">{member.email}</td>
                  <td>
                    <select
                      value={member.roleAtJail}
                      disabled={updateMutation.isPending}
                      onChange={(e) =>
                        updateMutation.mutate({
                          userId: member.userId,
                          body: { roleAtJail: e.target.value as Role },
                        })
                      }
                      className="input-base px-2 py-1.5 text-xs"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {t(r.labelKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {member.isActive ? (
                      <span className="status-active">{t("status.active")}</span>
                    ) : (
                      <span className="pill-neutral">{t("status.inactive")}</span>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ userId: member.userId, body: { isActive: false } })}
                      className="link-danger disabled:opacity-50"
                    >
                      {t("action.remove")}
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
  const { t } = useLang();

  return (
    <form
      className="card-shadow grid gap-3 rounded-card bg-white p-5 sm:grid-cols-2 sm:gap-x-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim()) return;
        if (mode === "new" && name.trim().length < 2) return;
        onSubmit(mode === "existing" ? { mode, email: email.trim(), roleAtJail } : { mode, email: email.trim(), name: name.trim(), roleAtJail });
      }}
    >
      <div className="flex gap-2 sm:col-span-2">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold ${
              mode === m ? "bg-navy text-white" : "bg-slate-200 text-navy hover:bg-[#d8dde3]"
            }`}
          >
            {m === "existing" ? t("staff.attach") : t("staff.create")}
          </button>
        ))}
      </div>

      {mode === "new" && (
        <input
          required
          placeholder={t("staff.name.ph")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-base"
        />
      )}

      <input
        required
        type="email"
        placeholder={mode === "existing" ? t("staff.email.existing") : t("staff.email.new")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input-base"
      />

      <select
        value={roleAtJail}
        onChange={(e) => setRoleAtJail(e.target.value as Role)}
        className="input-base"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {t(r.labelKey)}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs font-medium text-red-700 sm:col-span-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary w-fit disabled:opacity-60 sm:col-span-2"
      >
        {busy ? t("staff.saving") : mode === "existing" ? t("staff.submit.attach") : t("staff.submit.create")}
      </button>
    </form>
  );
}
