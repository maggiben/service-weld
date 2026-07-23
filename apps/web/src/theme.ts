import { createTheme, type ThemeOptions } from "@mui/material/styles";

/**
 * MUI theme foundation (006 §2.1). Domain color semantics (gas/state) are
 * declared as custom palette keys so DataGrid cells, Chips, and MUI X Charts
 * series stay consistent in light/dark. Full palette filled in Phase 1/2.
 */
declare module "@mui/material/styles" {
  interface Palette {
    gas: Record<string, string>;
  }
  interface PaletteOptions {
    gas?: Record<string, string>;
  }
}

const gas: Record<string, string> = {
  O2: "#1976d2",
  O2_MED: "#00897b",
  O2_LASER: "#0288d1",
  CO2: "#616161",
  N2: "#7e57c2",
  AR: "#2e7d32",
  AR_50: "#43a047",
  ATAL: "#ef6c00",
  MIX20: "#f9a825",
  MIX22: "#f9a825",
  MAPAX30: "#c0ca33",
  ACET: "#d32f2f",
  HELIUM: "#ec407a",
  THERMOLENE: "#8d6e63",
};

/** Service Weld brand tokens sampled from the official logo. */
export const brand = {
  green: "#0A7A3E",
  greenDark: "#065C2E",
  greenLight: "#2E9A5C",
  yellow: "#F5C518",
  ink: "#121212",
} as const;

export type ThemeMode = "light" | "dark";

export type ThemeId =
  | "weld-light"
  | "slate-light"
  | "paper-light"
  | "mist-light"
  | "charcoal-dark"
  | "midnight-dark";

export interface ThemePreviewTokens {
  background: string;
  paper: string;
  appBar: string;
  appBarText: string;
  sidebar: string;
  text: string;
  textMuted: string;
  primary: string;
  secondary: string;
  border: string;
}

export interface ThemePreset {
  id: ThemeId;
  mode: ThemeMode;
  /** i18n key under settings.themes.* */
  nameKey: string;
  preview: ThemePreviewTokens;
  palette: NonNullable<ThemeOptions["palette"]>;
  appBar: { background: string; color: string; tone: "light" | "dark" };
}

/**
 * Curated presets inspired by well-solved admin UIs (Linear, GitHub, Notion,
 * Atlassian): explicit text/surface contrast, elevated dark papers, no pure
 * white-on-black body text.
 */
