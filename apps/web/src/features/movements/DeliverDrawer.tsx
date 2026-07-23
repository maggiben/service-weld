"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  CreateMovementInput,
  type Client,
  type CreateMovementInput as FormValues,
  type Cylinder,
  type MovementKind,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { GAS_CODES } from "../../constants/masters";
import { applyServerErrors } from "../../hooks/useServerErrors";
import {
  isRentalPickable,
  isRefillPickable,
  cylinderPickerLabel,
} from "./movementLogic";

interface Props {
  open: boolean;
  onClose: () => void;
  prefillCylinderId?: number;
  prefillHolderId?: number;
}

export function DeliverDrawer({
  open,
  onClose,
  prefillCylinderId,
  prefillHolderId,
}: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [cylinderQuery, setCylinderQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedCylinder, setSelectedCylinder] = useState<Cylinder | null>(
    null,
  );
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(CreateMovementInput),
    defaultValues: {
      cylinder_id: 0,
      holder_party_id: 0,
      movement_kind: "RENTAL",
      gas_code: null,
      delivery_date: dayjs().format("YYYY-MM-DD"),
      origin_party_id: null,
      remito_number: null,
      note: null,
    },
  });

  const movementKind = useWatch({
    control,
    name: "movement_kind",
  }) as MovementKind;

  const cylindersSearch = useQuery({
    queryKey: ["cylinders", "picker", "deliver", movementKind, cylinderQuery],
    queryFn: async () => {
      const query = cylinderQuery || undefined;
      if (movementKind === "REFILL") {
        const res = await api.listCylinders({
          q: query,
          limit: 30,
          "filter[ownership_basis]": "CUSTOMER",
        });
        return {
          data: res.data.filter(isRefillPickable),
          page: res.page,
        };
      }
      // Rental: only cylinders available to rent (in plant stock, not with a client).
      const res = await api.listCylinders({
        q: query,
        limit: 30,
        "filter[available_for_rental]": true,
      });
      return {
        data: res.data.filter(isRentalPickable),
        page: res.page,
      };
    },
    enabled: open,
  });

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", clientQuery],
    queryFn: () => api.listClients({ q: clientQuery || undefined, limit: 20 }),
    enabled: open && movementKind === "RENTAL",
  });

  const cylinderOptions = useMemo(() => {
    const fromSearch = cylindersSearch.data?.data ?? [];
    const selectedStillValid =
      selectedCylinder &&
      (movementKind === "RENTAL"
        ? isRentalPickable(selectedCylinder)
        : isRefillPickable(selectedCylinder));
    if (
      selectedStillValid &&
      !fromSearch.some((item) => item.id === selectedCylinder.id)
    ) {
      return [selectedCylinder, ...fromSearch];
    }
    return fromSearch;
  }, [cylindersSearch.data, selectedCylinder, movementKind]);

  const clientOptions = useMemo(() => {
    const fromSearch = clientsSearch.data?.data ?? [];
    if (
      selectedClient &&
      !fromSearch.some((item) => item.id === selectedClient.id)
    ) {
      return [selectedClient, ...fromSearch];
    }
    return fromSearch;
  }, [clientsSearch.data, selectedClient]);

  useEffect(() => {
    if (!selectedCylinder) return;
    setValue("gas_code", selectedCylinder.gas_code ?? null);
    // Recarga = siempre el dueño del cilindro (Su Propiedad); sin picker de cliente.
    if (
      movementKind === "REFILL" &&
      selectedCylinder.ownership_basis === "CUSTOMER" &&
      selectedCylinder.owner_party_id
    ) {
      setValue("holder_party_id", selectedCylinder.owner_party_id, {
        shouldDirty: true,
      });
    }
  }, [selectedCylinder, movementKind, setValue]);

  const onKindChange = (kind: MovementKind) => {
    setValue("movement_kind", kind);
    setSelectedCylinder(null);
    setValue("cylinder_id", 0);
    setCylinderQuery("");
    setConflictError(null);
    if (kind === "REFILL") {
      setSelectedClient(null);
      setValue("holder_party_id", 0);
      setClientQuery("");
    }
  };

  useEffect(() => {
    if (!open) return;
    reset({
      cylinder_id: prefillCylinderId ?? 0,
      holder_party_id: prefillHolderId ?? 0,
      movement_kind: "RENTAL",
      gas_code: null,
      delivery_date: dayjs().format("YYYY-MM-DD"),
      origin_party_id: null,
      remito_number: null,
      note: null,
    });
    setConflictError(null);
    setCylinderQuery("");
    setClientQuery("");
    setSelectedCylinder(null);
    setSelectedClient(null);
  }, [open, reset, prefillCylinderId, prefillHolderId]);

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createMovement(values, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        if (error.code === "CYLINDER_ALREADY_OUT") {
          setConflictError(translate("errors.cylinder_already_out"));
          return;
        }
        if (error.code === "CYLINDER_TERMINAL") {
          setConflictError(translate("errors.cylinder_terminal"));
          return;
        }
        if (error.code === "KIND_BASIS_MISMATCH") {
          setConflictError(translate("errors.kind_basis_mismatch"));
          return;
        }
      }
      if (!applyServerErrors(error, setError, "cylinder_id")) {
        setConflictError(
          error instanceof ApiClientError
            ? error.message
            : translate("errors.generic"),
        );
      }
    },
  });

  const handleClose = () => {
    if (isDirty && !window.confirm(translate("movements.form.unsaved_confirm")))
      return;
    onClose();
  };

  return (
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
        sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}
      >
        <Typography variant="h6" sx={{ mb: 1 }}>
          {movementKind === "REFILL"
            ? translate("movements.form.title_refill")
            : translate("movements.form.title_rental")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {translate("movements.form.kind_subtitle", {
            kind: translate(`enums.movement_kind.${movementKind}`),
          })}
        </Typography>

        {conflictError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {conflictError}
          </Alert>
        )}

        <Stack spacing={2} sx={{ flex: 1, overflow: "auto", pt: 0.5 }}>
          <Controller
            name="movement_kind"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <FormLabel sx={{ mb: 1 }}>
                  {translate("movements.form.kind")}
                </FormLabel>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  color="primary"
                  value={field.value}
                  onChange={(_, value: MovementKind | null) => {
                    if (value) onKindChange(value);
                  }}
                >
                  <ToggleButton value="RENTAL">
                    {translate("enums.movement_kind.RENTAL")}
                  </ToggleButton>
                  <ToggleButton value="REFILL">
                    {translate("enums.movement_kind.REFILL")}
                  </ToggleButton>
                </ToggleButtonGroup>
              </FormControl>
            )}
          />

          <Alert severity="info" sx={{ py: 0.5 }}>
            {movementKind === "REFILL"
              ? translate("movements.form.hint_refill")
              : translate("movements.form.hint_rental")}
          </Alert>

          <Controller
            name="cylinder_id"
            control={control}
            render={({ field }) => (
              <Autocomplete
                options={cylinderOptions}
                getOptionLabel={(option) =>
                  typeof option === "string"
                    ? option
                    : cylinderPickerLabel(option)
                }
                isOptionEqualToValue={(left, right) => left.id === right.id}
                getOptionDisabled={(option) =>
                  movementKind === "RENTAL"
                    ? !isRentalPickable(option)
                    : !isRefillPickable(option)
                }
                loading={cylindersSearch.isFetching}
                filterOptions={(opts) => opts}
                onInputChange={(_, value, reason) => {
                  if (reason !== "reset") setCylinderQuery(value);
                }}
                value={selectedCylinder}
                onChange={(_, value) => {
                  setSelectedCylinder(value);
                  field.onChange(value?.id ?? 0);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={translate("movements.form.cylinder")}
                    required
                    error={Boolean(errors.cylinder_id) || field.value === 0}
                    helperText={
                      errors.cylinder_id?.message ??
                      (movementKind === "REFILL"
                        ? translate("movements.form.cylinder_hint_refill")
                        : translate("movements.form.cylinder_hint_rental"))
                    }
                  />
                )}
              />
            )}
          />

          {movementKind === "REFILL" ? (
            <TextField
              label={translate("movements.form.owner_client")}
              value={
                selectedCylinder?.owner_name ??
                (selectedCylinder ? `#${selectedCylinder.owner_party_id}` : "")
              }
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={translate("movements.form.owner_client_hint")}
              placeholder={translate("movements.form.owner_client_placeholder")}
            />
          ) : (
            <Controller
              name="holder_party_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={clientOptions}
                  getOptionLabel={(option) =>
                    typeof option === "string" ? option : option.name
                  }
                  isOptionEqualToValue={(left, right) => left.id === right.id}
                  loading={clientsSearch.isFetching}
                  filterOptions={(opts) => opts}
                  onInputChange={(_, value, reason) => {
                    if (reason !== "reset") setClientQuery(value);
                  }}
                  value={selectedClient}
                  onChange={(_, value) => {
                    setSelectedClient(value);
                    field.onChange(value?.id ?? 0);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={translate("movements.form.holder")}
                      required
                      error={
                        Boolean(errors.holder_party_id) || field.value === 0
                      }
                      helperText={errors.holder_party_id?.message}
                    />
                  )}
                />
              )}
            />
          )}

          <Controller
            name="gas_code"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>{translate("movements.form.gas")}</InputLabel>
                <Select
                  label={translate("movements.form.gas")}
                  value={field.value ?? ""}
                  displayEmpty
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
                >
                  <MenuItem value="">
                    <em>—</em>
                  </MenuItem>
                  {GAS_CODES.map((code) => (
                    <MenuItem key={code} value={code}>
                      {code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            name="delivery_date"
            control={control}
            render={({ field }) => (
              <DatePicker
                label={
                  movementKind === "REFILL"
                    ? translate("movements.form.refill_date")
                    : translate("movements.form.delivery_date")
                }
                value={field.value ? dayjs(field.value) : null}
                onChange={(value: Dayjs | null) =>
                  field.onChange(value ? value.format("YYYY-MM-DD") : "")
                }
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: Boolean(errors.delivery_date),
                    helperText: errors.delivery_date?.message,
                  },
                }}
              />
            )}
          />

          <Controller
            name="note"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value || null)}
                label={translate("movements.form.note")}
                fullWidth
                multiline
                minRows={2}
              />
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
  );
}
