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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function ReplaceCylinderDialog({ open, cylinder, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [replacementId, setReplacementId] = useState<number | "">("");
  const [clientId, setClientId] = useState<number | "">("");
  const [occurredOn, setOccurredOn] = useState(dayjs().format("YYYY-MM-DD"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReplacementId("");
      setClientId("");
      setOccurredOn(dayjs().format("YYYY-MM-DD"));
      setNote("");
      setError(null);
    }
  }, [open, cylinder?.id]);

  const stockQuery = useQuery({
    queryKey: ["cylinders", "replace-stock"],
    queryFn: () =>
      api.listCylinders({
        limit: 100,
        "filter[state]": "IN_STOCK_FULL",
        sort: "serial_number",
      }),
    enabled: open,
  });

  const clientsQuery = useQuery({
    queryKey: ["clients", "replace"],
    queryFn: () => api.listClients({ limit: 100, sort: "name" }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!cylinder || replacementId === "" || clientId === "") {
        throw new Error("missing");
      }
      return api.replaceCylinder(
        cylinder.id,
        {
          replacement_cylinder_id: Number(replacementId),
          client_party_id: Number(clientId),
          occurred_on: occurredOn,
          note: note.trim() || null,
        },
        { ifMatch: cylinder.version },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "REPLACEMENT_NOT_AVAILABLE") {
          setError(t("errors.replacement_not_available"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const candidates = (stockQuery.data?.data ?? []).filter(
    (c) => c.id !== cylinder?.id && c.packaging !== "BATTERY_MEMBER",
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("cylinders.replace.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {cylinder && (
            <Typography variant="body2" color="text.secondary">
              {t("cylinders.replace.summary", {
                serial: cylinder.serial_number,
              })}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            fullWidth
            label={t("cylinders.replace.replacement")}
            value={replacementId}
            onChange={(e) =>
              setReplacementId(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          >
            {candidates.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.serial_number}
                {c.gas_code ? ` · ${c.gas_code}` : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label={t("cylinders.replace.client")}
            value={clientId}
            onChange={(e) =>
              setClientId(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            {(clientsQuery.data?.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <DatePicker
            label={t("cylinders.replace.occurred_on")}
            value={dayjs(occurredOn)}
            onChange={(v: Dayjs | null) => {
              if (v) setOccurredOn(v.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { fullWidth: true } }}
          />
          <TextField
            fullWidth
            label={t("cylinders.replace.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={
            !cylinder ||
            replacementId === "" ||
            clientId === "" ||
            mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          {t("cylinders.replace.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
