"use client";

import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isCylinderDataEditable } from "@weld/domain";
import type { CapacityUnit, Cylinder } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { formatCapacity } from "../../lib/format";

interface Props {
  cylinder: Cylinder;
  canWrite: boolean;
}

export function CapacityInlineCell({ cylinder, canWrite }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const editable = canWrite && isCylinderDataEditable(cylinder.state);
  const [editing, setEditing] = useState(false);
  const [magnitude, setMagnitude] = useState(
    cylinder.capacity_m3 != null ? String(cylinder.capacity_m3) : "",
  );
  const [unit, setUnit] = useState<CapacityUnit>(cylinder.capacity_unit);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () => {
      const trimmed = magnitude.trim();
      const capacity =
        trimmed === "" ? null : Number(trimmed.replace(",", "."));
      if (capacity != null && (!Number.isFinite(capacity) || capacity <= 0)) {
        throw new Error("INVALID_CAPACITY");
      }
      return api.updateCylinder(
        cylinder.id,
        {
          capacity_m3: capacity,
          capacity_unit: unit,
        },
        { ifMatch: cylinder.version },
      );
    },
    onSuccess: async () => {
      setEditing(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["cylinders"] });
      await queryClient.invalidateQueries({
        queryKey: ["cylinder", cylinder.id],
      });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "INVALID_CAPACITY") {
        setError(translate("cylinders.inline.capacity_invalid"));
        return;
      }
      if (err instanceof ApiClientError && err.code === "VERSION_CONFLICT") {
        setError(translate("errors.version_conflict"));
        return;
      }
      if (
        err instanceof ApiClientError &&
        err.code === "CYLINDER_HELD_BY_CLIENT"
      ) {
        setError(translate("errors.cylinder_held_by_client"));
        return;
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const startEdit = () => {
    if (!editable) return;
    setMagnitude(
      cylinder.capacity_m3 != null ? String(cylinder.capacity_m3) : "",
    );
    setUnit(cylinder.capacity_unit);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <Typography
        variant="body2"
        component="button"
        type="button"
        onClick={startEdit}
        sx={{
          border: 0,
          background: "none",
          cursor: editable ? "pointer" : "default",
          p: 0,
          font: "inherit",
          color: "inherit",
          textAlign: "left",
          textDecoration: editable ? "underline dotted" : "none",
          textUnderlineOffset: 3,
          width: "100%",
        }}
        title={
          editable
            ? translate("cylinders.inline.edit_capacity")
            : canWrite && !isCylinderDataEditable(cylinder.state)
              ? translate("cylinders.form.edit_locked_at_client")
              : undefined
        }
      >
        {formatCapacity(cylinder.capacity_m3, cylinder.capacity_unit)}
      </Typography>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      sx={{ width: "100%", py: 0.25 }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <TextField
        size="small"
        type="number"
        value={magnitude}
        onChange={(event) => setMagnitude(event.target.value)}
        error={Boolean(error)}
        helperText={error ?? undefined}
        inputProps={{
          min: 0,
          step: "any",
          "aria-label": translate("cylinders.form.capacity"),
        }}
        sx={{
          width: 72,
          "& .MuiFormHelperText-root": {
            mx: 0,
            position: "absolute",
            top: "100%",
          },
        }}
        autoFocus
      />
      <Select
        size="small"
        value={unit}
        onChange={(event) => setUnit(event.target.value as CapacityUnit)}
        sx={{ width: 72 }}
        inputProps={{ "aria-label": translate("cylinders.form.capacity_unit") }}
      >
        <MenuItem value="M3">m³</MenuItem>
        <MenuItem value="KG">kg</MenuItem>
      </Select>
      <IconButton
        size="small"
        color="primary"
        aria-label={translate("actions.save")}
        disabled={update.isPending}
        onClick={() => update.mutate()}
      >
        <CheckIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={translate("actions.cancel")}
        disabled={update.isPending}
        onClick={cancel}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
