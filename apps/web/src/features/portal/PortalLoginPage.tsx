import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PortalLoginResponse } from "@rihai/shared-types";
import { portalApi } from "../../lib/portalApi";
import { extractApiError } from "../../lib/api";
import { usePortalAuthStore } from "../../state/portalAuthStore";

const DEMO_PIN = "2468";

interface DemoAccount {
  prisonerRegNo: string;
  fullName: string;
  jailName: string;
}

type Mode = "login" | "pin-change" | "first-setup" | "forgot";

/**
 * Prisoner Login (/portal/login) — Prompt 10.
 * Deliberately styled and worded like any ordinary consumer login (email +
 * password, welcome-back tone) so it feels familiar rather than institutional:
 *  Layer 1: ID number + PIN (in-custody kiosk AND post-release).
 *  Layer 2: kiosk scanner — functional mock behind KioskBiometricAuthProvider.
 *  Layer 3: DigiLocker placeholder — local-only, never a real OAuth flow.
 */
export default function PortalLoginPage() {
  const navigate = useNavigate();
  const setSession = usePortalAuthStore((s) => s.setSession);

  const [mode, setMode] = useState<Mode>("login");
  const [regNo, setRegNo] = useState("");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [digilockerOpen, setDigilockerOpen] = useState(false);
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
      // Temporary staff-issued PIN: force a change before anything else.
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

  const scannerMutation = useMutation({
    mutationFn: async () => {
      const res = await portalApi.post<PortalLoginResponse>("/portal/auth/login-kiosk-biometric", {
        prisonerRegNo: regNo.trim(),
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
    <div className="min-h-screen bg-cream">
      <div className="wrap-app py-10 sm:py-14">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-navy hover:text-terracotta">
            ← Back to home
          </Link>
          <span className="text-xs font-semibold uppercase tracking-[0.11em] text-bodytext">
            Personal account login
          </span>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_.9fr]">
          <div className="card-shadow rounded-card bg-white p-7 sm:p-9">
            <h1 className="display mb-1.5 text-2xl font-bold text-navy">Welcome back</h1>
            <p className="lede">
              Log in to see your progress, certificates and documents. Your account follows you —
              same login here at the centre and on your own phone later.
            </p>

            {error && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </div>
            )}
            {notice && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                {notice}
              </div>
            )}

            {mode === "login" && (
              <form onSubmit={submitPinLogin} className="mt-6 space-y-4" noValidate>
                <div className="field">
                  <label htmlFor="regno">Your ID number</label>
                  <input
                    id="regno"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    placeholder="The number on your ID card"
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label htmlFor="pin">Your PIN</label>
                  <input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginMutation.isPending || !regNo.trim() || pin.length < 4}
                  className="btn btn-primary w-full justify-center"
                >
                  {loginMutation.isPending ? "Checking…" : "Log in"}
                </button>

                {/* ---- Layer 2: kiosk scanner (mock provider) ---- */}
                {!scannerOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setScannerOpen(true);
                      setError(null);
                    }}
                    className="flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl border-[1.5px] border-navy/70 bg-white px-4 py-3 transition hover:border-saffron hover:bg-[#FFF9F2]"
                  >
                    <span className="text-sm font-bold text-navy">🖐️ Log in with the reader instead</span>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-bodytext">
                      Use the device at the help desk · someone is there to assist
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-peach bg-[#FFF6EC] p-4">
                    {scannerMutation.isPending ? (
                      <p className="text-center text-sm font-semibold text-navy">
                        Reading… please hold your finger on the reader
                      </p>
                    ) : scannerMutation.isSuccess ? (
                      <p className="text-center text-sm font-semibold text-emerald-700">Recognised — signing you in…</p>
                    ) : (
                      <>
                        <p className="subhead-form">Type the ID number shown on your card first</p>
                        <input
                          value={regNo}
                          onChange={(e) => setRegNo(e.target.value)}
                          placeholder="Your ID number"
                          className="input-base mt-2 w-full"
                        />
                        <button
                          type="button"
                          disabled={!regNo.trim()}
                          onClick={() => scannerMutation.mutate()}
                          className="btn btn-navy mt-2 w-full justify-center"
                        >
                          Scan my finger
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ---- Layer 3: DigiLocker placeholder — local-only, never navigates ---- */}
                <button
                  type="button"
                  onClick={() => setDigilockerOpen(true)}
                  className="flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl border-[1.5px] border-navy/70 bg-white px-4 py-3 transition hover:border-terracotta hover:bg-[#FFF9F2]"
                >
                  <span className="text-sm font-bold text-navy">🔐 Continue with DigiLocker</span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-bodytext">
                    For after release · coming soon
                  </span>
                </button>

                <div className="flex flex-wrap justify-between gap-x-6 pt-1 text-[13px] font-semibold">
                  <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-terracotta hover:underline">
                    Forgot PIN?
                  </button>
                  <button type="button" onClick={() => { setMode("first-setup"); setError(null); }} className="text-bodytext hover:text-navy">
                    First time here? Create a PIN
                  </button>
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
                className="mt-6 space-y-4"
                noValidate
              >
                <div className="info-note !bg-[#FFF6EC]">
                  You are using a temporary PIN from the help desk. Pick your own PIN to continue —
                  it stays yours even after you leave.
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
                  className="btn btn-primary w-full justify-center"
                >
                  {changePinMutation.isPending ? "Saving…" : "Save my PIN and continue"}
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
                className="mt-6 space-y-4"
                noValidate
              >
                <div className="info-note !bg-[#FFF6EC]">
                  First-time setup happens at the help desk with a staff member nearby. Enter your
                  ID number and pick a 4–6 digit PIN you will remember.
                </div>
                <div className="field">
                  <label htmlFor="setup-regno">Your ID number</label>
                  <input id="setup-regno" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
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
                  className="btn btn-primary w-full justify-center"
                >
                  {setupPinMutation.isPending ? "Setting up…" : "Create my PIN"}
                </button>
                <BackToLoginButton setMode={setMode} />
              </form>
            )}

            {mode === "forgot" && (
              <div className="mt-6 space-y-4">
                <div className="info-note !bg-[#FFF6EC]">
                  We text a 6-digit code to the family contact saved on your record. This is handy
                  for when you are out and staff are not close by.
                </div>
                <div className="field">
                  <label htmlFor="forgot-regno">Your ID number</label>
                  <input id="forgot-regno" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
                </div>
                {!otpSentTo ? (
                  <button
                    type="button"
                    disabled={requestOtpMutation.isPending || !regNo.trim()}
                    onClick={() => requestOtpMutation.mutate()}
                    className="btn btn-primary w-full justify-center"
                  >
                    {requestOtpMutation.isPending ? "Sending…" : "Send me a code"}
                  </button>
                ) : (
                  <>
                    <p className="text-sm text-bodytext">
                      Code sent to {otpSentTo}. {otpHint && <strong className="font-mono">{otpHint}</strong>}
                    </p>
                    <div className="field">
                      <label htmlFor="otp">6-digit code</label>
                      <input
                        id="otp"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="text-center font-mono tracking-[0.3em]"
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
                      className="btn btn-primary w-full justify-center"
                    >
                      {confirmOtpMutation.isPending ? "Updating…" : "Set new PIN"}
                    </button>
                  </>
                )}
                <BackToLoginButton setMode={setMode} />
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-card border border-peach bg-[#FFF6EC] p-6 sm:p-7">
              <h2 className="display mb-1 text-sm font-bold text-navy">Try a demo account</h2>
              <p className="mb-4 text-xs leading-relaxed text-bodytext">
                Sample profiles with a shared PIN{" "}
                <code className="ml-0.5 inline-block rounded bg-navy px-2 py-px font-mono text-xs text-[#ffe3c2]">
                  {DEMO_PIN}
                </code>{" "}
                — tap one to fill it in.
              </p>
              {demoQuery.isLoading && <p className="text-xs text-bodytext">Loading sample accounts…</p>}
              {demoQuery.isError && (
                <p className="text-xs text-red-700">Could not load demo accounts — type an ID number manually.</p>
              )}
              <ul className="space-y-2.5">
                {(demoQuery.data ?? []).map((acct) => (
                  <li key={acct.prisonerRegNo}>
                    <button
                      type="button"
                      onClick={() => prefillDemo(acct)}
                      className={`w-full cursor-pointer rounded-[10px] border bg-white px-3.5 py-3 text-left transition ${
                        regNo === acct.prisonerRegNo
                          ? "border-terracotta ring-2 ring-terracotta/20"
                          : "border-[#f1e6d5] hover:border-saffron"
                      }`}
                    >
                      <span className="block text-[13.5px] font-bold text-navy">{acct.fullName}</span>
                      <span className="block font-mono text-xs text-bodytext">{acct.prisonerRegNo}</span>
                      {acct.jailName && <span className="block text-[11px] text-bodytext">{acct.jailName}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {!demoQuery.isLoading && (demoQuery.data ?? []).length === 0 && !demoQuery.isError && (
                <p className="text-xs text-bodytext">No demo accounts available right now.</p>
              )}
            </div>

            <div className="rounded-card border border-[#f1e6d5] bg-white p-6 sm:p-7">
              <h2 className="display mb-1 text-sm font-bold text-navy">Three ways in — one account</h2>
              <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-bodytext">
                <li>
                  <strong className="text-navy">ID number + PIN.</strong> Works at the centre today
                  and on your own phone after release — nothing to sign up for twice.
                </li>
                <li>
                  <strong className="text-navy">Reader at the help desk.</strong> Touch the device
                  and go — a staff member is always nearby if anything is unclear.
                </li>
                <li>
                  <strong className="text-navy">DigiLocker (coming soon).</strong> A familiar sign-in
                  option for when you are out.
                </li>
              </ul>
              <p className="info-note mt-5 !bg-white">
                Locked out or stuck? Staff at the help desk can print you a one-time PIN in seconds.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-[13px] font-bold text-terracotta hover:underline"
              >
                Staff / organisation login →
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {digilockerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,15,10,0.5)] p-4"
          onClick={() => setDigilockerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-card bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="display text-lg font-bold text-navy">DigiLocker sign-in is coming soon</h2>
            <p className="info-note mt-3 !bg-[#FFF6EC]">
              Once you are out, you will be able to use your own DigiLocker account here. For now,
              please continue with your ID number and PIN below — it is the same account.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setDigilockerOpen(false);
                  setMode("login");
                  setNotice(null);
                  setError(null);
                }}
                className="btn btn-primary btn-sm"
              >
                Use PIN login instead
              </button>
            </div>
          </div>
        </div>
      )}
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
        <label htmlFor="newpin">Choose your new PIN (4–6 digits)</label>
        <input
          id="newpin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={props.newPin}
          onChange={(e) => props.setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          autoComplete="new-password"
        />
      </div>
      <div className="field">
        <label htmlFor="confirmpin">Re-enter the PIN to confirm</label>
        <input
          id="confirmpin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={props.confirmPin}
          onChange={(e) => props.setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          className={
            props.confirmPin.length > 0
              ? props.confirmPin === props.newPin
                ? "!border-emerald-500"
                : "!border-red-400"
              : ""
          }
          autoComplete="new-password"
        />
      </div>
    </>
  );
}

function BackToLoginButton({ setMode }: { setMode: (m: Mode) => void }) {
  return (
    <button
      type="button"
      onClick={() => setMode("login")}
      className="w-full text-center text-sm font-semibold text-bodytext hover:text-navy"
    >
      ← Back to PIN login
    </button>
  );
}
