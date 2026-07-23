"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Alert } from "@weld/schemas";
import { api } from "@/api/client";
import { useNotificationStore } from "@/store/notificationStore";
import { formatAlertDetail } from "./alertDisplay";

type Props = {
  alert: Alert | null;
  open: boolean;
  onClose: () => void;
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

export function AlertContactDialog({ alert, open, onClose }: Props) {
  const { t: translate } = useTranslation();
  const pushToast = useNotificationStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [contactDate, setContactDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    if (!alert || !open) return;
    setNote(alert.contact_note ?? "");
    setContactDate(toDateInputValue(alert.last_contacted_at));
  }, [alert, open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!alert) throw new Error("No alert");
      const at = new Date(`${contactDate}T12:00:00`);
      return api.updateAlertContact(alert.id, {
        contact_note: note.trim() ? note.trim() : null,
        last_contacted_at: at.toISOString(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      pushToast(translate("alerts.contact_saved"));
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate("alerts.contact.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {alert && (
            <Typography variant="body2" color="text.secondary">
              {translate(`enums.alert_type.${alert.alert_type}`, {
                defaultValue: alert.alert_type,
              })}
              {" · "}
              {formatAlertDetail(alert, translate)}
              {alert.client_phone ? ` · ${alert.client_phone}` : ""}
            </Typography>
          )}
          <TextField
            label={translate("alerts.contact.date")}
            type="date"
            value={contactDate}
            onChange={(event) => setContactDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label={translate("alerts.contact.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={4}
            fullWidth
            placeholder={translate("alerts.contact.note_placeholder")}
            helperText={translate("alerts.contact.note_help")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={mutation.isPending || !alert}
          onClick={() => mutation.mutate()}
        >
          {translate("actions.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
