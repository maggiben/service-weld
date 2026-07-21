"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ClientCoverage,
  ClientSegment,
  CreateClientInput,
  type Client,
  type CreateClientInput as CreateClientInputType,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { useLocations } from "../../hooks/useLocations";
import { applyServerErrors } from "../../hooks/useServerErrors";

const COVERAGE_VALUES = ClientCoverage.options;
const SEGMENT_VALUES = ClientSegment.options;
const CREATE_CITY_VALUE = "__create_city__";

interface CreateClientDrawerProps {
  open: boolean;
  onClose: () => void;
  /** When set, the drawer edits this client instead of creating a new one. */
  client?: Client | null;
}

function toFormValues(
  client: Client | null | undefined,
  defaultTerritoryId: number,
): CreateClientInputType {
  if (!client) {
    return {
      name: "",
      cuit: null,
      address_street: null,
      locality_id: null,
      territory_id: defaultTerritoryId,
      coverage: "PRIVATE",
      segment: null,
      delivery_instructions: null,
      contacts: [{ name: "", phone: "", is_primary: true }],
    };
  }

  const contacts =
    client.contacts?.map((contact) => ({
      name: contact.name ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? null,
      is_primary: contact.is_primary,
    })) ?? [];

  return {
    name: client.name,
    cuit: client.cuit,
    address_street: client.address_street,
    locality_id: client.locality_id,
    territory_id: client.territory_id,
    coverage: client.coverage,
    segment: client.segment,
    delivery_instructions: client.delivery_instructions,
    contacts:
      contacts.length > 0
        ? contacts
        : [{ name: "", phone: "", is_primary: true }],
  };
}

