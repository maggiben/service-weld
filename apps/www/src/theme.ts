import { createTheme, type ThemeOptions } from "@mui/material/styles";

/** Service Weld brand tokens from the official logo (green outline + yellow wordmark). */
export const brand = {
  green: "#0A7A3E",
  greenDark: "#065C2E",
  yellow: "#F5C518",
  ink: "#121212",
} as const;

export function buildTheme(mode: "light" | "dark") {
  const options: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: brand.green,
        dark: brand.greenDark,
        light: "#2E9A5C",
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: mode === "light" ? brand.ink : brand.yellow,
        contrastText: mode === "light" ? "#FFFFFF" : brand.ink,
      },
      ...(mode === "light"
        ? { background: { default: "#F7F7F5", paper: "#FFFFFF" } }
        : { background: { default: "#0E0E0E", paper: "#1A1A1A" } }),
    },
    shape: { borderRadius: 8 },
    typography: {
      fontSize: 14,
      h1: { fontWeight: 700, letterSpacing: "-0.02em" },
      h2: { fontWeight: 700, letterSpacing: "-0.02em" },
      h3: { fontWeight: 650, letterSpacing: "-0.015em" },
      button: { textTransform: "none", fontWeight: 600 },
    },
  };
  return createTheme(options);
}
