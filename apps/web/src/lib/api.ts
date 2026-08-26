import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  // No default timeout: long-running actions (LLM auto-draft, document/export
  // generation) must never be misread as auth failures just for being slow
  // (Prompt 13, cause #4).
});

let refreshPromise: Promise<string | null> | null = null;

const tokenRef: { current: string | null } = { current: null };

export function setCurrentAccessToken(token: string | null) {
  tokenRef.current = token;
}

api.interceptors.request.use((config) => {
  const token = tokenRef.current;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post<{ accessToken: string }>(
      `${API_BASE}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    return res.data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Endpoints that THEMSELVES mint or consume tokens must never be silently
 * retried — retrying /auth/login would turn wrong-password 401s into confusing
 * double submits, and /auth/refresh into loops. Everything else (including
 * /auth/me session hydration) benefits from one silent refresh + retry.
 */
const TOKEN_ENDPOINTS = [
  "/auth/login",
  "/auth/mfa/",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
];

function isTokenEndpoint(url: string | undefined): boolean {
  return Boolean(url && TOKEN_ENDPOINTS.some((frag) => url.includes(frag)));
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    // Prompt 13 cause #2: ONLY a genuine 401 may trigger refresh/logout.
    // A 403 (wrong role, missing JailAccess) is an access-denied condition and is
    // surfaced as a normal error to the calling page -- NEVER a login redirect.
    if (error.response?.status !== 401 || !original || original._retried || isTokenEndpoint(original.url)) {
      throw error;
    }

    original._retried = true;

    // Single-flight refresh (cause #5): N concurrent 401s share ONE rotation;
    // everyone waits on the same promise instead of racing independent refreshes.
    refreshPromise = refreshPromise ?? refreshAccessToken();
    const token = await refreshPromise.finally(() => {
      refreshPromise = null;
    });

    if (!token) {
      // Refresh itself failed -> the session really is gone. One event is enough;
      // every waiter here observed the same failed rotation.
      window.dispatchEvent(new CustomEvent("rs:session-expired"));
      throw error;
    }

    setCurrentAccessToken(token);
    window.dispatchEvent(new CustomEvent("rs:access-token", { detail: token }));
    return api(original);
  },
);

export interface ApiErrorShape {
  code: string;
  message: string;
}

export function extractApiError(err: unknown): ApiErrorShape {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as { error?: ApiErrorShape } | undefined;
    if (payload?.error) return payload.error;
    if (!err.response) return { code: "NETWORK", message: "Cannot reach the server — is the API running?" };
  }
  return { code: "UNKNOWN", message: "Something went wrong" };
}
