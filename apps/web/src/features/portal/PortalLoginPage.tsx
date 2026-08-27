import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PortalLoginResponse } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { extractApiError } from "../../lib/api";
import { usePortalAuthStore } from "../../state/portalAuthStore";
import { LangToggle, useLang } from "../../lib/i18n";
import logoImg from "../../public/rihai_setu_logo.png";

const DEMO_PIN = "2468";

interface DemoAccount {
  prisonerRegNo: string;
  fullName: string;
  jailName: string;
}

type Mode = "login" | "pin-change" | "first-setup" | "forgot";

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const setSession = usePortalAuthStore((s) => s.setSession);
  const { t } = useLang();

  const [mode, setMode] = useState<Mode>("login");
  const [regNo, setRegNo] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const demoQuery = useQuery({
    queryKey: ["portal-demo-accounts"],
    queryFn: async () => {
      const res = await portalApi.get<{ data: DemoAccount[] }>("/portal/auth/demo-accounts");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const finishLogin = (data: PortalLoginResponse) => {
    if (data.pinChangeRequired) {
      setSession(data.prisoner, data.accessToken);
      setNewPin("");
      setConfirmPin("");
      setMode("pin-change");
      return;
    }
    setSession(data.prisoner, data.accessToken);
    navigate("/portal/profile");
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalLoginResponse>("/portal/auth/login-pin", {
        prisonerRegNo: regNo.trim(),
        pin,
      });
      return res.data;
    },
    onSuccess: finishLogin,
    onError: (e) => setError(extractApiError(e).message),
  });

  const changePinMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<{ data: { accessToken: string } }>("/portal/auth/set-pin", {
        newPin,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      usePortalAuthStore.getState().setAccessToken(data.accessToken);
      navigate("/portal/profile");
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const setupPinMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<{ data: { accessToken: string } }>("/portal/auth/set-pin", {
        prisonerRegNo: regNo.trim(),
        newPin,
      });
      return res.data.data;
    },
    onSuccess: async (data) => {
      const me = await portalApi.get<{
        data: { prisonerId: string; fullName: string; prisonerRegNo: string; jailName?: string };
      }>("/portal/profile", { headers: { Authorization: `Bearer ${data.accessToken}` } });
      setSession(
        {
          prisonerId: me.data.data.prisonerId,
          fullName: me.data.data.fullName,
          prisonerRegNo: me.data.data.prisonerRegNo,
          jailName: me.data.data.jailName ?? "",
        },
        data.accessToken,
      );
      navigate("/portal/profile");
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<{ ok: boolean; sentTo: string | null; devOtp?: string }>(
        "/portal/auth/reset-pin/request-otp",
        { prisonerRegNo: regNo.trim() },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setOtpSentTo(data.sentTo ?? "your family contact number");
      setOtpHint(data.devOtp ? `Demo code: ${data.devOtp}` : null);
      setNotice(null);
      setError(null);
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const confirmOtpMutation = useMutation({
    mutationFn: async () => {
      await portalApi.post("/portal/auth/reset-pin/confirm", {
        prisonerRegNo: regNo.trim(),
        otp,
        newPin,
      });
    },
    onSuccess: () => {
      setMode("login");
      setNotice("PIN updated. Log in with your ID number and new PIN.");
      setOtpSentTo(null);
      setOtpHint(null);
      setOtp("");
      setNewPin("");
      setConfirmPin("");
      setPin("");
    },
    onError: (e) => setError(extractApiError(e).message),
  });

  const pinsMatch = newPin.length >= 4 && newPin === confirmPin;

  const submitPinLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!regNo.trim() || pin.length < 4) return;
    setError(null);
    setNotice(null);
    loginMutation.mutate();
  };

  const prefillDemo = (acct: DemoAccount) => {
    setMode("login");
    setRegNo(acct.prisonerRegNo);
    setPin(DEMO_PIN);
    setError(null);
    setNotice(null);
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
                {t("portal.login.back")}
              </Link>
              <LangToggle />
              <Link to="/login" className="btn btn-navy btn-sm hidden sm:inline-flex">
                Staff login →
              </Link>
            </div>
          </div>
        </header>



        {/* ---------- Main Content Grid ---------- */}
        <div className="wrap-app py-10 sm:py-14">
          <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_.9fr]">
            {/* Form Card */}
            <div className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-white p-7 sm:p-10 shadow-xl transition-all hover:border-terracotta/40">
              <div className="mb-6 flex items-center gap-3.5 border-b border-[#eee4d6] pb-5">
                <img src={logoImg} alt="RIHAI SETU" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
                <div>
                  <h2 className="display text-2xl font-bold text-navy">{t("portal.login.welcome")}</h2>
                  <p className="text-xs text-bodytext">{t("portal.login.desc")}</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  {error}
                </div>
              )}
              {notice && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  {notice}
                </div>
              )}

              {mode === "login" && (
                <form onSubmit={submitPinLogin} className="space-y-4" noValidate>
                  <div className="field">
                    <label htmlFor="regno" className="font-semibold text-navy text-sm">{t("portal.login.regno")}</label>
                    <input
                      id="regno"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder={t("portal.login.regno_ph")}
                      autoComplete="username"
                      className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy transition focus:border-terracotta focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/20"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pin" className="font-semibold text-navy text-sm">{t("portal.login.pin")}</label>
                    <input
                      id="pin"
                      type="password"
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••"
                      autoComplete="current-password"
                      className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy transition focus:border-terracotta focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loginMutation.isPending || !regNo.trim() || pin.length < 4}
                    className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                  >
                    {loginMutation.isPending ? t("portal.login.checking") : t("portal.login.btn")}
                  </button>

                  <div className="flex flex-wrap justify-between gap-x-6 pt-2 text-[13px] font-semibold border-t border-[#EEE4D6] mt-4">
                    <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-terracotta hover:underline">
                      {t("portal.login.forgot")}
                    </button>
                    <button type="button" onClick={() => { setMode("first-setup"); setError(null); }} className="text-bodytext hover:text-navy">
                      {t("portal.login.firsttime")}
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#EEE4D6] bg-[#FFF8F2] p-3.5 text-center text-xs">
                    <span className="text-bodytext">{t("portal.login.stafflink")} </span>
                    <Link to="/login" className="font-bold text-terracotta hover:underline ml-1">
                      {t("portal.login.stafflink_btn")} →
                    </Link>
                  </div>
                </form>
              )}

              {mode === "pin-change" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    if (pinsMatch) changePinMutation.mutate();
                  }}
                  className="space-y-4"
                  noValidate
                >
                  <div className="info-note !bg-[#FFF6EC]">
                    {t("portal.login.tempnote")}
                  </div>
                  <PinPairFields
                    newPin={newPin}
                    confirmPin={confirmPin}
                    setNewPin={setNewPin}
                    setConfirmPin={setConfirmPin}
                  />
                  <button
                    type="submit"
                    disabled={changePinMutation.isPending || !pinsMatch}
                    className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                  >
                    {changePinMutation.isPending ? t("portal.login.saving") : t("portal.login.savepin")}
                  </button>
                </form>
              )}

              {mode === "first-setup" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    if (pinsMatch) setupPinMutation.mutate();
                  }}
                  className="space-y-4"
                  noValidate
                >
                  <div className="info-note !bg-[#FFF6EC]">
                    {t("portal.login.setupnote")}
                  </div>
                  <div className="field">
                    <label htmlFor="setup-regno" className="font-semibold text-navy text-sm">{t("portal.login.regno")}</label>
                    <input id="setup-regno" value={regNo} onChange={(e) => setRegNo(e.target.value)} className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy" />
                  </div>
                  <PinPairFields
                    newPin={newPin}
                    confirmPin={confirmPin}
                    setNewPin={setNewPin}
                    setConfirmPin={setConfirmPin}
                  />
                  <button
                    type="submit"
                    disabled={setupPinMutation.isPending || !pinsMatch || !regNo.trim()}
                    className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                  >
                    {setupPinMutation.isPending ? t("portal.login.settingup") : t("portal.login.createpin")}
                  </button>
                  <BackToLoginButton setMode={setMode} />
                </form>
              )}

              {mode === "forgot" && (
                <div className="space-y-4">
                  <div className="info-note !bg-[#FFF6EC]">
                    We text a 6-digit code to the family contact saved on your record. This is handy
                    for when you are out and staff are not close by.
                  </div>
                  <div className="field">
                    <label htmlFor="forgot-regno" className="font-semibold text-navy text-sm">Your ID number</label>
                    <input id="forgot-regno" value={regNo} onChange={(e) => setRegNo(e.target.value)} className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy" />
                  </div>
                  {!otpSentTo ? (
                    <button
                      type="button"
                      disabled={requestOtpMutation.isPending || !regNo.trim()}
                      onClick={() => requestOtpMutation.mutate()}
                      className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                    >
                      {requestOtpMutation.isPending ? "Sending…" : "Send me a code"}
                    </button>
                  ) : (
                    <>
                      <p className="text-sm text-bodytext">
                        Code sent to {otpSentTo}. {otpHint && <strong className="font-mono">{otpHint}</strong>}
                      </p>
                      <div className="field">
                        <label htmlFor="otp" className="font-semibold text-navy text-sm">6-digit code</label>
                        <input
                          id="otp"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-center font-mono tracking-[0.3em] text-navy"
                          placeholder="000000"
                        />
                      </div>
                      <PinPairFields
                        newPin={newPin}
                        confirmPin={confirmPin}
                        setNewPin={setNewPin}
                        setConfirmPin={setConfirmPin}
                      />
                      <button
                        type="button"
                        disabled={confirmOtpMutation.isPending || otp.length !== 6 || !pinsMatch}
                        onClick={() => confirmOtpMutation.mutate()}
                        className="btn btn-primary w-full justify-center py-3.5 text-base font-bold shadow-[0_6px_20px_rgba(217,83,30,0.35)]"
                      >
                        {confirmOtpMutation.isPending ? "Updating…" : "Set new PIN"}
                      </button>
                    </>
                  )}
                  <BackToLoginButton setMode={setMode} />
                </div>
              )}
            </div>

            {/* Demo Accounts Panel */}
            <aside className="rounded-[24px] border-[2px] border-[#f0e4d3] bg-[#FAF7F2] p-6 sm:p-8 shadow-lg">
              <div className="mb-4 flex items-center justify-between border-b border-[#eee4d6] pb-3.5">
                <h2 className="display text-base font-bold text-navy">{t("portal.login.demotitle")}</h2>
                <span className="rounded-full bg-navy px-2.5 py-0.5 font-mono text-[11px] font-bold text-saffron">
                  PIN: {DEMO_PIN}
                </span>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-bodytext">
                Sample applicant profiles for testing. Click any candidate below to autofill login credentials:
              </p>
              {demoQuery.isLoading && <p className="text-xs text-bodytext">Loading sample accounts…</p>}
              {demoQuery.isError && (
                <p className="text-xs text-red-700">Could not load demo accounts — type an ID number manually.</p>
              )}
              <ul className="space-y-3">
                {(demoQuery.data ?? []).map((acct) => (
                  <li key={acct.prisonerRegNo}>
                    <button
                      type="button"
                      onClick={() => prefillDemo(acct)}
                      className={`w-full cursor-pointer rounded-xl border bg-white p-3.5 text-left transition-all ${
                        regNo === acct.prisonerRegNo
                          ? "border-terracotta ring-2 ring-terracotta/20 shadow-md"
                          : "border-[#f1e6d5] hover:border-terracotta/60 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13.5px] font-extrabold text-navy">{acct.fullName}</span>
                        <span className="rounded-md bg-terracotta/10 px-2 py-0.5 text-[10px] font-bold text-terracotta">
                          Undertrial
                        </span>
                      </div>
                      <span className="block font-mono text-xs font-semibold text-bodytext">{acct.prisonerRegNo}</span>
                      {acct.jailName && <span className="mt-0.5 block text-[11px] text-[#808c9e]">{acct.jailName}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy pt-8 pb-6 text-[#c3cad5]">
        <div className="wrap-app flex flex-wrap items-center justify-between gap-4 text-xs text-[#9aa4b2]">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="RIHAI SETU Logo" className="h-7 w-7 rounded-lg bg-white p-0.5 object-cover" />
            <span className="font-extrabold text-white">{t("brand.name")}</span>
            <span>— Citizen & Applicant Kiosk Portal</span>
          </div>
          <span>{t("footer.copyright")}</span>
        </div>
      </footer>
    </div>
  );
}

function PinPairFields(props: {
  newPin: string;
  confirmPin: string;
  setNewPin: (v: string) => void;
  setConfirmPin: (v: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="newpin" className="font-semibold text-navy text-sm">Choose your new PIN (4–6 digits)</label>
        <input
          id="newpin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={props.newPin}
          onChange={(e) => props.setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          autoComplete="new-password"
          className="rounded-xl border border-[#EBE3D7] bg-[#FAF7F2] px-4 py-3 text-sm text-navy"
        />
      </div>
      <div className="field">
        <label htmlFor="confirmpin" className="font-semibold text-navy text-sm">Re-enter the PIN to confirm</label>
        <input
          id="confirmpin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={props.confirmPin}
          onChange={(e) => props.setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          className={`rounded-xl border bg-[#FAF7F2] px-4 py-3 text-sm text-navy ${
            props.confirmPin.length > 0
              ? props.confirmPin === props.newPin
                ? "!border-emerald-500"
                : "!border-red-400"
              : "border-[#EBE3D7]"
          }`}
          autoComplete="new-password"
        />
      </div>
    </>
  );
}

function BackToLoginButton({ setMode }: { setMode: (m: Mode) => void }) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={() => setMode("login")}
      className="w-full text-center text-sm font-semibold text-bodytext hover:text-navy"
    >
      {t("portal.login.backtologin")}
    </button>
  );
}
