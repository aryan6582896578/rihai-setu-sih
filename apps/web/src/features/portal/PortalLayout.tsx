import type { ReactNode } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { usePortalAuthStore } from "../../state/portalAuthStore";
import { LangToggle, useLang } from "../../lib/i18n";
import logoImg from "../../public/rihai_setu_logo.png";
import ChatbotWidget from "../../components/ChatbotWidget";

/** Guard + chrome for the prisoner portal (Prompt 10). Separate from the staff Layout. */
export default function PortalLayout(): ReactNode {
  const prisoner = usePortalAuthStore((s) => s.prisoner);
  const clear = usePortalAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const { t } = useLang();

  if (!prisoner) return <Navigate to="/portal/login" replace />;

  const handleLogout = () => {
    clear();
    navigate("/portal/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
        <div className="wrap-app flex flex-wrap items-center justify-between gap-4 py-3 sm:py-3.5">
          <div className="flex flex-wrap items-center gap-5 sm:gap-8">
            <NavLink to="/portal/profile" className="flex items-center gap-3">
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
                  {t("portal.nav.tag")}
                </span>
              </span>
            </NavLink>

            <nav className="flex items-center gap-5 text-sm font-semibold sm:gap-6" aria-label="Portal sections">
              {[
                { to: "/portal/profile", label: t("portal.nav.profile") },
                { to: "/portal/jobs", label: t("portal.nav.jobs") },
                { to: "/portal/documents", label: t("portal.nav.documents") },
              ].map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `border-b-2 px-0.5 py-1.5 transition-colors ${
                      isActive
                        ? "border-terracotta text-terracotta font-bold"
                        : "border-transparent text-bodytext hover:border-terracotta/40 hover:text-navy"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <LangToggle />
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[13px] font-bold text-navy">{prisoner.fullName}</p>
              <p className="font-mono text-[11.5px] text-bodytext">{prisoner.prisonerRegNo}</p>
            </div>
            <button onClick={handleLogout} className="btn btn-outline btn-sm">
              {t("app.logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="wrap-app w-full flex-1 py-6 sm:py-8">
        <Outlet />
      </main>

      <ChatbotWidget mode="portal" />

      <footer className="mt-8 border-t border-[#f0e4d3] bg-white py-4">
        <p className="wrap-app text-center text-xs text-bodytext">
          {t("portal.footer")}
        </p>
      </footer>
    </div>
  );
}
