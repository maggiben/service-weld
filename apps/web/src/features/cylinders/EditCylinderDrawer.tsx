"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
      setConflictError(null);
    }
  }, [open, cylinder, reset]);

  const update = useMutation({
    mutationFn: (patch: FormValues) => {
      if (!cylinder) throw new Error("Missing cylinder for update");
      return api.updateCylinder(cylinder.id, patch, {
        ifMatch: cylinder.version,
      });
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
    if (isDirty && !window.confirm(translate("cylinders.form.unsaved_confirm")))
      return;
    onClose();
  };

  const onSubmit = (values: FormValues) => {
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
    update.mutate(patch);
  };

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

        <Alert severity="info" sx={{ mb: 2 }}>
          {translate("cylinders.form.edit_hint")}
        </Alert>

        <Stack spacing={2} sx={{ flex: 1, overflow: "auto" }}>
          <Controller
            name="gas_code"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={Boolean(errors.gas_code)}>
                <InputLabel>{translate("cylinders.form.gas")}</InputLabel>
                <Select
                  label={translate("cylinders.form.gas")}
                  value={field.value ?? ""}
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
            disabled={isSubmitting || update.isPending || !isDirty}
          >
            {translate("actions.save")}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
