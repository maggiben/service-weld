"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RequireCapability } from "../auth/RequireAuth";

function SettingsPageInner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [days, setDays] = useState("120");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDays(String(settingsQuery.data.supplier_loan_overdue_days));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const value = Number(days);
      if (!Number.isFinite(value) || value < 1 || value > 3650) {
        throw new Error("invalid");
      }
      return api.updateSettings(
        { supplier_loan_overdue_days: value },
        { ifMatch: settingsQuery.data?.version },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t("settings.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t("settings.subtitle")}
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
          {t("settings.saved")}
        </Alert>
      )}
      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        <TextField
          label={t("settings.supplier_loan_overdue_days")}
          type="number"
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          helperText={t("settings.supplier_loan_overdue_days_help")}
          slotProps={{ htmlInput: { min: 1, max: 3650 } }}
          disabled={settingsQuery.isLoading}
        />
        <Button
          variant="contained"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || settingsQuery.isLoading}
          sx={{ alignSelf: "flex-start" }}
        >
          {t("actions.save")}
        </Button>
      </Stack>
    </Box>
  );
}

export default function SettingsPage() {
  return (
    <RequireCapability capability="admin:write">
      <SettingsPageInner />
    </RequireCapability>
  );
}
