"use client";

import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isCylinderDataEditable } from "@weld/domain";
import type { CapacityUnit, Cylinder, GasCode } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { GAS_CODES } from "../../constants/masters";
import { formatCapacity } from "../../lib/format";

interface Props {
  cylinder: Cylinder;
  canWrite: boolean;
}

function mutationErrorMessage(
  err: unknown,
  translate: (key: string) => string,
): string {
  if (err instanceof ApiClientError && err.code === "VERSION_CONFLICT") {
    return translate("errors.version_conflict");
  }
  if (err instanceof ApiClientError && err.code === "CYLINDER_HELD_BY_CLIENT") {
    return translate("errors.cylinder_held_by_client");
  }
  if (err instanceof ApiClientError) return err.message;
  return translate("errors.generic");
}

function parseCapacityMagnitude(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const capacity = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("INVALID_CAPACITY");
  }
  return capacity;
}

export function CylinderWorkshopPanel({ cylinder, canWrite }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [gasDraft, setGasDraft] = useState<string>(cylinder.gas_code ?? "");
  const [capacityDraft, setCapacityDraft] = useState(
    cylinder.capacity_m3 != null ? String(cylinder.capacity_m3) : "",
  );
  const [unitDraft, setUnitDraft] = useState<CapacityUnit>(
    cylinder.capacity_unit,
  );
  const [capacityError, setCapacityError] = useState<string | null>(null);

  useEffect(() => {
    setGasDraft(cylinder.gas_code ?? "");
    setCapacityDraft(
      cylinder.capacity_m3 != null ? String(cylinder.capacity_m3) : "",
    );
    setUnitDraft(cylinder.capacity_unit);
    setCapacityError(null);
    setError(null);
  }, [
    cylinder.id,
    cylinder.gas_code,
    cylinder.capacity_m3,
    cylinder.capacity_unit,
    cylinder.version,
  ]);

  const canFill = canWrite && cylinder.state === "IN_STOCK_EMPTY";
  const canEmpty = canWrite && cylinder.state === "IN_STOCK_FULL";
  const canEditData = canWrite && isCylinderDataEditable(cylinder.state);
  const gasDirty = (gasDraft || null) !== (cylinder.gas_code ?? null);
  const capacityDirty =
    capacityDraft.trim() !==
      (cylinder.capacity_m3 != null ? String(cylinder.capacity_m3) : "") ||
    unitDraft !== cylinder.capacity_unit;
  const conditionBusy =
    cylinder.state !== "IN_STOCK_EMPTY" && cylinder.state !== "IN_STOCK_FULL";

  const invalidate = async (id: number) => {
    await queryClient.invalidateQueries({ queryKey: ["cylinders"] });
    await queryClient.invalidateQueries({ queryKey: ["cylinder", id] });
  };

  const fill = useMutation({
    mutationFn: () =>
      api.fillCylinder(cylinder.id, { ifMatch: cylinder.version }),
    onSuccess: async (updated) => {
      setError(null);
      await invalidate(updated.id);
    },
    onError: (err) => setError(mutationErrorMessage(err, translate)),
  });

  const empty = useMutation({
    mutationFn: () =>
      api.emptyCylinder(cylinder.id, { ifMatch: cylinder.version }),
    onSuccess: async (updated) => {
      setError(null);
      await invalidate(updated.id);
    },
    onError: (err) => setError(mutationErrorMessage(err, translate)),
  });

  const saveGas = useMutation({
    mutationFn: () =>
      api.updateCylinder(
        cylinder.id,
        { gas_code: (gasDraft || null) as GasCode | null },
        { ifMatch: cylinder.version },
      ),
    onSuccess: async (updated) => {
      setError(null);
      setGasDraft(updated.gas_code ?? "");
      await invalidate(updated.id);
    },
    onError: (err) => setError(mutationErrorMessage(err, translate)),
  });

  const saveCapacity = useMutation({
    mutationFn: () => {
      const capacity = parseCapacityMagnitude(capacityDraft);
      return api.updateCylinder(
        cylinder.id,
        {
          capacity_m3: capacity,
          capacity_unit: unitDraft,
        },
        { ifMatch: cylinder.version },
      );
    },
    onSuccess: async (updated) => {
      setError(null);
      setCapacityError(null);
      setCapacityDraft(
        updated.capacity_m3 != null ? String(updated.capacity_m3) : "",
      );
      setUnitDraft(updated.capacity_unit);
      await invalidate(updated.id);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "INVALID_CAPACITY") {
        setCapacityError(translate("cylinders.inline.capacity_invalid"));
        return;
      }
      setCapacityError(null);
      setError(mutationErrorMessage(err, translate));
    },
  });

  const conditionPending = fill.isPending || empty.isPending;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {translate("cylinders.workshop.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {translate("cylinders.workshop.hint")}
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {!canEditData && canWrite && (
          <Alert severity="info">
            {translate("cylinders.workshop.edit_locked_at_client")}
          </Alert>
        )}

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          divider={
            <Divider
              orientation="vertical"
              flexItem
              sx={{ display: { xs: "none", md: "block" } }}
            />
          }
        >
          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {translate("cylinders.workshop.fill_label")}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              <Chip
                size="small"
                label={translate(`enums.condition.${cylinder.condition}`)}
                color={cylinder.condition === "FULL" ? "success" : "default"}
              />
              <Chip
                size="small"
                variant="outlined"
                label={translate(`enums.cylinder_state.${cylinder.state}`)}
              />
            </Stack>
            {canFill || canEmpty ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  {canFill
                    ? translate("cylinders.workshop.fill_hint")
                    : translate("cylinders.workshop.empty_hint")}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {canFill && (
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<LocalGasStationIcon />}
                      disabled={conditionPending}
                      onClick={() => fill.mutate()}
                    >
                      {translate("actions.mark_full")}
                    </Button>
                  )}
                  {canEmpty && (
                    <Button
                      variant="outlined"
                      startIcon={<WaterDropOutlinedIcon />}
                      disabled={conditionPending}
                      onClick={() => empty.mutate()}
                    >
                      {translate("actions.mark_empty")}
                    </Button>
                  )}
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {conditionBusy
                  ? translate("cylinders.workshop.condition_unavailable")
                  : translate("cylinders.workshop.fill_unavailable")}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {translate("cylinders.workshop.gas_label")}
            </Typography>
            {canEditData ? (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ sm: "center" }}
              >
                <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
                  <InputLabel>{translate("cylinders.form.gas")}</InputLabel>
                  <Select
                    label={translate("cylinders.form.gas")}
                    value={gasDraft}
                    onChange={(event) => setGasDraft(event.target.value)}
                    disabled={saveGas.isPending}
                  >
                    <MenuItem value="">
                      <em>{translate("cylinders.form.gas_none")}</em>
                    </MenuItem>
                    {GAS_CODES.map((code) => (
                      <MenuItem key={code} value={code}>
                        {translate(`enums.gas.${code}`, { defaultValue: code })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  disabled={!gasDirty || saveGas.isPending}
                  onClick={() => saveGas.mutate()}
                >
                  {translate("actions.save")}
                </Button>
              </Stack>
            ) : (
              <Typography variant="body2">
                {cylinder.gas_code
                  ? translate(`enums.gas.${cylinder.gas_code}`, {
                      defaultValue: cylinder.gas_code,
                    })
                  : "—"}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {translate("cylinders.workshop.capacity_label")}
            </Typography>
            {canEditData ? (
              <Stack spacing={1}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "flex-start" }}
                >
                  <TextField
                    size="small"
                    type="number"
                    label={translate("cylinders.form.capacity")}
                    value={capacityDraft}
                    onChange={(event) => {
                      setCapacityDraft(event.target.value);
                      setCapacityError(null);
                    }}
                    error={Boolean(capacityError)}
                    disabled={saveCapacity.isPending}
                    inputProps={{ min: 0, step: "any" }}
                    sx={{ minWidth: 120, flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>
                      {translate("cylinders.form.capacity_unit")}
                    </InputLabel>
                    <Select
                      label={translate("cylinders.form.capacity_unit")}
                      value={unitDraft}
                      onChange={(event) =>
                        setUnitDraft(event.target.value as CapacityUnit)
                      }
                      disabled={saveCapacity.isPending}
                    >
                      <MenuItem value="M3">
                        {translate("enums.capacity_unit.M3")}
                      </MenuItem>
                      <MenuItem value="KG">
                        {translate("enums.capacity_unit.KG")}
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    disabled={!capacityDirty || saveCapacity.isPending}
                    onClick={() => saveCapacity.mutate()}
                    sx={{ alignSelf: { sm: "center" } }}
                  >
                    {translate("actions.save")}
                  </Button>
                </Stack>
                <FormHelperText error={Boolean(capacityError)}>
                  {capacityError ?? translate("cylinders.form.capacity_hint")}
                </FormHelperText>
              </Stack>
            ) : (
              <Typography variant="body2">
                {formatCapacity(cylinder.capacity_m3, cylinder.capacity_unit)}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">
              {translate("cylinders.workshop.hydro_label")}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScienceOutlinedIcon color="disabled" fontSize="small" />
              <Typography variant="body2" color="text.secondary">
                {translate("cylinders.workshop.hydro_none")}
              </Typography>
            </Stack>
            <Box>
              <Button size="small" variant="outlined" disabled>
                {translate("cylinders.workshop.hydro_action")}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {translate("cylinders.workshop.hydro_soon")}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
