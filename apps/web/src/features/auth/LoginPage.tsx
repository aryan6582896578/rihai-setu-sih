import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import type { LoginResponse } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useLang, LangToggle } from "../../lib/i18n";
import { useAuthStore } from "../../state/authStore";

const DEMO_ACCOUNTS = [
  { key: "demo.admin.role", email: "superadmin@rihai.gov.in" },
  { key: "demo.super.role", email: "superintendent1@rihai.gov.in" },
  { key: "demo.staff.role", email: "staff1a@rihai.gov.in" },
  { key: "demo.dlsa.role", email: "dlsa@rihai.gov.in" },
  { key: "demo.ngo.role", email: "ngo1@rihai.gov.in" },
];
const DEMO_PASSWORD = "Passw0rd!23";

export default function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { t } = useLang();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotDone, setForgotDone] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [ssoOpen, setSsoOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const loginMutation = useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const res = await api.post<LoginResponse & { mfaRequired?: boolean; challengeToken?: string }>(
        "/auth/login",
        body,
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data.mfaRequired && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        return;
      }
      if ("user" in data && "accessToken" in data) {
        setSession(data.user, data.accessToken);
        navigate(data.user.role === "ngo_partner" ? "/ngo" : "/jails");
      }
    },
  });

  const mfaMutation = useMutation({
    mutationFn: async (body: { challengeToken: string; code: string }) => {
      const res = await api.post<LoginResponse>("/auth/mfa/verify", body);
      return res.data;
    },
    onSuccess: (data) => {
      setSession(data.user, data.accessToken);
      navigate(data.user.role === "ngo_partner" ? "/ngo" : "/jails");
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

  const handleMfaSubmit = (e: FormEvent) => {
    e.preventDefault();
    setClientError(null);
    if (!challengeToken) return;
    mfaMutation.mutate({ challengeToken, code: mfaCode.trim() });
  };

  /**
   * PROMPT 9 PLACEHOLDER — deliberately local-only. No OAuth client, no redirect,
   * no token exchange: NIC MeriPehchaan integration does not exist yet.
   */
  const openSsoNotice = () => setSsoOpen(true);

  const dismissSsoToStaffLogin = () => {
    setSsoOpen(false);
    setEmail((e) => e);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="wrap-app py-10 sm:py-14">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-navy hover:text-terracotta">
            {t("login.back")}
          </Link>
          <LangToggle />
        </div>

        {challengeToken ? (
          <div className="card-shadow mx-auto max-w-md rounded-card bg-white p-7 sm:p-8">
            <h1 className="display mb-1.5 text-2xl font-bold text-navy">{t("login.mfa.h")}</h1>
            <p className="lede">{t("login.mfa.lede")}</p>
            <form onSubmit={handleMfaSubmit} className="mt-6 space-y-4" noValidate>
              {(clientError || mfaMutation.isError) && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  {clientError ?? extractApiError(mfaMutation.error).message}
                </div>
              )}
              <div className="field">
                <label htmlFor="mfa-code">{t("login.mfa.code")}</label>
                <input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center font-mono text-xl tracking-[0.4em]"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={mfaMutation.isPending || mfaCode.length !== 6}
                className="btn btn-primary w-full justify-center"
              >
                {mfaMutation.isPending ? t("login.mfa.verifying") : t("login.mfa.verify")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setMfaCode("");
                  setClientError(null);
                }}
                className="w-full text-center text-sm font-semibold text-bodytext hover:text-navy"
              >
                {t("login.mfa.back")}
              </button>
            </form>
          </div>
        ) : (
          <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_.9fr]">
            <div className="card-shadow rounded-card bg-white p-7 sm:p-9">
              <h1 className="display mb-1.5 text-2xl font-bold text-navy">{t("login.h")}</h1>
              <p className="lede">{t("login.lede")}</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                {(clientError || loginMutation.isError) && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    {clientError ?? extractApiError(loginMutation.error).message}
                  </div>
                )}

                <div className="field">
                  <label htmlFor="email">{t("login.email")}</label>
                  <input
                    id="email"
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@rihai.gov.in"
                  />
                </div>

                <div className="field">
                  <label htmlFor="password">{t("login.pass")}</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="btn btn-primary w-full justify-center"
                >
                  {loginMutation.isPending ? t("login.signing") : t("login.signin")}
                </button>

                {/* ---- Government SSO placeholder (Prompt 9) ---- */}
                <div className="flex items-center gap-3 py-1" aria-hidden="true">
                  <span className="h-px flex-1 bg-[#ece2d3]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-bodytext">
                    {t("sso.or")}
                  </span>
                  <span className="h-px flex-1 bg-[#ece2d3]" />
                </div>
                <button
                  type="button"
                  onClick={openSsoNotice}
                  className="flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl border-[1.5px] border-navy/70 bg-white px-4 py-3 transition hover:border-terracotta hover:bg-[#FFF9F2]"
                >
                  <span className="text-sm font-bold text-navy">🔐 {t("sso.button")}</span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-bodytext">
                    {t("sso.badge")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setForgotOpen((v) => !v)}
                  className="block w-full text-center text-[13px] font-semibold text-terracotta hover:underline"
                >
                  {t("login.forgot")}
                </button>

                <Link
                  to="/portal/login"
                  className="block w-full text-center text-[13px] font-semibold text-bodytext hover:text-navy"
                >
                  Are you a prisoner (in custody or released)? Use the{" "}
                  <span className="text-terracotta">prisoner portal</span> →
                </Link>

                {forgotOpen && (
                  <div className="rounded-lg border border-peach bg-[#FFF6EC] p-4">
                    {forgotDone || forgotMutation.isSuccess ? (
                      <p className="text-sm font-medium text-emerald-800">{t("login.forgot.done")}</p>
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
                          placeholder={t("login.email")}
                          className="input-base min-w-0 flex-1"
                        />
                        <button type="submit" disabled={forgotMutation.isPending} className="btn btn-navy shrink-0 disabled:opacity-60">
                          {t("demo.send")}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </form>
            </div>

            <aside className="rounded-card border border-peach bg-[#FFF6EC] p-6 sm:p-7">
              <h2 className="display mb-1 text-sm font-bold text-navy">{t("demo.h")}</h2>
              <p className="mb-4 text-xs leading-relaxed text-bodytext">
                {t("demo.lede")}{" "}
                <code className="ml-0.5 inline-block rounded bg-navy px-2 py-px font-mono text-xs text-[#ffe3c2]">
                  {DEMO_PASSWORD}
                </code>
              </p>
              <ul className="space-y-2.5">
                {DEMO_ACCOUNTS.map((acct) => (
                  <li key={acct.email}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(acct.email);
                        setPassword(DEMO_PASSWORD);
                        setClientError(null);
                      }}
                      className={`w-full cursor-pointer rounded-[10px] border bg-white px-3.5 py-3 text-left transition ${
                        email === acct.email
                          ? "border-terracotta ring-2 ring-terracotta/20"
                          : "border-[#f1e6d5] hover:border-saffron"
                      }`}
                    >
                      <span className="block text-[13.5px] font-bold text-navy">{t(acct.key)}</span>
                      <span className="block font-mono text-xs text-bodytext">{acct.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </div>

      {/* SSO notice modal — local-only, never navigates, never calls the network */}
      {ssoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,15,10,0.5)] p-4" onClick={() => setSsoOpen(false)}>
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-lg font-bold text-navy">{t("sso.modal.title")}</h2>
            <p className="info-note mt-3 !bg-[#FFF6EC]">{t("sso.modal.body")}</p>
            <div className="mt-5 flex justify-end">
              <button onClick={dismissSsoToStaffLogin} className="btn btn-primary btn-sm">
                {t("sso.use_staff")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
