"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
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
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ClientCoverage,
  ClientSegment,
  CreateClientInput,
  type CreateClientInput as CreateClientInputType,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { SEED_TERRITORIES } from "../../constants/territories";
import { applyServerErrors } from "../../hooks/useServerErrors";
import { useSessionStore } from "../../store/sessionStore";

const COVERAGE_VALUES = ClientCoverage.options;
const SEGMENT_VALUES = ClientSegment.options;

interface CreateClientDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CreateClientDrawer({ open, onClose }: CreateClientDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const territoryScopes = user?.territory_scopes ?? [];
  const territories =
    territoryScopes.length > 0 ? territoryScopes : [...SEED_TERRITORIES];
  const defaultTerritoryId = territories[0]?.id ?? 1;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CreateClientInputType>({
    resolver: zodResolver(CreateClientInput),
    defaultValues: {
      name: "",
      cuit: null,
      address_street: null,
      territory_id: defaultTerritoryId,
      coverage: "PRIVATE",
      segment: null,
      delivery_instructions: null,
      contacts: [{ name: "", phone: "", is_primary: true }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  });

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        cuit: null,
        address_street: null,
        territory_id: defaultTerritoryId,
        coverage: "PRIVATE",
        segment: null,
        delivery_instructions: null,
        contacts: [{ name: "", phone: "", is_primary: true }],
      });
      setConflictError(null);
    }
  }, [open, reset, defaultTerritoryId]);

  const createMutation = useMutation({
    mutationFn: (input: CreateClientInputType) =>
      api.createClient(input, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
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

  const handleClose = () => {
    if (isDirty && !window.confirm(t("clients.form.unsaved_confirm"))) {
      return;
    }
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    setConflictError(null);
    createMutation.mutate(values);
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t("clients.form.title_create")}
        </Typography>

        {conflictError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {conflictError}
          </Alert>
        )}

        <Stack spacing={2} sx={{ flex: 1, overflow: "auto" }}>
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
                onChange={(event) => field.onChange(event.target.value || null)}
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
                onChange={(event) => field.onChange(event.target.value || null)}
                label={t("clients.form.address_street")}
                fullWidth
                error={Boolean(errors.address_street)}
                helperText={errors.address_street?.message}
              />
            )}
          />

          <Controller
            name="territory_id"
            control={control}
            render={({ field }) => (
              <FormControl
                fullWidth
                required
                error={Boolean(errors.territory_id)}
              >
                <InputLabel>{t("clients.form.territory")}</InputLabel>
                <Select
                  label={t("clients.form.territory")}
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                >
                  {territories.map((territory) => (
                    <MenuItem key={territory.id} value={territory.id}>
                      {territory.name}
                    </MenuItem>
                  ))}
                </Select>
                {errors.territory_id && (
                  <FormHelperText>{errors.territory_id.message}</FormHelperText>
                )}
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
                  <MenuItem value="">{t("clients.form.segment_none")}</MenuItem>
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
                onChange={(event) => field.onChange(event.target.value || null)}
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
              onClick={() => append({ name: "", phone: "", is_primary: false })}
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
            disabled={isSubmitting || createMutation.isPending}
          >
            {t("actions.save")}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
