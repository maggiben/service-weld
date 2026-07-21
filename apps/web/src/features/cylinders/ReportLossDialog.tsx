"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Cylinder } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  cylinder: Cylinder | null;
  onClose: () => void;
}

export function ReportLossDialog({ open, cylinder, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<"LOST" | "BROKEN">("LOST");
  const [occurredOn, setOccurredOn] = useState(dayjs().format("YYYY-MM-DD"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supplierAlert, setSupplierAlert] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcome("LOST");
      setOccurredOn(dayjs().format("YYYY-MM-DD"));
      setNote("");
      setError(null);
      setSupplierAlert(false);
    }
  }, [open, cylinder?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!cylinder) throw new Error("No cylinder");
      return api.reportCylinderLoss(
        cylinder.id,
        {
          outcome,
          occurred_on: occurredOn,
          note: note.trim() || null,
        },
        { ifMatch: cylinder.version },
      );
    },
    onSuccess: async (result) => {
      setSupplierAlert(Boolean(result.alert));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
      ]);
      if (!result.alert) onClose();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "ALREADY_TERMINAL") {
          setError(t("errors.already_terminal"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("cylinders.loss.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {cylinder && (
            <Typography variant="body2" color="text.secondary">
              {t("cylinders.loss.summary", {
                serial: cylinder.serial_number,
                state: t(`enums.cylinder_state.${cylinder.state}`),
              })}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {supplierAlert && (
            <Alert severity="warning">
              {t("cylinders.loss.supplier_alert")}
            </Alert>
          )}
          <TextField
            select
            fullWidth
            label={t("cylinders.loss.outcome")}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as "LOST" | "BROKEN")}
            disabled={supplierAlert}
          >
            <MenuItem value="LOST">{t("enums.cylinder_state.LOST")}</MenuItem>
            <MenuItem value="BROKEN">
              {t("enums.cylinder_state.BROKEN")}
            </MenuItem>
          </TextField>
          <DatePicker
            label={t("cylinders.loss.occurred_on")}
            value={dayjs(occurredOn)}
            disabled={supplierAlert}
            onChange={(value: Dayjs | null) => {
              if (value) setOccurredOn(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { fullWidth: true } }}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t("cylinders.loss.note")}
            value={note}
            disabled={supplierAlert}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {supplierAlert ? t("actions.close") : t("actions.cancel")}
        </Button>
        {!supplierAlert && (
          <Button
            color="error"
            variant="contained"
            disabled={!cylinder || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("cylinders.loss.confirm")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
