"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MovementEvent } from "@weld/schemas";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (movement: MovementEvent) => void;
}

function movementLabel(m: MovementEvent): string {
  const serial = m.cylinder_serial ?? `#${m.cylinder_id}`;
  const holder = m.holder_name ?? `#${m.holder_party_id}`;
  return `${serial} · ${holder} · ${m.delivery_date}`;
}

/** Pick an OPEN movement to start a swap from the toolbar. */
export function SwapPickDialog({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MovementEvent | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open]);

  const openMovements = useQuery({
    queryKey: ["movements", "swap-picker", query],
    queryFn: () =>
      api.listMovements({
        open: true,
        limit: 40,
        sort: "-delivery_date",
      }),
    enabled: open,
  });

  const options = useMemo(() => {
    const rows = openMovements.data?.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => {
      const hay =
        `${m.cylinder_serial ?? ""} ${m.holder_name ?? ""} ${m.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [openMovements.data, query]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("movements.swap.pick_title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("movements.swap.pick_hint")}
          </Typography>
          <Autocomplete
            options={options}
            loading={openMovements.isFetching}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : movementLabel(option)
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(opts) => opts}
            value={selected}
            onChange={(_, value) => setSelected(value)}
            onInputChange={(_, value, reason) => {
              if (reason !== "reset") setQuery(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("movements.swap.pick_movement")}
                placeholder={t("movements.swap.pick_placeholder")}
                autoFocus
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onSelect(selected);
          }}
        >
          {t("actions.continue")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
