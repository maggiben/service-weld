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

export function buildTheme(mode: "light" | "dark") {
  const options: ThemeOptions = {
    palette: { mode, gas },
    shape: { borderRadius: 8 },
    typography: { fontSize: 14 },
  };
  return createTheme(options);
}
