"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  CapacityUnit,
  CreateCylinderInput,
  OwnershipBasis,
  type CreateCylinderInput as FormValues,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { GAS_CODES, SEED_OWNERS } from "../../constants/masters";
import { applyServerErrors } from "../../hooks/useServerErrors";
import { useLocations } from "../../hooks/useLocations";

interface Props {
  open: boolean;
  onClose: () => void;
}

type CreateLocationKind = "territory" | "locality";

export function RegisterCylinderDrawer({ open, onClose }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const { territories, refetch: refetchLocations } = useLocations();
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateLocationKind>("territory");
  const [createName, setCreateName] = useState("");
  const [createTerritoryId, setCreateTerritoryId] = useState<number | "">("");
  const [createError, setCreateError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(CreateCylinderInput),
    defaultValues: {
      owner_party_id: 1,
      serial_number: "",
      gas_code: "O2",
      capacity_m3: null,
      capacity_unit: "M3",
      ownership_basis: "OURS",
      packaging: "SINGLE",
      home_territory_id: territories[0]?.id ?? 1,
      acquisition_date: null,
      condition: "EMPTY",
    },
  });

  const ownerId = watch("owner_party_id");
  const owner = useMemo(
    () => SEED_OWNERS.find((item) => item.id === ownerId),
    [ownerId],
  );

  useEffect(() => {
    if (owner) {
      setValue("ownership_basis", owner.basis as FormValues["ownership_basis"]);
    }
  }, [owner, setValue]);

  useEffect(() => {
    if (open) {
      reset({
        owner_party_id: 1,
        serial_number: "",
        gas_code: "O2",
        capacity_m3: null,
        capacity_unit: "M3",
        ownership_basis: "OURS",
        packaging: "SINGLE",
        home_territory_id: territories[0]?.id ?? 1,
        acquisition_date: null,
        condition: "EMPTY",
      });
      setConflictError(null);
    }
  }, [open, reset, territories]);

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createCylinder(values, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cylinders"] });
      onClose();
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        error.code === "DUPLICATE_SERIAL_FOR_OWNER"
      ) {
        setConflictError(translate("errors.duplicate_serial"));
        return;
      }
      if (!applyServerErrors(error, setError, "serial_number")) {
        setConflictError(
          error instanceof ApiClientError
            ? error.message
            : translate("errors.generic"),
        );
      }
    },
  });

  const createLocation = useMutation({
    mutationFn: async () => {
      const name = createName.trim();
      if (!name) throw new Error("empty");
      if (createKind === "territory") {
        return {
          kind: "territory" as const,
          row: await api.createTerritory({ name }),
        };
      }
      return {
        kind: "locality" as const,
        row: await api.createLocality({
          name,
          province: "Buenos Aires",
          territory_id:
            createTerritoryId === "" ? null : Number(createTerritoryId),
        }),
      };
    },
    onSuccess: async (result) => {
      await refetchLocations();
      await queryClient.invalidateQueries({ queryKey: ["territories"] });
      await queryClient.invalidateQueries({ queryKey: ["localities"] });
      if (result.kind === "territory") {
        setValue("home_territory_id", result.row.id, { shouldDirty: true });
      } else if (result.row.territory_id != null) {
        setValue("home_territory_id", result.row.territory_id, {
          shouldDirty: true,
        });
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateError(null);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "empty") {
        setCreateError(translate("cylinders.form.location_name_required"));
        return;
      }
      if (error instanceof ApiClientError) {
        if (
          error.code === "DUPLICATE_TERRITORY" ||
          error.code === "DUPLICATE_LOCALITY"
        ) {
          setCreateError(translate("errors.duplicate_location"));
          return;
        }
        setCreateError(error.message);
        return;
      }
      setCreateError(translate("errors.generic"));
    },
  });

  const handleClose = () => {
    if (isDirty && !window.confirm(translate("cylinders.form.unsaved_confirm")))
      return;
    onClose();
  };

  const openCreateDialog = (kind: CreateLocationKind) => {
    setCreateKind(kind);
    setCreateName("");
    setCreateTerritoryId(territories[0]?.id ?? "");
    setCreateError(null);
    setCreateOpen(true);
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={handleClose}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit((value) => create.mutate(value))}
          sx={{
            p: 3,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography variant="h6" sx={{ mb: 2 }}>
            {translate("cylinders.form.title_create")}
          </Typography>

          {conflictError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {conflictError}
            </Alert>
          )}

          <Stack spacing={2} sx={{ flex: 1, overflow: "auto" }}>
            <Controller
              name="serial_number"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  required
                  label={translate("cylinders.form.serial")}
                  fullWidth
                  error={Boolean(errors.serial_number)}
                  helperText={errors.serial_number?.message}
                />
              )}
            />

            <Controller
              name="owner_party_id"
              control={control}
              render={({ field }) => (
                <FormControl
                  fullWidth
                  required
                  error={Boolean(errors.owner_party_id)}
                >
                  <InputLabel>{translate("cylinders.form.owner")}</InputLabel>
                  <Select
                    label={translate("cylinders.form.owner")}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(Number(event.target.value))
                    }
                  >
                    {SEED_OWNERS.map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.owner_party_id && (
                    <FormHelperText>
                      {errors.owner_party_id.message}
                    </FormHelperText>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="ownership_basis"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth required>
                  <InputLabel>{translate("cylinders.form.basis")}</InputLabel>
                  <Select
                    {...field}
                    label={translate("cylinders.form.basis")}
                    disabled
                  >
                    {OwnershipBasis.options.map((value) => (
                      <MenuItem key={value} value={value}>
                        {translate(`enums.basis.${value}`)}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {translate("cylinders.form.basis_hint")}
                  </FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="gas_code"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>{translate("cylinders.form.gas")}</InputLabel>
                  <Select
                    label={translate("cylinders.form.gas")}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  >
                    {GAS_CODES.map((code) => (
                      <MenuItem key={code} value={code}>
                        {translate(`enums.gas.${code}`, { defaultValue: code })}
                      </MenuItem>
                    ))}
                  </Select>
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
                  <InputLabel>
                    {translate("cylinders.form.territory")}
                  </InputLabel>
                  <Select
                    label={translate("cylinders.form.territory")}
                    value={field.value ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "__create_territory__") {
                        openCreateDialog("territory");
                        return;
                      }
                      if (value === "__create_locality__") {
                        openCreateDialog("locality");
                        return;
                      }
                      field.onChange(value === "" ? null : Number(value));
                    }}
                  >
                    {territories.map((territory) => (
                      <MenuItem key={territory.id} value={territory.id}>
                        {territory.name}
                      </MenuItem>
                    ))}
                    <MenuItem value="__create_territory__">
                      {translate("cylinders.form.create_territory")}
                    </MenuItem>
                    <MenuItem value="__create_locality__">
                      {translate("cylinders.form.create_locality")}
                    </MenuItem>
                  </Select>
                  <FormHelperText>
                    {translate("cylinders.form.territory_hint")}
                  </FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="condition"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>
                    {translate("cylinders.form.condition")}
                  </InputLabel>
                  <Select
                    {...field}
                    label={translate("cylinders.form.condition")}
                  >
                    <MenuItem value="EMPTY">
                      {translate("enums.condition.EMPTY")}
                    </MenuItem>
                    <MenuItem value="FULL">
                      {translate("enums.condition.FULL")}
                    </MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Stack>

          <Stack
            direction="row"
            spacing={2}
            justifyContent="flex-end"
            sx={{ pt: 2 }}
          >
            <Button onClick={handleClose}>{translate("actions.cancel")}</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || create.isPending}
            >
              {translate("actions.save")}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {createKind === "territory"
            ? translate("cylinders.form.create_territory_title")
            : translate("cylinders.form.create_locality_title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {createError && <Alert severity="error">{createError}</Alert>}
            <TextField
              autoFocus
              label={translate("cylinders.form.location_name")}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              fullWidth
            />
            {createKind === "locality" && (
              <FormControl fullWidth>
                <InputLabel>{translate("cylinders.form.territory")}</InputLabel>
                <Select
                  label={translate("cylinders.form.territory")}
                  value={createTerritoryId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCreateTerritoryId(value === "" ? "" : Number(value));
                  }}
                >
                  <MenuItem value="">
                    {translate("clients.filters.all")}
                  </MenuItem>
                  {territories.map((territory) => (
                    <MenuItem key={territory.id} value={territory.id}>
                      {territory.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {translate("cylinders.form.locality_territory_hint")}
                </FormHelperText>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={createLocation.isPending}
            onClick={() => createLocation.mutate()}
          >
            {translate("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
