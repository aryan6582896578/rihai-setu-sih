import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import type { LoginResponse } from "@rihai/shared-types";
import { api, extractApiError } from "../../lib/api";
import { useLang, LangToggle } from "../../lib/i18n";
import { useAuthStore } from "../../state/authStore";
import logoImg from "../../public/rihai_setu_logo.png";

const DEMO_ACCOUNTS = [
  { key: "demo.admin.role", email: "superadmin@rihai.gov.in", roleTag: "Super Admin", desc: "Access all 6 correctional facilities" },
  { key: "demo.super.role", email: "superintendent1@rihai.gov.in", roleTag: "Jail Superintendent", desc: "Yamuna Central Prison scope" },
  { key: "demo.staff.role", email: "staff1a@rihai.gov.in", roleTag: "Jailor", desc: "Yamuna Central Prison scope" },
  { key: "demo.dlsa.role", email: "dlsa@rihai.gov.in", roleTag: "DLSA Advocate", desc: "Yamuna & Vindhyachal scope" },
  { key: "demo.ngo.role", email: "ngo1@rihai.gov.in", roleTag: "NGO Partner", desc: "Seva Foundation Rehabilitation" },
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

  const openSsoNotice = () => setSsoOpen(true);

  const dismissSsoToStaffLogin = () => {
    setSsoOpen(false);
    setEmail((e) => e);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between">
      <div>
        {/* ---------- Navbar ---------- */}
        <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
          <div className="wrap-app flex items-center justify-between py-3">
            <Link to="/" className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="RIHAI SETU"
                className="h-11 w-11 rounded-[10px] object-cover shadow-sm"
              />
              <span className="leading-tight">
                <span className="display block text-[19px] font-extrabold tracking-tight text-navy">
                  {t("brand.name")}
                </span>
                <span className="block text-[10.5px] uppercase tracking-[0.11em] text-bodytext">
                  {t("brand.tag")}
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-3 sm:gap-4">
              <Link to="/" className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-navy hover:text-terracotta transition-colors">
                {t("login.back")}
              </Link>
              <LangToggle />
              <Link to="/portal/login" className="btn btn-primary btn-sm hidden sm:inline-flex">
                Citizen portal →
              </Link>
            </div>
          </div>
        </header>



        {/* ---------- Main Content Grid ---------- */}
        <div className="wrap-app py-10 sm:py-14">
          {challengeToken ? (
            <div className="card-shadow mx-auto max-w-md rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-7 sm:p-9 shadow-xl">
              <h2 className="display mb-1.5 text-2xl font-bold text-navy">{t("login.mfa.h")}</h2>
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
                  className="btn btn-primary w-full justify-center py-3 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
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
            <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_.9fr]">
              {/* Form Card */}
              <div className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-7 sm:p-10 shadow-xl transition-all hover:border-terracotta/40">
                <div className="mb-6 flex items-center gap-3.5 border-b border-[#eee4d6] pb-5">
                  <img src={logoImg} alt="RIHAI SETU" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
                  <div>
                    <h2 className="display text-2xl font-bold text-navy">{t("login.h")}</h2>
                    <p className="text-xs text-bodytext">{t("login.lede")}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {(clientError || loginMutation.isError) && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                      {clientError ?? extractApiError(loginMutation.error).message}
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="email" className="font-semibold text-navy text-sm">{t("login.email")}</label>
                    <input
                      id="email"
                      ref={emailRef}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@rihai.gov.in"
                      className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy transition focus:border-terracotta focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/20"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="password" className="font-semibold text-navy text-sm">{t("login.pass")}</label>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy transition focus:border-terracotta focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loginMutation.isPending}
                    className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                  >
                    {loginMutation.isPending ? t("login.signing") : t("login.signin")}
                  </button>

                  {/* ---- Government SSO placeholder ---- */}
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
                    className="flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl border-[1.5px] border-navy/70 bg-white px-4 py-3 transition hover:border-terracotta hover:bg-[#FFF9F2] shadow-sm"
                  >
                    <span className="text-sm font-bold text-navy">🔐 {t("sso.button")}</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-bodytext">
                      {t("sso.badge")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setForgotOpen((v) => !v)}
                    className="block w-full text-center text-[13px] font-semibold text-terracotta hover:underline pt-1"
                  >
                    {t("login.forgot")}
                  </button>

                  <Link
                    to="/portal/login"
                    className="block w-full rounded-xl border border-terracotta/30 bg-[#FFF8F2] p-3 text-center text-[13px] font-semibold text-navy hover:border-terracotta hover:bg-[#FFEFE2] transition"
                  >
                    Are you an in-custody applicant or released candidate? Use the{" "}
                    <span className="text-terracotta font-bold">Citizen Portal</span> →
                  </Link>

                  {forgotOpen && (
                    <div className="rounded-xl border border-peach bg-[#FFF6EC] p-4">
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

              {/* Demo Accounts Panel */}
              <aside className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-[#FAF7F2] p-6 sm:p-8 shadow-lg">
                <div className="mb-4 flex items-center justify-between border-b border-[#eee4d6] pb-3.5">
                  <h2 className="display text-base font-bold text-navy">{t("demo.h")}</h2>
                  <span className="rounded-full bg-navy px-2.5 py-0.5 font-mono text-[11px] font-bold text-saffron">
                    {DEMO_PASSWORD}
                  </span>
                </div>
                <p className="mb-4 text-xs leading-relaxed text-bodytext">
                  Seeded synthetic accounts for development. Click any account below to autofill login details instantly:
                </p>
                <ul className="space-y-3">
                  {DEMO_ACCOUNTS.map((acct) => (
                    <li key={acct.email}>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(acct.email);
                          setPassword(DEMO_PASSWORD);
                          setClientError(null);
                        }}
                        className={`w-full cursor-pointer rounded-xl border bg-white p-3.5 text-left transition-all ${
                          email === acct.email
                            ? "border-terracotta ring-2 ring-terracotta/20 shadow-md"
                            : "border-[#f1e6d5] hover:border-terracotta/60 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[13.5px] font-extrabold text-navy truncate">{t(acct.key).split(" — ")[0]}</span>
                          <span className="shrink-0 rounded-md bg-terracotta/10 px-2 py-0.5 text-[10px] font-bold text-terracotta">
                            {acct.roleTag}
                          </span>
                        </div>
                        <span className="block font-mono text-xs font-semibold text-bodytext">{acct.email}</span>
                        <span className="mt-0.5 block text-[11px] text-[#808c9e]">
                          {t(acct.key).includes(" — ") ? t(acct.key).split(" — ")[1] : acct.desc}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy pt-8 pb-6 text-[#c3cad5]">
        <div className="wrap-app flex flex-wrap items-center justify-between gap-4 text-xs text-[#9aa4b2]">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="RIHAI SETU Logo" className="h-7 w-7 rounded-lg bg-white p-0.5 object-cover" />
            <span className="font-extrabold text-white">{t("brand.name")}</span>
            <span>— Rehabilitation & Legal Aid Platform</span>
          </div>
          <span>{t("footer.copyright")}</span>
        </div>
      </footer>

      {/* SSO notice modal */}
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
