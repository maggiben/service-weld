"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useEffect, useMemo, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";
import { buildTheme } from "@/theme";
import { useUiStore } from "@/store/uiStore";

export function AppProviders({ children }: PropsWithChildren) {
  const mode = useUiStore((s) => s.mode);
  const locale = useUiStore((s) => s.locale);
  const { i18n } = useTranslation();
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [i18n, locale]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
