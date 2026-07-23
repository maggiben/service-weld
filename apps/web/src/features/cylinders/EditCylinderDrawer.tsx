"use client";

import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isCylinderDataEditable } from "@weld/domain";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  CapacityUnit,
  UpdateCylinderInput,
  type Cylinder,
  type UpdateCylinderInput as FormValues,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { GAS_CODES } from "../../constants/masters";
import { applyServerErrors } from "../../hooks/useServerErrors";
import { useLocations } from "../../hooks/useLocations";

interface Props {
  open: boolean;
  cylinder: Cylinder | null;
  onClose: () => void;
}

export function EditCylinderDrawer({ open, cylinder, onClose }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const { territories } = useLocations();
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [markFull, setMarkFull] = useState(false);
  const [markEmpty, setMarkEmpty] = useState(false);

  const canMarkFull = cylinder?.state === "IN_STOCK_EMPTY";
  const canMarkEmpty = cylinder?.state === "IN_STOCK_FULL";
  const conditionDirty = markFull || markEmpty;
  const dataEditable =
    cylinder != null && isCylinderDataEditable(cylinder.state);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(UpdateCylinderInput),
    defaultValues: {
      gas_code: null,
      capacity_m3: null,
      capacity_unit: "M3",
      home_territory_id: null,
      acquisition_date: null,
    },
  });

  useEffect(() => {
    if (open && cylinder) {
      reset({
        gas_code: cylinder.gas_code,
        capacity_m3: cylinder.capacity_m3,
        capacity_unit: cylinder.capacity_unit,
        home_territory_id: cylinder.home_territory_id,
        acquisition_date: cylinder.acquisition_date,
      });
      setMarkFull(false);
      setMarkEmpty(false);
      setConflictError(null);
    }
  }, [open, cylinder, reset]);

  const save = useMutation({
    mutationFn: async (patch: FormValues) => {
      if (!cylinder) throw new Error("Missing cylinder for update");
      let current = cylinder;
      if (Object.keys(patch).length > 0) {
        current = await api.updateCylinder(cylinder.id, patch, {
          ifMatch: current.version,
        });
      }
      if (markFull && current.state === "IN_STOCK_EMPTY") {
        current = await api.fillCylinder(current.id, {
          ifMatch: current.version,
        });
      } else if (markEmpty && current.state === "IN_STOCK_FULL") {
        current = await api.emptyCylinder(current.id, {
          ifMatch: current.version,
        });
      }
      return current;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["cylinders"] });
      await queryClient.invalidateQueries({
        queryKey: ["cylinder", updated.id],
      });
      onClose();
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        error.code === "VERSION_CONFLICT"
      ) {
        setConflictError(translate("errors.version_conflict"));
        return;
      }
      if (
        error instanceof ApiClientError &&
        error.code === "CYLINDER_HELD_BY_CLIENT"
      ) {
        setConflictError(translate("errors.cylinder_held_by_client"));
        return;
      }
      if (!applyServerErrors(error, setError, "gas_code")) {
        setConflictError(
          error instanceof ApiClientError
            ? error.message
            : translate("errors.generic"),
        );
      }
    },
  });

  const handleClose = () => {
    if (
      (isDirty || conditionDirty) &&
      !window.confirm(translate("cylinders.form.unsaved_confirm"))
    ) {
      return;
    }
    onClose();
  };

  const onSubmit = (values: FormValues) => {
    if (!dataEditable) return;
    const patch: FormValues = {};
    if (dirtyFields.gas_code) patch.gas_code = values.gas_code ?? null;
    if (dirtyFields.capacity_m3) patch.capacity_m3 = values.capacity_m3 ?? null;
    if (dirtyFields.capacity_unit) {
      patch.capacity_unit = values.capacity_unit;
    }
    if (dirtyFields.home_territory_id) {
      patch.home_territory_id = values.home_territory_id ?? null;
    }
    if (dirtyFields.acquisition_date) {
      patch.acquisition_date = values.acquisition_date ?? null;
    }
    if (Object.keys(patch).length === 0 && !conditionDirty) return;
    save.mutate(patch);
  };

  const canSubmit = dataEditable && (isDirty || conditionDirty);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{
          p: 3,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography variant="h6" sx={{ mb: 1 }}>
          {translate("cylinders.form.title_edit")}
        </Typography>
        {cylinder && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {translate("cylinders.detail.title", {
              serial: cylinder.serial_number,
            })}
          </Typography>
        )}

        {conflictError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {conflictError}
          </Alert>
        )}

        {!dataEditable ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {translate("cylinders.form.edit_locked_at_client")}
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            {translate("cylinders.form.edit_hint")}
          </Alert>
        )}

        <Stack spacing={2} sx={{ flex: 1, overflow: "auto" }}>
          {dataEditable && (canMarkFull || canMarkEmpty) && (
            <>
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                }}
              >
                {canMarkFull && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={markFull}
                        onChange={(event) => setMarkFull(event.target.checked)}
                        color="success"
                      />
                    }
                    label={
                      <Stack spacing={0.25}>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                        >
                          <LocalGasStationIcon
                            fontSize="small"
                            color="success"
                          />
                          <Typography variant="body2" fontWeight={600}>
                            {translate("cylinders.form.mark_full")}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {translate("cylinders.form.mark_full_hint")}
                        </Typography>
                      </Stack>
                    }
                    sx={{ alignItems: "flex-start", m: 0 }}
                  />
                )}
                {canMarkEmpty && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={markEmpty}
                        onChange={(event) => setMarkEmpty(event.target.checked)}
                      />
                    }
                    label={
                      <Stack spacing={0.25}>
                        <Stack
                          direction="row"
                          spacing={0.75}
                          alignItems="center"
                        >
                          <WaterDropOutlinedIcon fontSize="small" />
                          <Typography variant="body2" fontWeight={600}>
                            {translate("cylinders.form.mark_empty")}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {translate("cylinders.form.mark_empty_hint")}
                        </Typography>
                      </Stack>
                    }
                    sx={{ alignItems: "flex-start", m: 0 }}
                  />
                )}
              </Box>
              <Divider />
            </>
          )}

          <Controller
            name="gas_code"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={Boolean(errors.gas_code)}>
                <InputLabel>{translate("cylinders.form.gas")}</InputLabel>
                <Select
                  label={translate("cylinders.form.gas")}
                  value={field.value ?? ""}
                  disabled={!dataEditable}
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
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
                {errors.gas_code && (
                  <FormHelperText>{errors.gas_code.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />

          <Controller
            name="capacity_unit"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>
                  {translate("cylinders.form.capacity_unit")}
                </InputLabel>
                <Select
                  label={translate("cylinders.form.capacity_unit")}
                  value={field.value ?? "M3"}
                  disabled={!dataEditable}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value as FormValues["capacity_unit"],
                    )
                  }
                >
                  {CapacityUnit.options.map((unit) => (
                    <MenuItem key={unit} value={unit}>
                      {translate(`enums.capacity_unit.${unit}`)}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {translate("cylinders.form.capacity_hint")}
                </FormHelperText>
              </FormControl>
            )}
          />

          <Controller
            name="capacity_m3"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
                type="number"
                label={translate("cylinders.form.capacity")}
                fullWidth
                disabled={!dataEditable}
                error={Boolean(errors.capacity_m3)}
                helperText={errors.capacity_m3?.message}
              />
            )}
          />

          <Controller
            name="home_territory_id"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>{translate("cylinders.form.territory")}</InputLabel>
                <Select
                  label={translate("cylinders.form.territory")}
                  value={field.value ?? ""}
                  disabled={!dataEditable}
                  onChange={(event) => {
                    const value = event.target.value;
                    field.onChange(value === "" ? null : Number(value));
                  }}
                >
                  <MenuItem value="">
                    <em>{translate("cylinders.form.territory_none")}</em>
                  </MenuItem>
                  {territories.map((territory) => (
                    <MenuItem key={territory.id} value={territory.id}>
                      {territory.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {translate("cylinders.form.territory_hint")}
                </FormHelperText>
              </FormControl>
            )}
          />

          <Controller
            name="acquisition_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === "" ? null : event.target.value,
                  )
                }
                type="date"
                label={translate("cylinders.form.acquisition_date")}
                fullWidth
                disabled={!dataEditable}
                InputLabelProps={{ shrink: true }}
                error={Boolean(errors.acquisition_date)}
                helperText={errors.acquisition_date?.message}
              />
            )}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
          <Button onClick={handleClose}>{translate("actions.cancel")}</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || save.isPending || !canSubmit}
          >
            {translate("actions.save")}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
