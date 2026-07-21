"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Cylinder, MovementEvent } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  movement: MovementEvent | null;
  onClose: () => void;
}

function cylinderLabel(c: Cylinder): string {
  const owner = c.owner_name ? ` · ${c.owner_name}` : "";
  const gas = c.gas_code ? ` · ${c.gas_code}` : "";
  return `${c.serial_number}${owner}${gas}`;
}

export function SwapDialog({ open, movement, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [replacement, setReplacement] = useState<Cylinder | null>(null);
  const [cylinderQuery, setCylinderQuery] = useState("");
  const [swapDate, setSwapDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReplacement(null);
      setCylinderQuery("");
      setSwapDate(dayjs().format("YYYY-MM-DD"));
      setError(null);
    }
  }, [open, movement?.id]);

  const isRefill = movement?.movement_kind === "REFILL";

  const stockQuery = useQuery({
    queryKey: ["cylinders", "swap-candidates", isRefill, cylinderQuery],
    queryFn: async () => {
      const q = cylinderQuery || undefined;
      if (isRefill) {
        const res = await api.listCylinders({
          q,
          limit: 30,
          "filter[ownership_basis]": "CUSTOMER",
        });
        return res.data.filter(
          (c) =>
            (c.state === "IN_STOCK_EMPTY" ||
              c.state === "IN_STOCK_FULL" ||
              c.state === "AT_CLIENT") &&
            c.packaging !== "BATTERY_MEMBER",
        );
      }
      const res = await api.listCylinders({
        q,
        limit: 30,
        "filter[available_for_rental]": true,
      });
      return res.data.filter(
        (c) =>
          (c.state === "IN_STOCK_EMPTY" || c.state === "IN_STOCK_FULL") &&
          c.ownership_basis !== "CUSTOMER" &&
          c.packaging !== "BATTERY_MEMBER" &&
          c.current_movement_id == null,
      );
    },
    enabled: open,
  });

  const candidates = useMemo(() => {
    const rows = (stockQuery.data ?? []).filter(
      (c) => c.id !== movement?.cylinder_id,
    );
    if (replacement && !rows.some((c) => c.id === replacement.id)) {
      return [replacement, ...rows];
    }
    return rows;
  }, [stockQuery.data, movement?.cylinder_id, replacement]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!movement || !replacement) throw new Error("Missing");
      return api.swapMovement(
        movement.id,
        {
          returned_cylinder_id: replacement.id,
          return_date: swapDate,
        },
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
        if (err.code === "RETURNED_CYLINDER_BUSY") {
          setError(t("errors.returned_cylinder_busy"));
          return;
        }
        if (err.code === "NOT_OPEN") {
          setError(t("errors.not_open"));
          return;
        }
        if (err.code === "RETURN_BEFORE_DELIVERY") {
          setError(t("errors.return_before_delivery"));
          return;
        }
        if (err.code === "KIND_BASIS_MISMATCH") {
          setError(t("errors.kind_basis_mismatch"));
          return;
        }
        if (err.code === "CYLINDER_ALREADY_OUT") {
          setError(t("errors.cylinder_already_out"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const invalid =
    !movement ||
    !replacement ||
    dayjs(swapDate).isBefore(dayjs(movement.delivery_date), "day");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("movements.swap.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {movement && (
            <Typography variant="body2" color="text.secondary">
              {t("movements.swap.summary", {
                serial: movement.cylinder_serial,
                holder: movement.holder_name,
              })}
            </Typography>
          )}
          <Alert severity="info" sx={{ py: 0.5 }}>
            {t("movements.swap.hint")}
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <Autocomplete
            options={candidates}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : cylinderLabel(option)
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={stockQuery.isFetching}
            filterOptions={(opts) => opts}
            value={replacement}
            onChange={(_, value) => setReplacement(value)}
            onInputChange={(_, value, reason) => {
              if (reason !== "reset") setCylinderQuery(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("movements.swap.replacement_cylinder")}
                required
                helperText={t("movements.swap.replacement_hint")}
              />
            )}
          />
          <DatePicker
            label={t("movements.swap.swap_date")}
            value={dayjs(swapDate)}
            minDate={movement ? dayjs(movement.delivery_date) : undefined}
            onChange={(value: Dayjs | null) => {
              if (value) setSwapDate(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t("movements.swap.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
