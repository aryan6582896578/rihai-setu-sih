import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUnreadCount } from "../features/notifications/NotificationsPage";
import { api, extractApiError } from "../lib/api";
import { useLang, LangToggle } from "../lib/i18n";
import { useAuthStore } from "../state/authStore";
import SessionKeepAlive from "./SessionKeepAlive";
import logoImg from "../public/rihai_setu_logo.png";

const NAV_LINKS: { to: string; labelKey: string; roles?: string[] }[] = [
  { to: "/jails", labelKey: "nav.jails" },
  {
    to: "/admin/data-ingestion",
    labelKey: "nav.dataingestion",
    roles: ["super_admin", "jail_superintendent"],
  },
  { to: "/overcrowding", labelKey: "nav.overcrowding", roles: ["super_admin"] },
];

export default function Layout() {
  const { data: notifData } = useUnreadCount();
  const unread = notifData?.unread;
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLang();
  const location = useLocation();
  const isNgoRoute = location.pathname.startsWith("/ngo");
  const showLangToggle = !isNgoRoute;
  const [menuOpen, setMenuOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMsg, setMfaMsg] = useState<string | null>(null);
  const [mfaErr, setMfaErr] = useState<string | null>(null);

  const isManager = user?.role === "super_admin" || user?.role === "jail_superintendent";

  const linksForMe = NAV_LINKS.filter((l) => !l.roles || (user && l.roles.includes(user.role)));

  const startEnroll = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { secret: string; otpauthUrl: string } }>("/auth/mfa/enroll");
      return res.data.data;
    },
    onSuccess: (d) => {
      setMfaSecret(d.secret);
      setMfaMsg(null);
      setMfaErr(null);
    },
    onError: (e) => setMfaErr(extractApiError(e).message),
  });

  const confirmEnroll = useMutation({
    mutationFn: async (code: string) => {
      await api.post("/auth/mfa/confirm", { code });
    },
    onSuccess: () => {
      setMfaMsg("Two-factor authentication is now enabled for this account.");
      setMfaSecret(null);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setMfaErr(extractApiError(e).message),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      await api.post("/auth/sessions/revoke-all");
    },
    onSuccess: async () => {
      await logout();
      navigate("/login");
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
        <div className="wrap-app flex items-center justify-between py-3">
          <div className="flex items-center gap-4 sm:gap-7">
            <NavLink to="/jails" className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="RIHAI SETU"
                className="h-11 w-11 rounded-[10px] object-cover shadow-sm"
              />
              <span className="leading-tight">
                <span className="display block text-[19px] font-extrabold tracking-tight text-navy">
                  RIHAI SETU
                </span>
                <span className="block text-[10.5px] uppercase tracking-[0.11em] text-bodytext">
                  Rehabilitation Bridge
                </span>
              </span>
            </NavLink>
            <nav className="hidden items-center gap-6 text-sm font-semibold text-navy md:flex">
              {linksForMe.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `border-b-2 px-0.5 py-1.5 ${
                      isActive
                        ? "border-terracotta text-terracotta"
                        : "border-transparent hover:border-terracotta hover:text-terracotta"
                    }`
                  }
                >
                  {t(l.labelKey)}
                </NavLink>
              ))}
            </nav>
          </div>

          {user && (
            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                to="/notifications"
                className="relative rounded-xl border border-[#eee4d6] bg-[#FAF7F2] p-2 text-navy/70 hover:bg-peach/40 hover:text-terracotta transition-colors shadow-sm"
                title={t("app.notifications")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
                {(unread ?? 0) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow-sm">
                    {unread}
                  </span>
                )}
              </Link>

              {showLangToggle && <LangToggle />}

              {/* User Identity Pill */}
              <div className="hidden items-center gap-2.5 rounded-xl border border-[#eee4d6] bg-[#FAF7F2] px-3.5 py-1.5 lg:flex shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="text-right leading-tight">
                  <p className="text-xs font-extrabold text-navy">{user.name}</p>
                  <p className="text-[10.5px] font-semibold text-terracotta">{t(`role.${user.role}`)}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="btn btn-outline btn-sm font-bold border-[#EBE3D7] hover:border-terracotta hover:text-terracotta transition-colors"
              >
                {t("app.logout")} →
              </button>

              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-md p-2 text-navy md:hidden"
                aria-label={t("app.menu")}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
                </svg>
              </button>
            </div>
          )}
        </div>

        {menuOpen && user && (
          <nav className="border-t border-[#eee4d6] bg-white px-4 pb-4 pt-2 md:hidden">
            {linksForMe.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2.5 text-sm font-bold ${
                    isActive ? "bg-peach/50 text-terracotta" : "text-navy hover:bg-cream"
                  }`
                }
              >
                {t(l.labelKey)}
              </NavLink>
            ))}

          </nav>
        )}
      </header>

      <main className="wrap-app w-full flex-1 py-6 sm:py-8">
        <Outlet />
      </main>

      <SessionKeepAlive />

      {mfaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,15,10,0.5)] p-4" onClick={() => setMfaOpen(false)}>
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-lg font-bold text-navy">Two-factor authentication</h2>
            <p className="mt-1 text-sm text-bodytext">
              {isManager
                ? "Required for superintendent/admin accounts once enrolled. Use any TOTP authenticator app."
                : "Optional for your role. Adds a 6-digit code step at login."}
            </p>

            {mfaMsg && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {mfaMsg}
              </div>
            )}
            {mfaErr && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {mfaErr}
              </div>
            )}

            {!mfaMsg && !mfaSecret && (
              <button
                onClick={() => startEnroll.mutate()}
                disabled={startEnroll.isPending}
                className="btn btn-primary mt-4 w-full justify-center"
              >
                {startEnroll.isPending ? "Generating key..." : "Start enrollment"}
              </button>
            )}

            {mfaSecret && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-bodytext">Add this secret to your authenticator app:</p>
                <code className="block break-all rounded-lg bg-navy px-3 py-2 font-mono text-sm text-[#ffe3c2]">
                  {mfaSecret}
                </code>
                <input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  className="input-base text-center font-mono text-xl tracking-[0.4em]"
                />
                <button
                  onClick={() => confirmEnroll.mutate(mfaCode)}
                  disabled={confirmEnroll.isPending || mfaCode.length !== 6}
                  className="btn btn-primary w-full justify-center"
                >
                  Confirm code
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-[#f0e4d3] pt-4">
              <button
                onClick={() => revokeAll.mutate()}
                disabled={revokeAll.isPending}
                className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
              >
                {revokeAll.isPending ? "Revoking..." : "Revoke all sessions"}
              </button>
              <button onClick={() => setMfaOpen(false)} className="text-sm text-bodytext hover:text-navy">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 border-t border-[#f0e4d3] bg-white py-4">
        <p className="wrap-app text-center text-xs text-bodytext">{t("app.disclaimer")}</p>
      </footer>
    </div>
  );
}
