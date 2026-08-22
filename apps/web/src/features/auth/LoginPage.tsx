import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import type { LoginResponse } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useAuthStore } from "../../state/authStore";

const DEMO_ACCOUNTS = [
  { label: "Superintendent — Rampur", email: "superintendent1@rihai.gov.in" },
  { label: "Jail staff — Rampur", email: "staff1@rihai.gov.in" },
  { label: "Super admin (all jails)", email: "superadmin@rihai.gov.in" },
  { label: "DLSA lawyer", email: "dlsa@rihai.gov.in" },
];
const DEMO_PASSWORD = "Passw0rd!23";

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotDone, setForgotDone] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const res = await api.post<LoginResponse>("/auth/login", body);
      return res.data;
    },
    onSuccess: (data) => {
      setSession(data.user, data.accessToken);
      navigate("/jails");
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async (email: string) => {
      await api.post("/auth/forgot-password", { email });
    },
    onSuccess: () => setForgotDone(true),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setClientError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setClientError("Enter a valid email address.");
      return;
    }
    if (password.length < 1) {
      setClientError("Password is required.");
      return;
    }
    loginMutation.mutate({ email: email.trim().toLowerCase(), password });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
          ← Back to home
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff login</h1>
            <p className="mt-1 text-sm text-slate-500">
              Access is role-based and jail-scoped. Contact your superintendent if you lack access.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {(clientError || loginMutation.isError) && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {clientError ??
                    extractApiError(loginMutation.error).message}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="you@rihai.gov.in"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:opacity-60"
              >
                {loginMutation.isPending ? "Signing in…" : "Sign in"}
              </button>

              <button
                type="button"
                onClick={() => setForgotOpen((v) => !v)}
                className="w-full text-center text-sm text-blue-700 hover:underline"
              >
                Forgot password?
              </button>

              {forgotOpen && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {forgotDone || forgotMutation.isSuccess ? (
                    <p className="text-sm text-emerald-800">
                      If that account exists, a reset has been initiated. The reset token appears in the API server log
                      (no email service yet).
                    </p>
                  ) : (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
                          forgotMutation.mutate(forgotEmail.trim().toLowerCase());
                        }
                      }}
                    >
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="Account email"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={forgotMutation.isPending}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                      >
                        Send
                      </button>
                    </form>
                  )}
                </div>
              )}
            </form>
          </div>

          <aside className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-900">Demo accounts</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-800/80">
              Seeded synthetic data for development. Password for all demo accounts:
              <code className="ml-1 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800">{DEMO_PASSWORD}</code>
            </p>
            <ul className="mt-4 space-y-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <li key={acct.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(acct.email);
                      setPassword(DEMO_PASSWORD);
                      setClientError(null);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      email === acct.email
                        ? "border-blue-500 bg-white ring-2 ring-blue-200"
                        : "border-transparent bg-white/70 hover:border-blue-300"
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-800">{acct.label}</span>
                    <span className="block text-xs text-slate-500">{acct.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
