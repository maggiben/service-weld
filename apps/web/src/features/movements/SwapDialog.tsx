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

function cylinderLabel(item: Cylinder): string {
  const owner = item.owner_name ? ` · ${item.owner_name}` : "";
  const gas = item.gas_code ? ` · ${item.gas_code}` : "";
  return `${item.serial_number}${owner}${gas}`;
}

export function SwapDialog({ open, movement, onClose }: Props) {
  const { t: translate } = useTranslation();
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
      const query = cylinderQuery || undefined;
      if (isRefill) {
        const res = await api.listCylinders({
          q: query,
          limit: 30,
          "filter[ownership_basis]": "CUSTOMER",
        });
        return res.data.filter(
          (item) =>
            (item.state === "IN_STOCK_EMPTY" ||
              item.state === "IN_STOCK_FULL" ||
              item.state === "AT_CLIENT") &&
            item.packaging !== "BATTERY_MEMBER",
        );
      }
      const res = await api.listCylinders({
        q: query,
        limit: 30,
        "filter[available_for_rental]": true,
      });
      return res.data.filter(
        (item) =>
          (item.state === "IN_STOCK_EMPTY" || item.state === "IN_STOCK_FULL") &&
          item.ownership_basis !== "CUSTOMER" &&
          item.packaging !== "BATTERY_MEMBER" &&
          item.current_movement_id == null,
      );
    },
    enabled: open,
  });

  const candidates = useMemo(() => {
    const rows = (stockQuery.data ?? []).filter(
      (item) => item.id !== movement?.cylinder_id,
    );
    if (replacement && !rows.some((row) => row.id === replacement.id)) {
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
          setError(translate("errors.returned_cylinder_busy"));
          return;
        }
        if (err.code === "NOT_OPEN") {
          setError(translate("errors.not_open"));
          return;
        }
        if (err.code === "RETURN_BEFORE_DELIVERY") {
          setError(translate("errors.return_before_delivery"));
          return;
        }
        if (err.code === "KIND_BASIS_MISMATCH") {
          setError(translate("errors.kind_basis_mismatch"));
          return;
        }
        if (err.code === "CYLINDER_ALREADY_OUT") {
          setError(translate("errors.cylinder_already_out"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const invalid =
    !movement ||
    !replacement ||
    dayjs(swapDate).isBefore(dayjs(movement.delivery_date), "day");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate("movements.swap.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {movement && (
            <Typography variant="body2" color="text.secondary">
              {translate("movements.swap.summary", {
                serial: movement.cylinder_serial,
                holder: movement.holder_name,
              })}
            </Typography>
          )}
          <Alert severity="info" sx={{ py: 0.5 }}>
            {translate("movements.swap.hint")}
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <Autocomplete
            options={candidates}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : cylinderLabel(option)
            }
            isOptionEqualToValue={(left, right) => left.id === right.id}
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
                label={translate("movements.swap.replacement_cylinder")}
                required
                helperText={translate("movements.swap.replacement_hint")}
              />
            )}
          />
          <DatePicker
            label={translate("movements.swap.swap_date")}
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
        <Button onClick={onClose}>{translate("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {translate("movements.swap.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
