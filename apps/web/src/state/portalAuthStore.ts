import { create } from "zustand";
import type { PortalPrisonerDto } from "@rihai/shared-types";
import { setPortalAccessToken } from "../lib/portalApi";

/**
 * Prisoner portal session (Prompt 10). Kept fully separate from the staff
 * authStore — a prisoner identity must never be mistaken for a staff User.
 */
interface PortalAuthState {
  prisoner: PortalPrisonerDto | null;
  accessToken: string | null;
  setSession: (prisoner: PortalPrisonerDto, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  clear: () => void;
}

export const usePortalAuthStore = create<PortalAuthState>((set) => ({
  prisoner: null,
  accessToken: null,
  setSession: (prisoner, accessToken) => {
    setPortalAccessToken(accessToken);
    set({ prisoner, accessToken });
  },
  setAccessToken: (token) => {
    setPortalAccessToken(token);
    set({ accessToken: token });
  },
  clear: () => {
    setPortalAccessToken(null);
    set({ prisoner: null, accessToken: null });
  },
}));

// Expired kiosk session (portalApi 401 interceptor) -> drop state; the
// PortalLayout guard renders the redirect to /portal/login.
if (typeof window !== "undefined") {
  window.addEventListener("rs:portal-session-expired", () => {
    usePortalAuthStore.getState().clear();
  });
}