export function CreateClientDrawer({
  open,
  onClose,
  client = null,
}: CreateClientDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { territories, localities, refetch: refetchLocations } = useLocations();
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [createCityOpen, setCreateCityOpen] = useState(false);
  const [createCityName, setCreateCityName] = useState("");
  const [createCityTerritoryId, setCreateCityTerritoryId] = useState<
    number | ""
  >("");
  const [createCityError, setCreateCityError] = useState<string | null>(null);
  const isEdit = client != null;

  const defaultTerritoryId = territories[0]?.id ?? 1;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreateClientInputType>({
    resolver: zodResolver(CreateClientInput),
    defaultValues: toFormValues(null, defaultTerritoryId),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  });

  const localityId = watch("locality_id");

  /** Cities already used by clients, plus the one currently selected. */
  const cityOptions = useMemo(() => {
    const fromClients = localities.filter(
      (locality) => (locality.client_count ?? 0) > 0,
    );
    if (localityId == null) return fromClients;
    if (fromClients.some((locality) => locality.id === localityId)) {
      return fromClients;
    }
    const selected = localities.find((locality) => locality.id === localityId);
    return selected ? [...fromClients, selected] : fromClients;
  }, [localities, localityId]);

  useEffect(() => {
    if (open) {
      reset(toFormValues(client, defaultTerritoryId));
      setConflictError(null);
      setCreateCityOpen(false);
      setCreateCityError(null);
    }
  }, [open, reset, defaultTerritoryId, client]);

  const invalidateClientQueries = async (clientId?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["localities"] }),
      refetchLocations(),
      ...(clientId != null
        ? [
            queryClient.invalidateQueries({ queryKey: ["client", clientId] }),
            queryClient.invalidateQueries({
              queryKey: ["client-account", clientId],
            }),
          ]
        : []),
    ]);
  };

  const applyCity = (
    localityIdValue: number | null,
    territoryIdValue: number,
  ) => {
    setValue("locality_id", localityIdValue, { shouldDirty: true });
    setValue("territory_id", territoryIdValue, { shouldDirty: true });
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateClientInputType) =>
      api.createClient(input, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await invalidateClientQueries();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.httpStatus === 409) {
        if (error.code === "DUPLICATE_CUIT") {
          setConflictError(t("errors.duplicate_cuit"));
          return;
        }
      }
      if (!applyServerErrors(error, setError, "name")) {
        setConflictError(t("errors.generic"));
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: CreateClientInputType) => {
      if (!client) {
        throw new Error("Missing client for update");
      }
      return api.updateClient(client.id, input, { ifMatch: client.version });
    },
    onSuccess: async (updated) => {
      await invalidateClientQueries(updated.id);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.httpStatus === 409) {
        if (error.code === "DUPLICATE_CUIT") {
          setConflictError(t("errors.duplicate_cuit"));
          return;
        }
        if (error.code === "VERSION_CONFLICT") {
          setConflictError(t("errors.version_conflict"));
          return;
        }
      }
      if (!applyServerErrors(error, setError, "name")) {
        setConflictError(t("errors.generic"));
      }
    },
  });

  const createCityMutation = useMutation({
    mutationFn: async () => {
      const name = createCityName.trim();
      if (!name) throw new Error("empty");
      if (createCityTerritoryId === "") throw new Error("territory");
      return api.createLocality({
        name,
        province: "Buenos Aires",
        territory_id: Number(createCityTerritoryId),
      });
    },
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["localities"] });
      await refetchLocations();
      applyCity(row.id, row.territory_id ?? Number(createCityTerritoryId));
      setCreateCityOpen(false);
      setCreateCityName("");
      setCreateCityError(null);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "empty") {
        setCreateCityError(t("clients.form.city_name_required"));
        return;
      }
      if (error instanceof Error && error.message === "territory") {
        setCreateCityError(t("clients.form.city_depot_required"));
        return;
      }
      if (error instanceof ApiClientError) {
        if (error.code === "DUPLICATE_LOCALITY") {
          setCreateCityError(t("errors.duplicate_location"));
          return;
        }
        setCreateCityError(error.message);
        return;
      }
      setCreateCityError(t("errors.generic"));
    },
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  const handleClose = () => {
    if (isDirty && !window.confirm(t("clients.form.unsaved_confirm"))) {
      return;
    }
    onClose();
  };

  const openCreateCity = () => {
    setCreateCityName("");
    setCreateCityTerritoryId(territories[0]?.id ?? "");
    setCreateCityError(null);
    setCreateCityOpen(true);
  };

  const onSubmit = handleSubmit((values) => {
    setConflictError(null);
    if (isEdit) {
      updateMutation.mutate(values);
      return;
    }
    createMutation.mutate(values);
  });

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
          onSubmit={onSubmit}
          sx={{
            p: 3,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t(
              isEdit ? "clients.form.title_edit" : "clients.form.title_create",
            )}
          </Typography>

          {conflictError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {conflictError}
            </Alert>
          )}

          <Stack spacing={2} sx={{ flex: 1, overflow: "auto", pt: 0.5 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t("clients.form.name")}
                  required
                  fullWidth
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="cuit"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
                  label={t("clients.form.cuit")}
                  fullWidth
                  error={Boolean(errors.cuit)}
                  helperText={errors.cuit?.message}
                />
              )}
            />

            <Controller
              name="address_street"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
                  label={t("clients.form.address_street")}
                  fullWidth
                  error={Boolean(errors.address_street)}
                  helperText={errors.address_street?.message}
                />
              )}
            />

            <Controller
              name="locality_id"
              control={control}
              render={({ field }) => (
                <FormControl
                  fullWidth
                  error={Boolean(errors.locality_id || errors.territory_id)}
                >
                  <InputLabel>{t("clients.form.territory")}</InputLabel>
                  <Select
                    label={t("clients.form.territory")}
                    value={field.value ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === CREATE_CITY_VALUE) {
                        openCreateCity();
                        return;
                      }
                      if (value === "") {
                        applyCity(null, defaultTerritoryId);
                        return;
                      }
                      const id = Number(value);
                      const locality = localities.find((row) => row.id === id);
                      applyCity(
                        id,
                        locality?.territory_id ?? defaultTerritoryId,
                      );
                    }}
                  >
                    <MenuItem value="">
                      {t("clients.form.locality_none")}
                    </MenuItem>
                    {cityOptions.map((locality) => (
                      <MenuItem key={locality.id} value={locality.id}>
                        {locality.name}
                        {locality.client_count != null &&
                        locality.client_count > 0
                          ? ` (${locality.client_count})`
                          : ""}
                      </MenuItem>
                    ))}
                    <MenuItem value={CREATE_CITY_VALUE}>
                      {t("clients.form.create_city")}
                    </MenuItem>
                  </Select>
                  <FormHelperText>
                    {errors.locality_id?.message ||
                      errors.territory_id?.message ||
                      t("clients.form.territory_hint")}
                  </FormHelperText>
                </FormControl>
              )}
            />

            <Controller
              name="coverage"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={Boolean(errors.coverage)}>
                  <InputLabel>{t("clients.form.coverage")}</InputLabel>
                  <Select {...field} label={t("clients.form.coverage")}>
                    {COVERAGE_VALUES.map((value) => (
                      <MenuItem key={value} value={value}>
                        {t(`enums.coverage.${value}`)}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.coverage && (
                    <FormHelperText>{errors.coverage.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="segment"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={Boolean(errors.segment)}>
                  <InputLabel>{t("clients.form.segment")}</InputLabel>
                  <Select
                    label={t("clients.form.segment")}
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  >
                    <MenuItem value="">
                      {t("clients.form.segment_none")}
                    </MenuItem>
                    {SEGMENT_VALUES.map((value) => (
                      <MenuItem key={value} value={value}>
                        {t(`enums.segment.${value}`)}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.segment && (
                    <FormHelperText>{errors.segment.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="delivery_instructions"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) =>
                    field.onChange(event.target.value || null)
                  }
                  label={t("clients.form.delivery_instructions")}
                  fullWidth
                  multiline
                  minRows={2}
                  error={Boolean(errors.delivery_instructions)}
                  helperText={errors.delivery_instructions?.message}
                />
              )}
            />

            <Divider />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="subtitle2">
                {t("clients.form.contacts")}
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  append({ name: "", phone: "", is_primary: false })
                }
              >
                {t("clients.form.add_contact")}
              </Button>
            </Stack>

            {fields.map((field, index) => (
              <Stack
                key={field.id}
                spacing={1}
                direction="row"
                alignItems="flex-start"
              >
                <Controller
                  name={`contacts.${index}.name`}
                  control={control}
                  render={({ field: contactField }) => (
                    <TextField
                      {...contactField}
                      value={contactField.value ?? ""}
                      label={t("clients.form.contact_name")}
                      fullWidth
                      error={Boolean(errors.contacts?.[index]?.name)}
                      helperText={errors.contacts?.[index]?.name?.message}
                    />
                  )}
                />
                <Controller
                  name={`contacts.${index}.phone`}
                  control={control}
                  render={({ field: contactField }) => (
                    <TextField
                      {...contactField}
                      value={contactField.value ?? ""}
                      label={t("clients.form.contact_phone")}
                      fullWidth
                      error={Boolean(errors.contacts?.[index]?.phone)}
                      helperText={errors.contacts?.[index]?.phone?.message}
                    />
                  )}
                />
                <Controller
                  name={`contacts.${index}.is_primary`}
                  control={control}
                  render={({ field: contactField }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={contactField.value}
                          onChange={(event) =>
                            contactField.onChange(event.target.checked)
                          }
                        />
                      }
                      label={t("clients.form.contact_primary")}
                    />
                  )}
                />
                {fields.length > 1 && (
                  <IconButton
                    aria-label={t("clients.form.remove_contact")}
                    onClick={() => remove(index)}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Stack>
            ))}
            {errors.contacts?.message && (
              <FormHelperText error>{errors.contacts.message}</FormHelperText>
            )}
          </Stack>

          <Stack
            direction="row"
            spacing={2}
            justifyContent="flex-end"
            sx={{ pt: 2 }}
          >
            <Button onClick={handleClose}>{t("actions.cancel")}</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || pending}
            >
              {t("actions.save")}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      <Dialog
        open={createCityOpen}
        onClose={() => setCreateCityOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("clients.form.create_city_title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {createCityError && (
              <Alert severity="error">{createCityError}</Alert>
            )}
            <TextField
              autoFocus
              label={t("clients.form.city_name")}
              value={createCityName}
              onChange={(event) => setCreateCityName(event.target.value)}
              fullWidth
            />
            <FormControl fullWidth required>
              <InputLabel>{t("clients.form.city_depot")}</InputLabel>
              <Select
                label={t("clients.form.city_depot")}
                value={createCityTerritoryId}
                onChange={(event) => {
                  const value = event.target.value;
                  setCreateCityTerritoryId(value === "" ? "" : Number(value));
                }}
              >
                {territories.map((territory) => (
                  <MenuItem key={territory.id} value={territory.id}>
                    {territory.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {t("clients.form.city_depot_hint")}
              </FormHelperText>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateCityOpen(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={createCityMutation.isPending}
            onClick={() => createCityMutation.mutate()}
          >
            {t("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
