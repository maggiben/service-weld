"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@weld/api-client";
import type { PrimaryLanguage } from "@weld/schemas";
import { api } from "../api/client";
import { ThemePicker } from "../features/settings/ThemePicker";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore, type Locale } from "../store/uiStore";

const TIMEZONE_OPTIONS = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Argentina/Mendoza",
  "America/Sao_Paulo",
  "America/Santiago",
  "America/Montevideo",
  "UTC",
] as const;

function OperationalSettings() {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const setLocale = useUiStore((state) => state.setLocale);
  const canRefreshAlerts = useSessionStore((state) =>
    state.hasCapability("alerts:write"),
  );
  const [overdueDays, setOverdueDays] = useState("120");
  const [longOutstandingDays, setLongOutstandingDays] = useState("90");
  const [timezone, setTimezone] = useState<string>(
    "America/Argentina/Buenos_Aires",
  );
  const [minDays, setMinDays] = useState("0");
  const [primaryLanguage, setPrimaryLanguage] = useState<PrimaryLanguage>("es");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setOverdueDays(String(settingsQuery.data.supplier_loan_overdue_days));
    setLongOutstandingDays(String(settingsQuery.data.long_outstanding_days));
    setTimezone(settingsQuery.data.business_timezone);
    setMinDays(String(settingsQuery.data.rental_min_days));
    setPrimaryLanguage(settingsQuery.data.primary_language);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const overdue = Number(overdueDays);
      const longOutstanding = Number(longOutstandingDays);
      const rentalMin = Number(minDays);
      if (!Number.isFinite(overdue) || overdue < 1 || overdue > 3650) {
        throw new Error("invalid_overdue");
      }
      if (
        !Number.isFinite(longOutstanding) ||
        longOutstanding < 1 ||
        longOutstanding > 36500
      ) {
        throw new Error("invalid_long_outstanding");
      }
      if (!Number.isFinite(rentalMin) || rentalMin < 0 || rentalMin > 365) {
        throw new Error("invalid_min_days");
      }
      return api.updateSettings(
        {
          supplier_loan_overdue_days: overdue,
          long_outstanding_days: longOutstanding,
          business_timezone: timezone,
          rental_min_days: rentalMin,
          primary_language: primaryLanguage,
        },
        { ifMatch: settingsQuery.data?.version },
      );
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (canRefreshAlerts) {
        try {
          await api.refreshAlerts();
        } catch {
          // Settings saved; alert recompute is best-effort.
        }
        await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      }
      setLocale(data.primary_language as Locale);
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const timezoneChoices = TIMEZONE_OPTIONS.includes(
    timezone as (typeof TIMEZONE_OPTIONS)[number],
  )
    ? TIMEZONE_OPTIONS
    : ([timezone, ...TIMEZONE_OPTIONS] as string[]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {translate("settings.operational_title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {translate("settings.operational_subtitle")}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {saved && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSaved(false)}
        >
          {translate("settings.saved")}
        </Alert>
      )}
      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        <FormControl fullWidth disabled={settingsQuery.isLoading}>
          <InputLabel id="business-timezone-label">
            {translate("settings.business_timezone")}
          </InputLabel>
          <Select
            labelId="business-timezone-label"
            label={translate("settings.business_timezone")}
            value={timezone}
            onChange={(event) => {
              setTimezone(event.target.value);
              setSaved(false);
            }}
          >
            {timezoneChoices.map((tz) => (
              <MenuItem key={tz} value={tz}>
                {tz}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {translate("settings.business_timezone_help")}
          </FormHelperText>
        </FormControl>

        <TextField
          label={translate("settings.rental_min_days")}
          type="number"
          value={minDays}
          onChange={(event) => {
            setMinDays(event.target.value);
            setSaved(false);
          }}
          helperText={translate("settings.rental_min_days_help")}
          slotProps={{ htmlInput: { min: 0, max: 365 } }}
          disabled={settingsQuery.isLoading}
        />

        <FormControl fullWidth disabled={settingsQuery.isLoading}>
          <InputLabel id="primary-language-label">
            {translate("settings.primary_language")}
          </InputLabel>
          <Select
            labelId="primary-language-label"
            label={translate("settings.primary_language")}
            value={primaryLanguage}
            onChange={(event) => {
              setPrimaryLanguage(event.target.value as PrimaryLanguage);
              setSaved(false);
            }}
          >
            <MenuItem value="es">{translate("settings.languages.es")}</MenuItem>
            <MenuItem value="en">{translate("settings.languages.en")}</MenuItem>
          </Select>
          <FormHelperText>
            {translate("settings.primary_language_help")}
          </FormHelperText>
        </FormControl>

        <TextField
          label={translate("settings.supplier_loan_overdue_days")}
          type="number"
          value={overdueDays}
          onChange={(event) => {
            setOverdueDays(event.target.value);
            setSaved(false);
          }}
          helperText={translate("settings.supplier_loan_overdue_days_help")}
          slotProps={{ htmlInput: { min: 1, max: 3650 } }}
          disabled={settingsQuery.isLoading}
        />

        <TextField
          label={translate("settings.long_outstanding_days")}
          type="number"
          value={longOutstandingDays}
          onChange={(event) => {
            setLongOutstandingDays(event.target.value);
            setSaved(false);
          }}
          helperText={translate("settings.long_outstanding_days_help")}
          slotProps={{ htmlInput: { min: 1, max: 36500 } }}
          disabled={settingsQuery.isLoading}
        />
        <Button
          variant="contained"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || settingsQuery.isLoading}
          sx={{ alignSelf: "flex-start" }}
        >
          {translate("actions.save")}
        </Button>
      </Stack>
    </Box>
  );
}

function LanguagePreference() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        {translate("settings.language_title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {translate("settings.language_subtitle")}
      </Typography>
      <FormControl sx={{ minWidth: 220 }}>
        <Select
          aria-label={translate("settings.language_title")}
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          <MenuItem value="es">{translate("settings.languages.es")}</MenuItem>
          <MenuItem value="en">{translate("settings.languages.en")}</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}

export default function SettingsPage() {
  const { t: translate } = useTranslation();
  const canAdmin = useSessionStore((state) =>
    state.hasCapability("admin:write"),
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {translate("settings.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {translate("settings.subtitle")}
      </Typography>

      {canAdmin ? (
        <>
          <OperationalSettings />
          <Divider sx={{ my: 4 }} />
        </>
      ) : (
        <LanguagePreference />
      )}

      <ThemePicker />
    </Box>
  );
}
