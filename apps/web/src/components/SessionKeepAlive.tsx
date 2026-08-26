import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "../state/authStore";
import { useLang } from "../lib/i18n";
import { API_BASE } from "../lib/api";

/**
 * Prompt 13 — session-expiry warning toast for staff sessions.
 *
 * A surprise logout is a bad experience even when the token lifecycle itself is
 * bug-free. We decode the access token's exp claim client-side (no dependency)
 * and surface a "stay signed in?" prompt ~2 minutes before it lapses; staying
 * signed in runs one silent refresh-cookie rotation.
 */

const WARN_BEFORE_MS = 120_000;
const CHECK_EVERY_MS = 5_000;

function tokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export default function SessionKeepAlive() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { t } = useLang();

  const [warnVisible, setWarnVisible] = useState(false);
  const dismissedFor = useRef<string | null>(null);

  useEffect(() => {
    // A fresh token (login or rotation) resets any dismissal.
    dismissedFor.current = null;
    setWarnVisible(false);
  }, [accessToken]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const exp = tokenExpiryMs(accessToken);
      if (!exp) {
        setWarnVisible(false);
        return;
      }
      const remaining = exp - Date.now();
      if (
        remaining > 0 &&
        remaining <= WARN_BEFORE_MS &&
        dismissedFor.current !== accessToken
      ) {
        setWarnVisible(true);
      } else if (remaining <= 0) {
        // Too late to warn cleanly; the interceptor's refresh flow takes over
        // on the next API call. Hide the stale prompt.
        setWarnVisible(false);
      }
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, [accessToken]);

  if (!warnVisible || !accessToken) return null;

  const staySignedIn = async () => {
    try {
      const res = await axios.post<{ accessToken: string }>(
        `${API_BASE}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      setAccessToken(res.data.accessToken);
    } catch {
      await logout();
      navigate("/login");
    }
    setWarnVisible(false);
  };

  const signOut = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(92vw,360px)] rounded-card border border-saffron bg-white p-4 shadow-xl">
      <p className="text-sm font-bold text-navy">⏳ {t("sess.warn")}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void staySignedIn()} className="btn btn-primary btn-sm flex-1 justify-center">
          {t("sess.stay")}
        </button>
        <button onClick={() => void signOut()} className="btn btn-outline btn-sm flex-1 justify-center">
          {t("sess.out")}
        </button>
      </div>
    </div>
  );
}