export const THEME_PRESETS: Record<ThemeId, ThemePreset> = {
  "weld-light": {
    id: "weld-light",
    mode: "light",
    nameKey: "weld_light",
    preview: {
      background: "#F7F7F5",
      paper: "#FFFFFF",
      appBar: brand.green,
      appBarText: "#FFFFFF",
      sidebar: "#FFFFFF",
      text: "#1A1A1A",
      textMuted: "#5C5C5C",
      primary: brand.green,
      secondary: brand.ink,
      border: "#E2E2DE",
    },
    palette: {
      mode: "light",
      primary: {
        main: brand.green,
        dark: brand.greenDark,
        light: brand.greenLight,
        contrastText: "#FFFFFF",
      },
      secondary: { main: brand.ink, contrastText: "#FFFFFF" },
      background: { default: "#F7F7F5", paper: "#FFFFFF" },
      text: {
        primary: "#1A1A1A",
        secondary: "#5C5C5C",
        disabled: "#9A9A96",
      },
      divider: "#E2E2DE",
    },
    appBar: { background: brand.green, color: "#FFFFFF", tone: "dark" },
  },
  "slate-light": {
    id: "slate-light",
    mode: "light",
    nameKey: "slate_light",
    preview: {
      background: "#F1F5F9",
      paper: "#FFFFFF",
      appBar: "#0F172A",
      appBarText: "#F8FAFC",
      sidebar: "#FFFFFF",
      text: "#0F172A",
      textMuted: "#64748B",
      primary: brand.green,
      secondary: "#334155",
      border: "#E2E8F0",
    },
    palette: {
      mode: "light",
      primary: {
        main: brand.green,
        dark: brand.greenDark,
        light: brand.greenLight,
        contrastText: "#FFFFFF",
      },
      secondary: { main: "#334155", contrastText: "#FFFFFF" },
      background: { default: "#F1F5F9", paper: "#FFFFFF" },
      text: {
        primary: "#0F172A",
        secondary: "#64748B",
        disabled: "#94A3B8",
      },
      divider: "#E2E8F0",
    },
    appBar: { background: "#0F172A", color: "#F8FAFC", tone: "dark" },
  },
  "paper-light": {
    id: "paper-light",
    mode: "light",
    nameKey: "paper_light",
    preview: {
      background: "#FFFFFF",
      paper: "#F8FAF9",
      appBar: "#FFFFFF",
      appBarText: "#111827",
      sidebar: "#F8FAF9",
      text: "#111827",
      textMuted: "#6B7280",
      primary: brand.green,
      secondary: "#374151",
      border: "#E5E7EB",
    },
    palette: {
      mode: "light",
      primary: {
        main: brand.green,
        dark: brand.greenDark,
        light: brand.greenLight,
        contrastText: "#FFFFFF",
      },
      secondary: { main: "#374151", contrastText: "#FFFFFF" },
      background: { default: "#FFFFFF", paper: "#F8FAF9" },
      text: {
        primary: "#111827",
        secondary: "#6B7280",
        disabled: "#9CA3AF",
      },
      divider: "#E5E7EB",
    },
    appBar: { background: "#FFFFFF", color: "#111827", tone: "light" },
  },
  "mist-light": {
    id: "mist-light",
    mode: "light",
    nameKey: "mist_light",
    preview: {
      background: "#EEF3F7",
      paper: "#FFFFFF",
      appBar: "#0B6E4F",
      appBarText: "#FFFFFF",
      sidebar: "#FFFFFF",
      text: "#1B2838",
      textMuted: "#5B6B7C",
      primary: "#0B6E4F",
      secondary: "#1B2838",
      border: "#D5DEE7",
    },
    palette: {
      mode: "light",
      primary: {
        main: "#0B6E4F",
        dark: "#085540",
        light: "#2A8F6C",
        contrastText: "#FFFFFF",
      },
      secondary: { main: "#1B2838", contrastText: "#FFFFFF" },
      background: { default: "#EEF3F7", paper: "#FFFFFF" },
      text: {
        primary: "#1B2838",
        secondary: "#5B6B7C",
        disabled: "#8A9AAB",
      },
      divider: "#D5DEE7",
    },
    appBar: { background: "#0B6E4F", color: "#FFFFFF", tone: "dark" },
  },
  "charcoal-dark": {
    id: "charcoal-dark",
    mode: "dark",
    nameKey: "charcoal_dark",
    preview: {
      background: "#121412",
      paper: "#1C1F1C",
      appBar: "#1C1F1C",
      appBarText: "#E8EBE8",
      sidebar: "#181B18",
      text: "#E8EBE8",
      textMuted: "#A3ABA3",
      primary: brand.greenLight,
      secondary: brand.yellow,
      border: "#2E332E",
    },
    palette: {
      mode: "dark",
      primary: {
        main: brand.greenLight,
        dark: brand.green,
        light: "#4CB87A",
        contrastText: "#0A120E",
      },
      secondary: { main: brand.yellow, contrastText: brand.ink },
      background: { default: "#121412", paper: "#1C1F1C" },
      text: {
        primary: "#E8EBE8",
        secondary: "#A3ABA3",
        disabled: "#6F776F",
      },
      divider: "#2E332E",
      action: {
        active: "#E8EBE8",
        hover: "rgba(232, 235, 232, 0.08)",
        selected: "rgba(46, 154, 92, 0.2)",
        disabled: "rgba(232, 235, 232, 0.3)",
        disabledBackground: "rgba(232, 235, 232, 0.08)",
      },
    },
    appBar: { background: "#1C1F1C", color: "#E8EBE8", tone: "dark" },
  },
  "midnight-dark": {
    id: "midnight-dark",
    mode: "dark",
    nameKey: "midnight_dark",
    preview: {
      background: "#0D1117",
      paper: "#161B22",
      appBar: "#161B22",
      appBarText: "#E6EDF3",
      sidebar: "#010409",
      text: "#E6EDF3",
      textMuted: "#8B949E",
      primary: "#3FB950",
      secondary: "#58A6FF",
      border: "#30363D",
    },
    palette: {
      mode: "dark",
      primary: {
        main: "#3FB950",
        dark: "#238636",
        light: "#56D364",
        contrastText: "#0D1117",
      },
      secondary: { main: "#58A6FF", contrastText: "#0D1117" },
      background: { default: "#0D1117", paper: "#161B22" },
      text: {
        primary: "#E6EDF3",
        secondary: "#8B949E",
        disabled: "#6E7681",
      },
      divider: "#30363D",
      action: {
        active: "#E6EDF3",
        hover: "rgba(230, 237, 243, 0.08)",
        selected: "rgba(63, 185, 80, 0.18)",
        disabled: "rgba(230, 237, 243, 0.3)",
        disabledBackground: "rgba(230, 237, 243, 0.08)",
      },
    },
    appBar: { background: "#161B22", color: "#E6EDF3", tone: "dark" },
  },
};

