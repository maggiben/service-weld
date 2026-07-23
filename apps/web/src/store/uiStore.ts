import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  getThemePreset,
  preferredThemeForMode,
  resolveThemeId,
  resolveThemeIdForMode,
  type ThemeId,
  type ThemeMode,
} from "@/theme";

/**
 * uiStore (006 R9): client UI state only — theme + language, persisted to
 * localStorage. Language defaults to `es` (006 R7). Server data lives in
 * TanStack Query; form state in react-hook-form — never here.
 */
export type Locale = "es" | "en";
/** @deprecated Prefer ThemeMode from theme.ts — kept for existing imports. */
export type Mode = ThemeMode;

interface UiPersistedV0 {
  locale?: Locale;
  mode?: ThemeMode;
  themeId?: ThemeId;
  lastLightThemeId?: ThemeId;
  lastDarkThemeId?: ThemeId;
  sidebarOpen?: boolean;
}

interface UiState {
  locale: Locale;
  themeId: ThemeId;
  lastLightThemeId: ThemeId;
  lastDarkThemeId: ThemeId;
  sidebarOpen: boolean;
  setLocale: (locale: Locale) => void;
  setThemeId: (themeId: ThemeId) => void;
  /** Flip light ↔ dark using the last chosen preset of that mode. */
  setMode: (mode: ThemeMode) => void;
  toggleSidebar: () => void;
}

function themeIdFromLegacyMode(mode: ThemeMode | undefined): ThemeId {
  return mode === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
}

function sanitizeThemeState(state: UiPersistedV0, version: number) {
  const themeId = resolveThemeId(
    state.themeId ??
      (version < 1 ? themeIdFromLegacyMode(state.mode) : undefined),
  );
  const preset = getThemePreset(themeId);
  const lastLightThemeId = resolveThemeIdForMode(
    preset.mode === "light" ? themeId : state.lastLightThemeId,
    "light",
  );
  const lastDarkThemeId = resolveThemeIdForMode(
    preset.mode === "dark" ? themeId : state.lastDarkThemeId,
    "dark",
  );
  return {
    locale: state.locale ?? "es",
    themeId,
    lastLightThemeId,
    lastDarkThemeId,
    sidebarOpen: state.sidebarOpen ?? true,
  };
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      locale: "es",
      themeId: DEFAULT_LIGHT_THEME_ID,
      lastLightThemeId: DEFAULT_LIGHT_THEME_ID,
      lastDarkThemeId: DEFAULT_DARK_THEME_ID,
      sidebarOpen: true,
      setLocale: (locale) => set({ locale }),
      setThemeId: (themeId) => {
        const id = resolveThemeId(themeId);
        const preset = getThemePreset(id);
        set(
          preset.mode === "light"
            ? { themeId: id, lastLightThemeId: id }
            : { themeId: id, lastDarkThemeId: id },
        );
      },
      setMode: (mode) => {
        const { lastLightThemeId, lastDarkThemeId } = get();
        get().setThemeId(
          preferredThemeForMode(mode, lastLightThemeId, lastDarkThemeId),
        );
      },
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: "weld.ui",
      // v2: coerce lastLight/lastDark to the correct mode (v1 could store a
      // light id as lastDark via resolveThemeId fallback, so the AppBar toggle
      // applied a non-selected / unreadable theme).
      version: 2,
      migrate: (persisted, version) => {
        return sanitizeThemeState((persisted ?? {}) as UiPersistedV0, version);
      },
    },
  ),
);

/** Derived mode for the active theme (AppBar toggle, etc.). */
export function selectThemeMode(state: Pick<UiState, "themeId">): ThemeMode {
  return getThemePreset(resolveThemeId(state.themeId)).mode;
}
