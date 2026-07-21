"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { calendarDaysBetween } from "@weld/domain";
import type { MovementEvent } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  movement: MovementEvent | null;
  onClose: () => void;
}

export function ReturnDialog({ open, movement, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [returnDate, setReturnDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReturnDate(dayjs().format("YYYY-MM-DD"));
      setError(null);
    }
  }, [open, movement?.id]);

  const previewDays = useMemo(() => {
    if (!movement) return null;
    try {
      return calendarDaysBetween(movement.delivery_date, returnDate);
    } catch {
      return null;
    }
  }, [movement, returnDate]);

  const invalid = previewDays == null || previewDays < 0 || !movement;

  const mutation = useMutation({
    mutationFn: () => {
      if (!movement) throw new Error("No movement");
      return api.returnMovement(
        movement.id,
        { return_date: returnDate },
        { ifMatch: movement.version },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "RETURN_BEFORE_DELIVERY") {
          setError(t("errors.return_before_delivery"));
          return;
        }
        if (err.code === "NOT_OPEN") {
          setError(t("errors.not_open"));
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
      <DialogTitle>{t("movements.return.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {movement && (
            <Typography variant="body2" color="text.secondary">
              {t("movements.return.summary", {
                serial: movement.cylinder_serial,
                holder: movement.holder_name,
                delivery: movement.delivery_date,
              })}
            </Typography>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          <DatePicker
            label={t("movements.return.return_date")}
            value={dayjs(returnDate)}
            minDate={movement ? dayjs(movement.delivery_date) : undefined}
            onChange={(value: Dayjs | null) => {
              if (value) setReturnDate(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { fullWidth: true } }}
          />

          <Alert severity={invalid ? "warning" : "info"}>
            {invalid
              ? t("movements.return.invalid_preview")
              : t("movements.return.preview", { days: previewDays })}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t("movements.return.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
