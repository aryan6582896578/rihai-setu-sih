import type { ReactNode } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { usePortalAuthStore } from "../../state/portalAuthStore";

/** Guard + chrome for the prisoner portal (Prompt 10). Separate from the staff Layout. */
export default function PortalLayout(): ReactNode {
  const prisoner = usePortalAuthStore((s) => s.prisoner);
  const clear = usePortalAuthStore((s) => s.clear);
  const navigate = useNavigate();

  if (!prisoner) return <Navigate to="/portal/login" replace />;

  const handleLogout = () => {
    clear();
    navigate("/portal/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-40 border-b border-[#eee4d6] bg-white">
        <div className="wrap-app flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <span className="display flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-terracotta to-saffron text-[17px] font-extrabold text-white">
              RS
            </span>
            <span className="leading-tight">
              <span className="display block text-[19px] font-extrabold tracking-tight text-navy">
                RIHAI SETU
              </span>
              <span className="block text-[10.5px] uppercase tracking-[0.11em] text-bodytext">
                Your portal
              </span>
            </span>
          </div>

          <nav className="tabbar order-3 w-full sm:order-none sm:w-auto" aria-label="Portal sections">
            {[
              { to: "/portal/profile", label: "My profile" },
              { to: "/portal/jobs", label: "Jobs for me" },
              { to: "/portal/documents", label: "Documents" },
            ].map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden text-right leading-tight lg:block">
              <p className="text-[13px] font-bold text-navy">{prisoner.fullName}</p>
              <p className="font-mono text-[11.5px] text-bodytext">{prisoner.prisonerRegNo}</p>
            </div>
            <button onClick={handleLogout} className="btn btn-outline btn-sm">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="wrap-app w-full flex-1 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-[#f0e4d3] bg-white py-4">
        <p className="wrap-app text-center text-xs text-bodytext">
          RIHAI SETU speeds up paperwork only — a judge and the court always make every release
          decision.
        </p>
      </footer>
    </div>
  );
}
