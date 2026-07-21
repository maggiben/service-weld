import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * uiStore (006 R9): client UI state only — theme + language, persisted to
 * localStorage. Language defaults to `es` (006 R7). Server data lives in
 * TanStack Query; form state in react-hook-form — never here.
 */
export type Locale = "es" | "en";
export type Mode = "light" | "dark";

interface UiState {
  locale: Locale;
  mode: Mode;
  sidebarOpen: boolean;
  setLocale: (locale: Locale) => void;
  setMode: (mode: Mode) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: "es",
      mode: "light",
      sidebarOpen: true,
      setLocale: (locale) => set({ locale }),
      setMode: (mode) => set({ mode }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: "weld.ui" },
  ),
);
