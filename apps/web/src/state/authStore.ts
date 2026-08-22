import { create } from "zustand";
import type { UserDto } from "@rihai/shared-types";
import { api, setCurrentAccessToken } from "../lib/api";

type AuthStatus = "idle" | "loading" | "ready";

interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  accessToken: string | null;
  bootstrap: () => Promise<void>;
  setSession: (user: UserDto, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "idle",
  user: null,
  accessToken: null,

  bootstrap: async () => {
    set({ status: "loading" });
    try {
      const res = await api.post<{ accessToken: string; user: UserDto }>("/auth/refresh");
      setCurrentAccessToken(res.data.accessToken);
      set({ status: "ready", user: res.data.user, accessToken: res.data.accessToken });
    } catch {
      setCurrentAccessToken(null);
      set({ status: "ready", user: null, accessToken: null });
    }
  },

  setSession: (user, accessToken) => {
    setCurrentAccessToken(accessToken);
    set({ status: "ready", user, accessToken });
  },

  setAccessToken: (token) => {
    setCurrentAccessToken(token);
    set({ accessToken: token });
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // cookie may already be gone; proceed with local clear
    }
    setCurrentAccessToken(null);
    set({ user: null, accessToken: null, status: "ready" });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("rs:access-token", (e) => {
    useAuthStore.getState().setAccessToken((e as CustomEvent<string>).detail);
  });
  window.addEventListener("rs:session-expired", () => {
    setCurrentAccessToken(null);
    useAuthStore.setState({ user: null, accessToken: null, status: "ready" });
  });
}
