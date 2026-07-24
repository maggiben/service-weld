"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type PropsWithChildren } from "react";
import "dayjs/locale/es";

export function AppProviders({ children }: PropsWithChildren) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: "light", primary: { main: "#1976d2" } },
      }),
    [],
  );
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
          <CssBaseline />
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
