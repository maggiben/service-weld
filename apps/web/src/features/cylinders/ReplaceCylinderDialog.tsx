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
  const { t: translate } = useTranslation();
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
          setError(translate("errors.replacement_not_available"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const candidates = (stockQuery.data?.data ?? []).filter(
    (item) => item.id !== cylinder?.id && item.packaging !== "BATTERY_MEMBER",
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{translate("cylinders.replace.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {cylinder && (
            <Typography variant="body2" color="text.secondary">
              {translate("cylinders.replace.summary", {
                serial: cylinder.serial_number,
              })}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            fullWidth
            label={translate("cylinders.replace.replacement")}
            value={replacementId}
            onChange={(event) =>
              setReplacementId(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
          >
            {candidates.map((candidate) => (
              <MenuItem key={candidate.id} value={candidate.id}>
                {candidate.serial_number}
                {candidate.gas_code ? ` · ${candidate.gas_code}` : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label={translate("cylinders.replace.client")}
            value={clientId}
            onChange={(event) =>
              setClientId(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
          >
            {(clientsQuery.data?.data ?? []).map((client) => (
              <MenuItem key={client.id} value={client.id}>
                {client.name}
              </MenuItem>
            ))}
          </TextField>
          <DatePicker
            label={translate("cylinders.replace.occurred_on")}
            value={dayjs(occurredOn)}
            onChange={(value: Dayjs | null) => {
              if (value) setOccurredOn(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { fullWidth: true } }}
          />
          <TextField
            fullWidth
            label={translate("cylinders.replace.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate("actions.cancel")}</Button>
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
          {translate("cylinders.replace.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
