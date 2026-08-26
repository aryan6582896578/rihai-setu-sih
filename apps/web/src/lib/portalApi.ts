import axios from "axios";

/**
 * Prisoner portal HTTP client (Prompt 10). Deliberately separate from the staff
 * `api` client: prisoner sessions have no refresh cookie — a 15-minute access
 * token only, so an expired kiosk session simply returns to /portal/login.
 *
 * Prompt 13 (cause #6): this is a separate auth DOMAIN. A 401 here must never
 * touch staff session state, and staff 401 handling must never run for the
 * portal — hence a dedicated instance with its own interceptor.
 */
export const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1",
});

const tokenRef: { current: string | null } = { current: null };

export function setPortalAccessToken(token: string | null) {
  tokenRef.current = token;
}

portalApi.interceptors.request.use((config) => {
  if (tokenRef.current) config.headers.Authorization = `Bearer ${tokenRef.current}`;
  return config;
});

// Expired/invalid portal session -> clear local state and let the route guard
// send the prisoner back to /portal/login. Login/set-pin calls themselves are
// exempt (they are how you GET a session).
portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string | undefined = error?.config?.url;
    const isAuthCall = Boolean(url && url.includes("/auth/"));
    if (error?.response?.status === 401 && !isAuthCall) {
      setPortalAccessToken(null);
      window.dispatchEvent(new CustomEvent("rs:portal-session-expired"));
    }
    throw error;
  },
);
