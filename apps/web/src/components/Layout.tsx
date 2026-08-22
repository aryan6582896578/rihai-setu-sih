import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/authStore";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  jail_superintendent: "Jail Superintendent",
  jail_staff: "Jail Staff",
  dlsa_lawyer: "DLSA Lawyer",
  viewer: "Viewer",
};

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/jails" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
                RS
              </span>
              <span className="text-lg font-semibold tracking-tight text-slate-900">RIHAI SETU</span>
            </NavLink>
            <nav className="hidden gap-1 sm:flex">
              <NavLink
                to="/jails"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                Jails
              </NavLink>
            </nav>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right leading-tight">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        RIHAI SETU — synthetic demonstration data only. Human decision-makers make all release calls.
      </footer>
    </div>
  );
}
