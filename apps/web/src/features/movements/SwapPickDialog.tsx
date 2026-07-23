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

function movementLabel(member: MovementEvent): string {
  const serial = member.cylinder_serial ?? `#${member.cylinder_id}`;
  const holder = member.holder_name ?? `#${member.holder_party_id}`;
  return `${serial} · ${holder} · ${member.delivery_date}`;
}

/** Pick an OPEN movement to start a swap from the toolbar. */
export function SwapPickDialog({ open, onClose, onSelect }: Props) {
  const { t: translate } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<MovementEvent | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelected(null);
    }
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const openMovements = useQuery({
    queryKey: ["movements", "swap-picker", debouncedQuery],
    queryFn: () =>
      api.listMovements({
        open: true,
        limit: 40,
        sort: "-delivery_date",
        q: debouncedQuery.trim() || undefined,
      }),
    enabled: open,
  });

  const options = useMemo(() => {
    const rows = openMovements.data?.data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    // Client-side refine for holder name / id while typing (serial is server-side via q).
    return rows.filter((row) => {
      const hay =
        `${row.cylinder_serial ?? ""} ${row.holder_name ?? ""} ${row.id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [openMovements.data, query]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{translate("movements.swap.pick_title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {translate("movements.swap.pick_hint")}
          </Typography>
          <Autocomplete
            options={options}
            loading={openMovements.isFetching}
            getOptionLabel={(option) =>
              typeof option === "string" ? option : movementLabel(option)
            }
            isOptionEqualToValue={(left, right) => left.id === right.id}
            filterOptions={(opts) => opts}
            value={selected}
            onChange={(_, value) => setSelected(value)}
            onInputChange={(_, value, reason) => {
              if (reason !== "reset") setQuery(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("movements.swap.pick_movement")}
                placeholder={translate("movements.swap.pick_placeholder")}
                autoFocus
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{translate("actions.cancel")}</Button>
        <Button
          variant="contained"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onSelect(selected);
          }}
        >
          {translate("actions.continue")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
