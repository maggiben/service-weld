import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MeResponse, TerritoryScope } from "@weld/api-client";

export type { TerritoryScope };
export type MeUser = MeResponse;

/**
 * sessionStore (006 R9): tokens + authenticated user only.
 * Server entities live in TanStack Query — never here.
 */
interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  user: MeUser | null;
  setSession: (accessToken: string, refreshToken: string) => void;
  setUser: (user: MeUser | null) => void;
  clearSession: () => void;
  hasCapability: (capability: string) => boolean;
  isAuthenticated: () => boolean;
}

const empty = {
  accessToken: null as string | null,
  refreshToken: null as string | null,
  user: null as MeUser | null,
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...empty,
      setSession: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ ...empty }),
      hasCapability: (capability) =>
        get().user?.capabilities.includes(capability) ?? false,
      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: "weld.session",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