export const THEME_IDS = Object.keys(THEME_PRESETS) as ThemeId[];

export const DEFAULT_LIGHT_THEME_ID: ThemeId = "weld-light";
export const DEFAULT_DARK_THEME_ID: ThemeId = "charcoal-dark";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEME_PRESETS;
}

export function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_LIGHT_THEME_ID;
}

/** Like resolveThemeId, but never returns a preset of the wrong mode. */
export function resolveThemeIdForMode(
  value: unknown,
  mode: ThemeMode,
): ThemeId {
  if (isThemeId(value) && THEME_PRESETS[value].mode === mode) return value;
  return mode === "light" ? DEFAULT_LIGHT_THEME_ID : DEFAULT_DARK_THEME_ID;
}

export function getThemePreset(themeId: ThemeId): ThemePreset {
  return THEME_PRESETS[resolveThemeId(themeId)];
}

export function listThemePresets(mode?: ThemeMode): ThemePreset[] {
  const presets = THEME_IDS.map((id) => THEME_PRESETS[id]);
  return mode ? presets.filter((part) => part.mode === mode) : presets;
}

export function preferredThemeForMode(
  mode: ThemeMode,
  lastLight: ThemeId,
  lastDark: ThemeId,
): ThemeId {
  return resolveThemeIdForMode(mode === "light" ? lastLight : lastDark, mode);
}

export function buildTheme(themeId: ThemeId = DEFAULT_LIGHT_THEME_ID) {
  const preset = getThemePreset(resolveThemeId(themeId));
  const options: ThemeOptions = {
    palette: {
      ...preset.palette,
      gas,
    },
    shape: { borderRadius: 8 },
    typography: {
      fontSize: 14,
      h1: { fontWeight: 700, letterSpacing: "-0.02em" },
      h2: { fontWeight: 700, letterSpacing: "-0.02em" },
      h3: { fontWeight: 650, letterSpacing: "-0.015em" },
      body1: { color: preset.palette.text?.primary },
      body2: { color: preset.palette.text?.secondary },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            color: preset.palette.text?.primary,
            backgroundColor: preset.palette.background?.default,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: preset.appBar.background,
            color: preset.appBar.color,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: preset.palette.background?.paper,
            color: preset.palette.text?.primary,
            borderRight: `1px solid ${preset.palette.divider}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      // Safari/WebKit: outlined notch uses max-width: 100% on <legend>, which
      // fails inside flex (Stack) and transform (Drawer) — border cuts through
      // floating labels. Upstream: mui/material-ui#46891 / #48566.
      MuiFormControl: {
        styleOverrides: {
          root: {
            "&:has(.MuiInputLabel-shrink) .MuiOutlinedInput-notchedOutline legend":
              {
                maxWidth: "none",
              },
          },
        },
      },
    },
  };
  return createTheme(options);
}
