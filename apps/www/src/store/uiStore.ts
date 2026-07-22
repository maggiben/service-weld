import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "es" | "en";
export type Mode = "light" | "dark";

interface UiState {
  locale: Locale;
  mode: Mode;
  setLocale: (locale: Locale) => void;
  setMode: (mode: Mode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: "es",
      mode: "light",
      setLocale: (locale) => set({ locale }),
      setMode: (mode) => set({ mode }),
    }),
    { name: "weld.www.ui" },
  ),
);
