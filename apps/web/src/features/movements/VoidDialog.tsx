"use client";

import Alert from "@mui/material/Alert";
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
import type { MovementEvent } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  movement: MovementEvent | null;
  onClose: () => void;
}

export function VoidDialog({ open, movement, onClose }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open, movement?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!movement) throw new Error("No movement");
      return api.voidMovement(
        movement.id,
        { reason: reason.trim() },
        { ifMatch: movement.version },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
        queryClient.invalidateQueries({ queryKey: ["outstanding"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const invalid = !movement || reason.trim().length === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{translate("movements.void.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {movement && (
            <Typography variant="body2" color="text.secondary">
              {translate("movements.void.summary", {
                serial: movement.cylinder_serial,
                state: translate(`enums.movement_state.${movement.state}`),
              })}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            fullWidth
            required
            multiline
            minRows={2}
            label={translate("movements.void.reason")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate("actions.cancel")}</Button>
        <Button
          color="warning"
          variant="contained"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {translate("movements.void.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
