"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import "dayjs/locale/es";
import "dayjs/locale/en";
import "@/i18n";
import { buildTheme } from "@/theme";
import { useUiStore } from "@/store/uiStore";

/**
 * Composes the three state layers + MUI localization behind one provider so a
 * single language switch re-localizes theme, date pickers, and the DataGrid
 * together (006 §2.10 / C9). Server cache = TanStack Query; client state =
 * Zustand; forms = react-hook-form.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1 },
        },
      }),
  );
  const mode = useUiStore((s) => s.mode);
  const locale = useUiStore((s) => s.locale);
  const { i18n } = useTranslation();
  const theme = useMemo(() => buildTheme(mode), [mode]);

  if (i18n.language !== locale) void i18n.changeLanguage(locale);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={locale}>
          <CssBaseline />
          <>{children}</>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
