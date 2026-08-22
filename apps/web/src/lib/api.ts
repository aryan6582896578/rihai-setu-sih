import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.request.use((config) => {
  const token = useAccessTokenRef.current;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const useAccessTokenRef: { current: string | null } = { current: null };

export function setCurrentAccessToken(token: string | null) {
  useAccessTokenRef.current = token;
}

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

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes("/auth/");
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const token = await refreshPromise;
      refreshPromise = null;
      if (token) {
        setCurrentAccessToken(token);
        window.dispatchEvent(new CustomEvent("rs:access-token", { detail: token }));
        return api(original);
      }
      window.dispatchEvent(new CustomEvent("rs:session-expired"));
    }
    throw error;
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
